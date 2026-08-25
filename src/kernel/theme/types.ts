import type {
	ThemePackageAssetV0,
	ThemePackageV0,
} from "@amll-ttml-tool/plugin-api";

/** Synchronous key-value persistence; the platform adapter owns the store. */
export interface ThemeKeyValueStorePort {
	get(key: string): string | null;
	set(key: string, value: string): void;
	remove(key: string): void;
}

/**
 * Style injection sink. The adapter is responsible for wrapping the CSS in
 * the amll.theme / amll.user cascade layers so user overrides always win.
 */
export interface ThemeStyleSinkPort {
	setThemeCss(css: string): void;
	setUserCss(css: string): void;
}

/** Turns packaged binary assets into local URLs (Blob URLs in the browser). */
export interface ThemeAssetUrlPort {
	create(asset: ThemePackageAssetV0): string;
	revoke(url: string): void;
}

export interface ThemeServicePorts {
	storage: ThemeKeyValueStorePort;
	styles: ThemeStyleSinkPort;
	assets: ThemeAssetUrlPort;
	warn?: (message: string) => void;
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
}

export interface RegisteredTheme {
	pkg: ThemePackageV0;
	source: ThemeSource;
}
