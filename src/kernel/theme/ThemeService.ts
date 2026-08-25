import type {
	ParseResult,
	ThemePackageV0,
	ThemeTokensV0,
} from "@amll-ttml-tool/plugin-api";
import {
	parseThemePackage,
	substituteThemeAssetUrls,
	validateThemeTokens,
} from "@amll-ttml-tool/plugin-api";
import { compileThemeTokensCss } from "./token-css";
import type {
	RegisteredTheme,
	SafeModeReason,
	ThemeServicePorts,
	ThemeServiceState,
	ThemeSummary,
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
	private previewThemeId: string | null = null;
	private safeMode = false;
	private safeModeReason: SafeModeReason = null;
	private userTokens: ThemeTokensV0 | null = null;
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
		if (installedRaw !== null) {
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
		this.activeThemeId =
			activeId !== null && this.themes.has(activeId) ? activeId : null;

		// Marker protocol: set before the first injection, cleared once the
		// host reports a stable startup. A crash in between means the next
		// launch comes up with the default look.
		if (!this.safeMode && this.activeThemeId !== null)
			storage.set(STORAGE_KEYS.applyPending, "1");
		this.initialized = true;
		this.render();
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

	/** Back to the default look: no theme, no user overrides. */
	restoreDefaultTheme(): void {
		this.previewThemeId = null;
		this.activeThemeId = null;
		this.userTokens = null;
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
	 * they beat any theme package value. Pass null to clear.
	 */
	setUserTokenOverrides(input: unknown): ParseResult<ThemeTokensV0 | null> {
		if (input === null) {
			this.userTokens = null;
			this.ports.storage.remove(STORAGE_KEYS.userTokens);
			this.render();
			return { ok: true, value: null };
		}
		const parsed = validateThemeTokens(input);
		if (!parsed.ok) return parsed;
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
		this.persistInstalled();
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
			this.ports.storage.remove(STORAGE_KEYS.active);
		}
		this.persistInstalled();
		this.render();
	}

	dispose(): void {
		this.disposed = true;
		this.revokeAssetUrls();
		this.ports.styles.setThemeCss("");
		this.ports.styles.setUserCss("");
		this.listeners.clear();
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

	private render(): void {
		if (this.disposed) return;
		this.revokeAssetUrls();
		if (this.safeMode) {
			this.ports.styles.setThemeCss("");
			this.ports.styles.setUserCss("");
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
			const tokensCss = compileThemeTokensCss(theme.pkg.tokens);
			const stylesCss = Object.values(theme.pkg.styles ?? {})
				.map((css) =>
					substituteThemeAssetUrls(css, (name) => urls.get(name) ?? null),
				)
				.join("\n");
			this.ports.styles.setThemeCss(
				[tokensCss, stylesCss].filter(Boolean).join("\n"),
			);
		}
		this.ports.styles.setUserCss(
			this.userTokens === null ? "" : compileThemeTokensCss(this.userTokens),
		);
		this.notify();
	}

	private notify(): void {
		this.stateSnapshot = null;
		for (const listener of [...this.listeners]) listener();
	}
}
