import type {
	ParseResult,
	ThemePackageV0,
	ThemeSurfaceBackgroundV0,
	ThemeSurfaceNameV0,
	ThemeTokensV0,
} from "@amll-ttml-tool/plugin-api";
import {
	isSafeThemeColor,
	parseThemePackage,
	substituteThemeAssetUrls,
	THEME_SURFACE_NAMES_V0,
	validateThemeTokens,
} from "@amll-ttml-tool/plugin-api";
import type { StoreInstallationProvenance } from "../extensions/installation-provenance";
import { compileThemeTokensCss } from "./token-css";
import type {
	RegisteredTheme,
	SafeModeReason,
	ThemeServicePorts,
	ThemeServiceState,
	ThemeSummary,
	UserSurfaceImage,
} from "./types";

const STORAGE_KEYS = {
	active: "amll.theme.v0.active",
	userTokens: "amll.theme.v0.userTokens",
	safeMode: "amll.theme.v0.safeMode",
	applyPending: "amll.theme.v0.applyPending",
	installed: "amll.theme.v0.installed",
} as const;

/**
 * Owns theme selection, preview, safe mode, user token overrides and the
 * asset URL lifecycle. Everything host-specific (DOM style tags, Blob URLs,
 * localStorage) stays behind ports so the whole state machine is testable in
 * Node. Only validated packages (parseThemePackage) ever reach the sinks.
 */
export class ThemeService {
	private readonly themes = new Map<string, RegisteredTheme>();
	private readonly listeners = new Set<() => void>();
	private active = new Map<string, { id: string; appliedAt: number }>();
	private pendingActive: { id: string; appliedAt: number }[] = [];
	private conflicts: { scope: string; previousId: string; nextId: string }[] =
		[];
	private get activeThemeId(): string | null {
		return this.active.get("global")?.id ?? null;
	}
	private scopeOf(id: string): string {
		const scope = this.themes.get(id)?.pkg.manifest.scope;
		return typeof scope === "object" ? scope.pluginId : "global";
	}
	refreshDependencies(): void {
		this.render();
	}
	isActive(id: string): boolean {
		return [...this.active.values()].some((entry) => entry.id === id);
	}
	private persistActive(entries = [...this.active.values()]): void {
		if (!entries.length) this.ports.storage.remove(STORAGE_KEYS.active);
		else
			this.ports.storage.set(
				STORAGE_KEYS.active,
				entries.length === 1 && this.scopeOf(entries[0].id) === "global"
					? entries[0].id
					: JSON.stringify(entries),
			);
	}
	private restoreActive(): void {
		for (const entry of [...this.pendingActive].sort(
			(a, b) => a.appliedAt - b.appliedAt,
		)) {
			if (!this.themes.has(entry.id)) continue;
			const scope = this.scopeOf(entry.id);
			const previous = this.active.get(scope);
			if (previous && previous.id !== entry.id) {
				const incomingWins = entry.appliedAt >= previous.appliedAt;
				this.conflicts.push({
					scope,
					previousId: incomingWins ? previous.id : entry.id,
					nextId: incomingWins ? entry.id : previous.id,
				});
				if (!incomingWins) continue;
			}
			this.active.set(scope, entry);
		}
		this.pendingActive = this.pendingActive.filter(
			(entry) => !this.themes.has(entry.id),
		);
	}
	resolveConflict(undo: boolean): void {
		const conflict = this.conflicts[0];
		if (!conflict) return;
		const next = new Map(this.active);
		if (
			undo &&
			next.get(conflict.scope)?.id === conflict.nextId &&
			this.themes.has(conflict.previousId)
		) {
			this.assertDependencies(conflict.previousId);
			next.set(conflict.scope, {
				id: conflict.previousId,
				appliedAt: Date.now(),
			});
		}
		this.persistActive([...next.values()]);
		this.active = next;
		this.conflicts.shift();
		this.render();
	}
	deactivateTheme(id: string): void {
		const next = new Map(
			[...this.active].filter(([, entry]) => entry.id !== id),
		);
		this.persistActive([...next.values()]);
		this.active = next;
		this.pendingActive = this.pendingActive.filter((entry) => entry.id !== id);
		if (this.previewThemeId === id) this.previewThemeId = null;
		this.render();
	}
	private previewThemeId: string | null = null;
	private safeMode = false;
	private safeModeReason: SafeModeReason = null;
	private userTokens: ThemeTokensV0 | null = null;
	private userSurfaceImageResetVersion = 0;
	private userSurfaceImages = new Map<ThemeSurfaceNameV0, UserSurfaceImage>();
	private assetUrls: string[] = [];
	private initialized = false;
	private disposed = false;
	private stateSnapshot: ThemeServiceState | null = null;
	private packageQueue: Promise<unknown> = Promise.resolve();
	private enqueuePackage<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.packageQueue.then(operation);
		this.packageQueue = result.catch(() => undefined);
		return result;
	}

	constructor(private readonly ports: ThemeServicePorts) {}

	/** Registers a trusted built-in theme; still runs full package validation. */
	registerBuiltinTheme(input: unknown): ParseResult<ThemePackageV0> {
		const parsed = parseThemePackage(input);
		if (!parsed.ok) return parsed;
		this.themes.set(parsed.value.manifest.id, {
			pkg: parsed.value,
			source: "builtin",
		});
		if (this.initialized) this.render();
		return parsed;
	}

	/**
	 * Restores persisted state. If the previous session died before
	 * confirmStartupStable() cleared the apply marker, the service boots into
	 * safe mode so a broken theme can never survive a restart loop.
	 */
	initialize(options: { forceSafeMode?: boolean } = {}): void {
		// Idempotent: a second call (React StrictMode double-mount) must not
		// re-read the apply marker the first call just set and misread it as
		// a crashed previous session.
		if (this.initialized) return;
		const { storage, warn } = this.ports;
		const crashed = storage.get(STORAGE_KEYS.applyPending) !== null;
		storage.remove(STORAGE_KEYS.applyPending);
		if (crashed) {
			this.safeMode = true;
			this.safeModeReason = "crash";
			storage.set(STORAGE_KEYS.safeMode, "1");
		} else if (options.forceSafeMode) {
			this.safeMode = true;
			this.safeModeReason = "forced";
		} else if (storage.get(STORAGE_KEYS.safeMode) === "1") {
			this.safeMode = true;
			this.safeModeReason = "user";
		}

		const installedRaw = storage.get(STORAGE_KEYS.installed);
		// With an async package store the legacy synchronous JSON is only a
		// migration source, consumed in hydrateInstalledThemes(); reading it
		// here too would double-register and re-persist stale entries.
		if (installedRaw !== null && this.ports.packageStore === undefined) {
			try {
				const entries: unknown = JSON.parse(installedRaw);
				for (const entry of Array.isArray(entries) ? entries : []) {
					const parsed = parseThemePackage(entry);
					if (!parsed.ok) {
						warn?.("Skipping an installed theme that failed validation");
						continue;
					}
					if (!this.themes.has(parsed.value.manifest.id))
						this.themes.set(parsed.value.manifest.id, {
							pkg: parsed.value,
							source: "installed",
						});
				}
			} catch {
				warn?.("Installed theme store is corrupted; ignoring it");
			}
		}

		const userTokensRaw = storage.get(STORAGE_KEYS.userTokens);
		if (userTokensRaw !== null) {
			try {
				const parsed = validateThemeTokens(JSON.parse(userTokensRaw));
				if (parsed.ok) this.userTokens = parsed.value;
				else warn?.("Stored user token overrides failed validation");
			} catch {
				warn?.("Stored user token overrides are corrupted");
			}
		}

		const rawActive = storage.get(STORAGE_KEYS.active);
		if (rawActive !== null && !this.safeMode) {
			try {
				const entries = rawActive.startsWith("[")
					? JSON.parse(rawActive)
					: [{ id: rawActive, appliedAt: 0 }];
				this.pendingActive = entries.filter(
					(entry: { id?: unknown; appliedAt?: unknown }) =>
						typeof entry?.id === "string" &&
						typeof entry.appliedAt === "number" &&
						Number.isFinite(entry.appliedAt),
				);
				this.restoreActive();
			} catch {
				warn?.("Stored active themes are corrupted");
			}
		} else if (this.safeMode) storage.remove(STORAGE_KEYS.active);

		// Marker protocol: set before the first injection, cleared once the
		// host reports a stable startup. A crash in between means the next
		// launch comes up with the default look. With an async package store
		// the marker also covers an installed theme that only becomes active
		// after hydration.
		if (
			!this.safeMode &&
			(this.active.size > 0 || this.pendingActive.length > 0)
		)
			storage.set(STORAGE_KEYS.applyPending, "1");
		this.initialized = true;
		this.render();
	}

	/**
	 * Loads installed theme packages from the async package store, migrating
	 * the legacy localStorage JSON into it once. Re-resolves the persisted
	 * active theme, which may reference a just-hydrated package.
	 */
	async hydrateInstalledThemes(): Promise<void> {
		const { storage, packageStore, warn } = this.ports;
		if (packageStore === undefined) return;
		const legacyRaw = storage.get(STORAGE_KEYS.installed);
		if (legacyRaw !== null) {
			try {
				const entries: unknown = JSON.parse(legacyRaw);
				for (const entry of Array.isArray(entries) ? entries : []) {
					const parsed = parseThemePackage(entry);
					if (!parsed.ok) {
						warn?.("Skipping a legacy installed theme that failed validation");
						continue;
					}
					// JSON round-trip drops undefined-valued keys the parser may have
					// produced (e.g. styles), which would fail re-validation on load.
					await packageStore.save(
						parsed.value.manifest.id,
						JSON.parse(JSON.stringify(parsed.value)),
					);
				}
				storage.remove(STORAGE_KEYS.installed);
				warn?.(
					"Migrated installed themes from localStorage to the package store",
				);
			} catch (error) {
				warn?.("Legacy theme migration failed; keeping the original for retry");
				throw error;
			}
		}
		const records = await packageStore.loadAll();
		if (this.disposed) return;
		for (const record of records) {
			const parsed = parseThemePackage(record.pkg);
			if (!parsed.ok) {
				warn?.(`Skipping installed theme ${record.id}: failed validation`);
				continue;
			}
			if (!this.themes.has(parsed.value.manifest.id))
				this.themes.set(parsed.value.manifest.id, {
					pkg: parsed.value,
					source: "installed",
					store: record.store,
					installedAt: record.installedAt,
				});
		}
		this.restoreActive();
		if (this.initialized) this.render();
	}

	/** The host calls this once the UI has mounted and survived startup. */
	confirmStartupStable(): void {
		this.ports.storage.remove(STORAGE_KEYS.applyPending);
	}

	listThemes(): ThemeSummary[] {
		return [...this.themes.values()].map(
			({ pkg, source, store, installedAt }) => ({
				id: pkg.manifest.id,
				name: pkg.manifest.name,
				version: pkg.manifest.version,
				description: pkg.manifest.description,
				appearance: pkg.manifest.appearance,
				scope: this.scopeOf(pkg.manifest.id),
				disabledByDependency:
					this.ports.checkDependencies?.(pkg.manifest, false) ?? undefined,
				source,
				store,
				installedAt,
			}),
		);
	}

	dependencyNodes() {
		return [...this.themes.values()].map(({ pkg }) => ({
			...pkg.manifest,
			enabled: this.isActive(pkg.manifest.id) && !this.safeMode,
			ready: this.isActive(pkg.manifest.id) && !this.safeMode,
		}));
	}

	private assertDependencies(id: string) {
		const theme = this.themes.get(id);
		if (!theme) throw new Error(`Unknown theme ${id}`);
		const parsed = this.validateTargetParts(theme.pkg);
		if (!parsed.ok)
			throw new Error(parsed.issues.map((issue) => issue.message).join("; "));
		const error = this.ports.checkDependencies?.(theme.pkg.manifest, true);
		if (error) throw new Error(error);
	}

	/** Awaited compensation for a store batch, including metadata and selection. */
	checkpoint(id: string): () => Promise<void> {
		const previous = this.themes.get(id);
		const active = new Map(this.active);
		const pending = [...this.pendingActive];
		const conflicts = [...this.conflicts];
		const preview = this.previewThemeId;
		return async () => {
			if (previous?.source === "installed") {
				await this.ports.packageStore?.save(
					id,
					JSON.parse(JSON.stringify(previous.pkg)),
					{
						store: previous.store,
						installedAt: previous.installedAt,
					},
				);
			} else await this.ports.packageStore?.remove(id);
			if (previous) this.themes.set(id, previous);
			else this.themes.delete(id);
			if (!this.ports.packageStore) this.persistInstalled();
			this.active = new Map(active);
			this.pendingActive = pending;
			this.conflicts = conflicts;
			this.previewThemeId = preview;
			this.persistActive();
			this.render();
		};
	}

	getState(): ThemeServiceState {
		if (this.stateSnapshot === null)
			this.stateSnapshot = {
				activeThemeId: this.activeThemeId,
				activeThemeIds: [...this.active.values()].map((entry) => entry.id),
				conflict: this.conflicts[0]
					? {
							...this.conflicts[0],
							previousName:
								this.themes.get(this.conflicts[0].previousId)?.pkg.manifest
									.name ?? this.conflicts[0].previousId,
							nextName:
								this.themes.get(this.conflicts[0].nextId)?.pkg.manifest.name ??
								this.conflicts[0].nextId,
						}
					: null,
				previewThemeId: this.previewThemeId,
				safeMode: this.safeMode,
				safeModeReason: this.safeModeReason,
				hasUserOverrides: this.userTokens !== null,
				accentActive:
					(this.userTokens?.color?.accent ??
						this.activeThemeTokens()?.color?.accent) !== undefined,
				activeSurfaces: this.effectiveSurfaceNames(this.userSurfaceImages),
				userSurfaceImages: this.getUserSurfaceImages(),
				userSurfaceImageResetVersion: this.userSurfaceImageResetVersion,
			};
		return this.stateSnapshot;
	}

	getUserTokenOverrides(): ThemeTokensV0 | null {
		return this.userTokens;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	applyTheme(id: string | null): void {
		if (id !== null) this.assertDependencies(id);
		if (id !== null && !this.themes.has(id))
			throw new Error(`Unknown theme ${id}`);
		const next = new Map(this.active);
		const scope = id === null ? "global" : this.scopeOf(id);
		const previous = next.get(scope);
		if (id === null) next.clear();
		else
			next.set(scope, {
				id,
				appliedAt: Math.max(
					Date.now(),
					...[...next.values()].map((entry) => entry.appliedAt + 1),
				),
			});
		this.persistActive([...next.values()]);
		this.previewThemeId = null;
		this.pendingActive = [];
		this.active = next;
		if (id === null) this.conflicts = [];
		else if (previous && previous.id !== id)
			this.conflicts.push({ scope, previousId: previous.id, nextId: id });
		this.render();
	}

	/** Applies a theme without persisting it; cancelPreview() reverts. */
	previewTheme(id: string): void {
		this.assertDependencies(id);
		if (!this.themes.has(id)) throw new Error(`Unknown theme ${id}`);
		this.previewThemeId = id;
		this.render();
	}

	cancelPreview(): void {
		if (this.previewThemeId === null) return;
		this.previewThemeId = null;
		this.render();
	}

	/** Back to the default look: no theme, no user overrides, no images. */
	restoreDefaultTheme(): void {
		this.previewThemeId = null;
		this.active.clear();
		this.pendingActive = [];
		this.conflicts = [];
		this.userTokens = null;
		this.userSurfaceImageResetVersion += 1;
		this.userSurfaceImages = new Map();
		try {
			this.ports.storage.remove(STORAGE_KEYS.active);
			this.ports.storage.remove(STORAGE_KEYS.userTokens);
		} finally {
			// The rescue path must restore visible defaults even if disk is unavailable.
			this.render();
		}
	}

	setSafeMode(enabled: boolean): void {
		if (enabled) {
			this.active.clear();
			this.pendingActive = [];
			this.previewThemeId = null;
			this.conflicts = [];
			this.safeMode = true;
			this.safeModeReason = "user";
			try {
				this.ports.storage.set(STORAGE_KEYS.safeMode, "1");
				this.ports.storage.remove(STORAGE_KEYS.active);
			} finally {
				this.render();
			}
		} else {
			this.ports.storage.remove(STORAGE_KEYS.safeMode);
			this.safeMode = false;
			this.safeModeReason = null;
			this.render();
		}
	}

	/**
	 * Declarative user token overrides, injected into the amll.user layer so
	 * they beat any theme package value. Pass null to clear. Image surfaces
	 * are rejected here — user images go through setUserSurfaceImage. The
	 * modal fallback rule is checked against the combined theme + user
	 * configuration, so refining a theme's modal backgrounds is allowed.
	 */
	setUserTokenOverrides(input: unknown): ParseResult<ThemeTokensV0 | null> {
		if (input === null) {
			this.userTokens = null;
			this.ports.storage.remove(STORAGE_KEYS.userTokens);
			this.render();
			return { ok: true, value: null };
		}
		const parsed = validateThemeTokens(input, {
			requireModalFallbackChain: false,
		});
		if (!parsed.ok) return parsed;
		for (const [prefix, surfaces] of [
			["", parsed.value.surfaces],
			["/light", parsed.value.light?.surfaces],
			["/dark", parsed.value.dark?.surfaces],
		] as const) {
			for (const [name, surface] of Object.entries<
				ThemeSurfaceBackgroundV0 | undefined
			>(surfaces ?? {})) {
				if (surface?.kind === "image")
					return {
						ok: false,
						issues: [
							{
								path: `${prefix}/surfaces/${name}/kind`,
								message:
									"user overrides cannot declare image surfaces; pick an image through the surface editor instead",
							},
						],
					};
			}
		}
		const violation = this.modalRuleViolation(
			this.userSurfaceImages,
			parsed.value,
		);
		if (violation !== null)
			return { ok: false, issues: [{ path: "/surfaces", message: violation }] };
		this.userTokens = parsed.value;
		this.ports.storage.set(
			STORAGE_KEYS.userTokens,
			JSON.stringify(parsed.value),
		);
		this.render();
		return parsed;
	}

	private validateTargetParts(
		pkg: ThemePackageV0,
	): ParseResult<ThemePackageV0> {
		const scope = pkg.manifest.scope;
		return parseThemePackage(JSON.parse(JSON.stringify(pkg)), {
			targetParts:
				typeof scope === "object"
					? (this.ports.targetParts?.(scope.pluginId) ?? [])
					: [],
		});
	}

	private parseThemeImport(input: unknown): ParseResult<ThemePackageV0> {
		const parsed = parseThemePackage(input);
		if (!parsed.ok) return parsed;
		const checked = this.validateTargetParts(parsed.value);
		if (!checked.ok) return checked;
		const id = parsed.value.manifest.id;
		const dependencyError = this.ports.checkDependencies?.(
			parsed.value.manifest,
			false,
		);
		if (dependencyError)
			return {
				ok: false,
				issues: [{ path: "/manifest/dependencies", message: dependencyError }],
			};
		const existing = this.themes.get(id);
		const incomingScope =
			typeof parsed.value.manifest.scope === "object"
				? parsed.value.manifest.scope.pluginId
				: "global";
		if (existing && this.isActive(id) && this.scopeOf(id) !== incomingScope)
			return {
				ok: false,
				issues: [
					{
						path: "/manifest/scope",
						message: "deactivate the theme before changing its scope",
					},
				],
			};
		if (existing?.source === "builtin")
			return {
				ok: false,
				issues: [
					{
						path: "/manifest/id",
						message: `theme id ${id} is reserved by a built-in theme`,
					},
				],
			};
		return parsed;
	}

	/** Store installs publish only after durable storage has succeeded. */
	installThemePackage(
		input: unknown,
		store?: StoreInstallationProvenance,
	): Promise<ParseResult<ThemePackageV0>> {
		return this.enqueuePackage(() => this.installThemePackageOne(input, store));
	}
	private async installThemePackageOne(
		input: unknown,
		store?: StoreInstallationProvenance,
	): Promise<ParseResult<ThemePackageV0>> {
		const parsed = this.parseThemeImport(input);
		if (!parsed.ok) return parsed;
		const id = parsed.value.manifest.id;
		const metadata = {
			store: store ? { ...store } : undefined,
			installedAt: Date.now(),
		};
		if (this.ports.packageStore)
			await this.ports.packageStore.save(
				id,
				JSON.parse(JSON.stringify(parsed.value)),
				metadata,
			);
		else
			this.ports.storage.set(
				STORAGE_KEYS.installed,
				JSON.stringify([
					...[...this.themes.values()]
						.filter(
							(theme) =>
								theme.source === "installed" && theme.pkg.manifest.id !== id,
						)
						.map((theme) => theme.pkg),
					parsed.value,
				]),
			);
		this.themes.set(id, {
			pkg: parsed.value,
			source: "installed",
			...metadata,
		});
		this.render();
		return parsed;
	}

	/** Compatibility alias; all callers must await the durable install gate. */
	importThemePackage(
		input: unknown,
		store?: StoreInstallationProvenance,
	): Promise<ParseResult<ThemePackageV0>> {
		return this.installThemePackage(input, store);
	}

	removeInstalledTheme(id: string): Promise<void> {
		return this.enqueuePackage(() => this.removeInstalledThemeOne(id));
	}
	private async removeInstalledThemeOne(id: string): Promise<void> {
		const existing = this.themes.get(id);
		if (existing === undefined || existing.source !== "installed") return;
		const previousActive = this.ports.storage.get(STORAGE_KEYS.active);
		const remainingActive = new Map(
			[...this.active].filter(([, entry]) => entry.id !== id),
		);
		if (this.isActive(id)) this.persistActive([...remainingActive.values()]);
		try {
			if (this.ports.packageStore) await this.ports.packageStore.remove(id);
			else {
				const remaining = [...this.themes.values()]
					.filter(
						(theme) =>
							theme.source === "installed" && theme.pkg.manifest.id !== id,
					)
					.map((theme) => theme.pkg);
				if (remaining.length)
					this.ports.storage.set(
						STORAGE_KEYS.installed,
						JSON.stringify(remaining),
					);
				else this.ports.storage.remove(STORAGE_KEYS.installed);
			}
		} catch (error) {
			if (previousActive !== null)
				this.ports.storage.set(STORAGE_KEYS.active, previousActive);
			throw error;
		}
		this.themes.delete(id);
		if (this.previewThemeId === id) this.previewThemeId = null;
		this.active = remainingActive;
		this.pendingActive = this.pendingActive.filter((entry) => entry.id !== id);
		this.conflicts = this.conflicts.filter(
			(entry) => entry.previousId !== id && entry.nextId !== id,
		);
		this.render();
	}

	dispose(): void {
		this.disposed = true;
		this.revokeAssetUrls();
		this.ports.styles.setThemeCss("");
		this.ports.styles.setUserCss("");
		this.ports.styles.setFlags({ accent: false, surfaces: [] });
		this.listeners.clear();
	}

	/**
	 * Sets or clears a user-picked background image for one surface. Trusted
	 * host input only: the URL must be a local object URL the host created,
	 * and the user-selected scrim must be a safe color.
	 * The modal fallback rule (medium/small require large) is enforced
	 * against the combined theme + user configuration.
	 */
	setUserSurfaceImage(
		surface: ThemeSurfaceNameV0,
		image: UserSurfaceImage | null,
	): ParseResult<UserSurfaceImage | null> {
		const fail = (message: string): ParseResult<UserSurfaceImage | null> => ({
			ok: false,
			issues: [{ path: `/surfaces/${surface}`, message }],
		});
		if (!THEME_SURFACE_NAMES_V0.includes(surface))
			return fail("unknown surface");
		if (image !== null) {
			if (!/^blob:[^"'\\)\s]+$/.test(image.url))
				return fail("surface images must be local object URLs");
			if (
				image.opacity !== undefined &&
				(!Number.isFinite(image.opacity) ||
					image.opacity < 0 ||
					image.opacity > 1)
			)
				return fail("opacity must be between 0 and 1");
			if (image.scrim !== undefined && !isSafeThemeColor(image.scrim))
				return fail("unsafe scrim color");
		}
		const next = new Map(this.userSurfaceImages);
		if (image === null) next.delete(surface);
		else next.set(surface, image);
		const violation = this.modalRuleViolation(next);
		if (violation !== null) return fail(violation);
		this.userSurfaceImages = next;
		this.render();
		return { ok: true, value: image };
	}

	getUserSurfaceImages(): Readonly<
		Partial<Record<ThemeSurfaceNameV0, UserSurfaceImage>>
	> {
		return Object.fromEntries(this.userSurfaceImages);
	}

	private persistInstalled(): void {
		const installed = [...this.themes.values()]
			.filter((theme) => theme.source === "installed")
			.map((theme) => theme.pkg);
		if (installed.length === 0)
			this.ports.storage.remove(STORAGE_KEYS.installed);
		else
			this.ports.storage.set(STORAGE_KEYS.installed, JSON.stringify(installed));
	}

	private revokeAssetUrls(): void {
		for (const url of this.assetUrls) this.ports.assets.revoke(url);
		this.assetUrls = [];
	}

	private activeThemeTokens(): ThemeTokensV0 | null {
		const effectiveId =
			this.previewThemeId !== null &&
			this.scopeOf(this.previewThemeId) === "global"
				? this.previewThemeId
				: this.activeThemeId;
		const theme =
			effectiveId === null ? undefined : this.themes.get(effectiveId);
		return theme?.pkg.tokens ?? null;
	}

	/**
	 * Surfaces that are effectively configured across the active theme, user
	 * token overrides (a user "none" removes a theme surface) and user
	 * surface images. These names gate the static bridge CSS.
	 */
	private effectiveSurfaceNames(
		userImages: ReadonlyMap<ThemeSurfaceNameV0, UserSurfaceImage>,
		userTokens: ThemeTokensV0 | null = this.userTokens,
	): ThemeSurfaceNameV0[] {
		const themeTokens = this.activeThemeTokens();
		const active = new Set<ThemeSurfaceNameV0>();
		for (const [name, surface] of Object.entries<
			ThemeSurfaceBackgroundV0 | undefined
		>(themeTokens?.surfaces ?? {})) {
			if (surface !== undefined && surface.kind !== "none")
				active.add(name as ThemeSurfaceNameV0);
		}
		for (const [name, surface] of Object.entries<
			ThemeSurfaceBackgroundV0 | undefined
		>(userTokens?.surfaces ?? {})) {
			if (surface === undefined) continue;
			if (surface.kind === "none") active.delete(name as ThemeSurfaceNameV0);
			else active.add(name as ThemeSurfaceNameV0);
		}
		for (const name of userImages.keys()) active.add(name);
		return THEME_SURFACE_NAMES_V0.filter((name) => active.has(name));
	}

	private modalRuleViolation(
		userImages: ReadonlyMap<ThemeSurfaceNameV0, UserSurfaceImage>,
		userTokens: ThemeTokensV0 | null = this.userTokens,
	): string | null {
		const active = this.effectiveSurfaceNames(userImages, userTokens);
		if (
			(active.includes("modalMedium") || active.includes("modalSmall")) &&
			!active.includes("modalLarge")
		)
			return "modalMedium/modalSmall require modalLarge to be configured (backgrounds fall back small -> medium -> large)";
		return null;
	}

	private userSurfaceImageCss(): string {
		if (this.userSurfaceImages.size === 0) return "";
		const declarations: string[] = [];
		for (const [name, image] of this.userSurfaceImages) {
			const varName = `--attt-surface-${name.replace(
				/[A-Z]/g,
				(char) => `-${char.toLowerCase()}`,
			)}`;
			declarations.push(`${varName}-image: url("${image.url}");`);
			declarations.push(`${varName}-scrim: ${image.scrim ?? "initial"};`);
			declarations.push(`${varName}-opacity: ${image.opacity ?? 1};`);
		}
		return `:root {\n\t${declarations.join("\n\t")}\n}`;
	}

	private render(): void {
		if (this.disposed) return;
		this.revokeAssetUrls();
		if (this.safeMode) {
			this.ports.styles.setThemeCss("");
			this.ports.styles.setUserCss("");
			this.ports.styles.setFlags({ accent: false, surfaces: [] });
			this.notify();
			return;
		}
		const effective = new Map(this.active);
		if (this.previewThemeId)
			effective.set(this.scopeOf(this.previewThemeId), {
				id: this.previewThemeId,
				appliedAt: 0,
			});
		const sections: string[] = [];
		for (const [scope, { id }] of effective) {
			const theme = this.themes.get(id);
			if (!theme || !this.validateTargetParts(theme.pkg).ok) continue;
			// Presence/version failures disable dependency consumers; a disabled target
			// keeps its theme selected, but its host-owned view roots disappear.
			if (this.ports.checkDependencies?.(theme.pkg.manifest, false)) continue;
			const urls = new Map<string, string>();
			for (const [name, asset] of Object.entries(theme.pkg.assets ?? {}))
				urls.set(name, this.ports.assets.create(asset));
			this.assetUrls.push(...urls.values());
			const resolveAsset = (name: string) => urls.get(name) ?? null;
			const selector =
				scope === "global" ? undefined : `[data-amll-plugin-scope="${scope}"]`;
			const tokensCss = compileThemeTokensCss(theme.pkg.tokens, {
				resolveAsset,
				selector,
			});
			const stylesCss = Object.values(theme.pkg.styles ?? {})
				.map((css) => substituteThemeAssetUrls(css, resolveAsset))
				.join("\n");
			const css = [tokensCss, stylesCss].filter(Boolean).join("\n");
			// The lower boundary excludes nested plugin roots and protected host UI.
			sections.push(
				selector
					? `${tokensCss}\n@scope (${selector}) to ([data-amll-plugin-scope], [data-amll-protected]) {\n${stylesCss.replaceAll(selector, ":scope")}\n}`
					: css,
			);
		}
		this.ports.styles.setThemeCss(sections.join("\n"));
		const userCssSections = [
			this.userTokens === null
				? ""
				: compileThemeTokensCss(this.userTokens, {
						selector:
							":root, [data-amll-plugin-scope], [data-amll-plugin-scope] *",
					}),
			this.userSurfaceImageCss(),
		].filter(Boolean);
		this.ports.styles.setUserCss(userCssSections.join("\n"));

		// A theme switch can strand user modal surfaces without a large base;
		// drop the offending flags (the vars stay dormant) instead of leaving
		// most dialogs unstyled while claiming coverage.
		let surfaces = this.effectiveSurfaceNames(this.userSurfaceImages);
		if (this.modalRuleViolation(this.userSurfaceImages) !== null) {
			surfaces = surfaces.filter(
				(name) => name !== "modalMedium" && name !== "modalSmall",
			);
			this.ports.warn?.(
				"Dropping modalMedium/modalSmall surfaces: modalLarge is not configured",
			);
		}
		const accent =
			this.userTokens?.color?.accent ?? this.activeThemeTokens()?.color?.accent;
		this.ports.styles.setFlags({ accent: accent !== undefined, surfaces });
		this.notify();
	}

	private notify(): void {
		this.stateSnapshot = null;
		for (const listener of [...this.listeners]) listener();
	}
}
