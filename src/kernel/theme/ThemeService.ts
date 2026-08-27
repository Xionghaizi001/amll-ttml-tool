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
	private activeThemeId: string | null = null;
	/** Persisted active id awaiting async hydration of installed themes. */
	private pendingActiveId: string | null = null;
	private previewThemeId: string | null = null;
	private safeMode = false;
	private safeModeReason: SafeModeReason = null;
	private userTokens: ThemeTokensV0 | null = null;
	private userSurfaceImages = new Map<ThemeSurfaceNameV0, UserSurfaceImage>();
	private assetUrls: string[] = [];
	private initialized = false;
	private disposed = false;
	private stateSnapshot: ThemeServiceState | null = null;

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

		const activeId = storage.get(STORAGE_KEYS.active);
		this.pendingActiveId = activeId;
		this.activeThemeId =
			activeId !== null && this.themes.has(activeId) ? activeId : null;

		// Marker protocol: set before the first injection, cleared once the
		// host reports a stable startup. A crash in between means the next
		// launch comes up with the default look. With an async package store
		// the marker also covers an installed theme that only becomes active
		// after hydration.
		if (
			!this.safeMode &&
			(this.activeThemeId !== null ||
				(this.ports.packageStore !== undefined &&
					this.pendingActiveId !== null))
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
				warn?.("Migrated installed themes from localStorage to the package store");
			} catch {
				warn?.("Legacy installed theme store is corrupted; ignoring it");
				storage.remove(STORAGE_KEYS.installed);
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
				});
		}
		if (
			this.activeThemeId === null &&
			this.pendingActiveId !== null &&
			this.themes.has(this.pendingActiveId)
		)
			this.activeThemeId = this.pendingActiveId;
		if (this.initialized) this.render();
	}

	/** The host calls this once the UI has mounted and survived startup. */
	confirmStartupStable(): void {
		this.ports.storage.remove(STORAGE_KEYS.applyPending);
	}

	listThemes(): ThemeSummary[] {
		return [...this.themes.values()].map(({ pkg, source }) => ({
			id: pkg.manifest.id,
			name: pkg.manifest.name,
			description: pkg.manifest.description,
			appearance: pkg.manifest.appearance,
			source,
		}));
	}

	getState(): ThemeServiceState {
		if (this.stateSnapshot === null)
			this.stateSnapshot = {
				activeThemeId: this.activeThemeId,
				previewThemeId: this.previewThemeId,
				safeMode: this.safeMode,
				safeModeReason: this.safeModeReason,
				hasUserOverrides: this.userTokens !== null,
				accentActive:
					(this.userTokens?.color?.accent ??
						this.activeThemeTokens()?.color?.accent) !== undefined,
				activeSurfaces: this.effectiveSurfaceNames(this.userSurfaceImages),
				userSurfaceImages: this.getUserSurfaceImages(),
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
		if (id !== null && !this.themes.has(id))
			throw new Error(`Unknown theme ${id}`);
		this.previewThemeId = null;
		this.activeThemeId = id;
		this.pendingActiveId = id;
		if (id === null) this.ports.storage.remove(STORAGE_KEYS.active);
		else this.ports.storage.set(STORAGE_KEYS.active, id);
		this.render();
	}

	/** Applies a theme without persisting it; cancelPreview() reverts. */
	previewTheme(id: string): void {
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
		this.activeThemeId = null;
		this.pendingActiveId = null;
		this.userTokens = null;
		this.userSurfaceImages = new Map();
		this.ports.storage.remove(STORAGE_KEYS.active);
		this.ports.storage.remove(STORAGE_KEYS.userTokens);
		this.render();
	}

	setSafeMode(enabled: boolean): void {
		this.safeMode = enabled;
		this.safeModeReason = enabled ? "user" : null;
		if (enabled) this.ports.storage.set(STORAGE_KEYS.safeMode, "1");
		else this.ports.storage.remove(STORAGE_KEYS.safeMode);
		this.render();
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

	importThemePackage(input: unknown): ParseResult<ThemePackageV0> {
		const parsed = parseThemePackage(input);
		if (!parsed.ok) return parsed;
		const id = parsed.value.manifest.id;
		const existing = this.themes.get(id);
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
		this.themes.set(id, { pkg: parsed.value, source: "installed" });
		if (this.ports.packageStore !== undefined)
			void this.ports.packageStore.save(
				id,
				JSON.parse(JSON.stringify(parsed.value)),
			);
		else this.persistInstalled();
		this.render();
		return parsed;
	}

	removeInstalledTheme(id: string): void {
		const existing = this.themes.get(id);
		if (existing === undefined || existing.source !== "installed") return;
		this.themes.delete(id);
		if (this.previewThemeId === id) this.previewThemeId = null;
		if (this.activeThemeId === id) {
			this.activeThemeId = null;
			this.pendingActiveId = null;
			this.ports.storage.remove(STORAGE_KEYS.active);
		}
		if (this.ports.packageStore !== undefined)
			void this.ports.packageStore.remove(id);
		else this.persistInstalled();
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
	 * and the scrim (usually the readability recommendation) a safe color.
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
		const effectiveId = this.previewThemeId ?? this.activeThemeId;
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
		const effectiveId = this.previewThemeId ?? this.activeThemeId;
		const theme =
			effectiveId === null ? undefined : this.themes.get(effectiveId);
		if (theme === undefined) {
			this.ports.styles.setThemeCss("");
		} else {
			const urls = new Map<string, string>();
			for (const [name, asset] of Object.entries(theme.pkg.assets ?? {}))
				urls.set(name, this.ports.assets.create(asset));
			this.assetUrls = [...urls.values()];
			const resolveAsset = (name: string) => urls.get(name) ?? null;
			const tokensCss = compileThemeTokensCss(theme.pkg.tokens, {
				resolveAsset,
			});
			const stylesCss = Object.values(theme.pkg.styles ?? {})
				.map((css) => substituteThemeAssetUrls(css, resolveAsset))
				.join("\n");
			this.ports.styles.setThemeCss(
				[tokensCss, stylesCss].filter(Boolean).join("\n"),
			);
		}
		const userCssSections = [
			this.userTokens === null ? "" : compileThemeTokensCss(this.userTokens),
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
