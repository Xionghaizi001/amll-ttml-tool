import type {
	ThemePackageAssetV0,
	ThemePackageV0,
	ThemeSurfaceNameV0,
} from "@amll-ttml-tool/plugin-api";

/** Synchronous key-value persistence; the platform adapter owns the store. */
export interface ThemeKeyValueStorePort {
	get(key: string): string | null;
	set(key: string, value: string): void;
	remove(key: string): void;
}

/**
 * Which flag-gated bridges are active. The adapter mirrors these as
 * attributes on the document root so the static bridge CSS in index.css
 * only applies when a theme or the user actually set the token.
 */
export interface ThemeStyleFlags {
	accent: boolean;
	/** camelCase surface names from THEME_SURFACE_NAMES_V0. */
	surfaces: readonly ThemeSurfaceNameV0[];
}

/**
 * Style injection sink. The adapter is responsible for wrapping the CSS in
 * the amll.theme / amll.user cascade layers so user overrides always win.
 */
export interface ThemeStyleSinkPort {
	setThemeCss(css: string): void;
	setUserCss(css: string): void;
	setFlags(flags: ThemeStyleFlags): void;
}

/** Turns packaged binary assets into local URLs (Blob URLs in the browser). */
export interface ThemeAssetUrlPort {
	create(asset: ThemePackageAssetV0): string;
	revoke(url: string): void;
}

/**
 * A user-picked background image for one surface. The URL is a host-created
 * local object URL — never plugin- or network-supplied — and the scrim is
 * the readability overlay computed (or confirmed) when the image was chosen.
 */
export interface UserSurfaceImage {
	url: string;
	scrim?: string;
}

export interface ThemeServicePorts {
	storage: ThemeKeyValueStorePort;
	styles: ThemeStyleSinkPort;
	assets: ThemeAssetUrlPort;
	/**
	 * Async persistence for installed theme packages (IndexedDB in the
	 * browser). When present, installed packages live here instead of the
	 * legacy synchronous store; hydrateInstalledThemes() migrates the old
	 * localStorage JSON once and removes it. When absent, the legacy
	 * synchronous behavior is kept (used by existing tests).
	 */
	packageStore?: ThemePackageStorePort;
	warn?: (message: string) => void;
}

export interface ThemePackageStorePort {
	loadAll(): Promise<{ id: string; pkg: unknown }[]>;
	save(id: string, pkg: unknown): Promise<void>;
	remove(id: string): Promise<void>;
}

export type ThemeSource = "builtin" | "installed";

export interface ThemeSummary {
	id: string;
	name: string;
	description?: string;
	appearance: "light" | "dark" | "both";
	source: ThemeSource;
}

export type SafeModeReason = "user" | "crash" | "forced" | null;

export interface ThemeServiceState {
	activeThemeId: string | null;
	previewThemeId: string | null;
	safeMode: boolean;
	safeModeReason: SafeModeReason;
	hasUserOverrides: boolean;
	accentActive: boolean;
	activeSurfaces: readonly ThemeSurfaceNameV0[];
	userSurfaceImages: Readonly<
		Partial<Record<ThemeSurfaceNameV0, UserSurfaceImage>>
	>;
}

export interface RegisteredTheme {
	pkg: ThemePackageV0;
	source: ThemeSource;
}
