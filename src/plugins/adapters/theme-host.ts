import { ThemeService } from "$/kernel/theme";
import { browserKeyValueStorage } from "$/platform/storage/BrowserKeyValueStorage";
import { IndexedDbThemePackageStorage } from "$/platform/storage/IndexedDbThemePackageStorage";
import { BrowserThemeAssetUrlAdapter } from "$/platform/theme/BrowserThemeAssetUrlAdapter";
import { DomThemeStyleAdapter } from "$/platform/theme/DomThemeStyleAdapter";
import { BUILTIN_THEME_PACKAGES } from "../builtin/themes";

const themePackageStorage = new IndexedDbThemePackageStorage();

/**
 * Host wiring for the theme system: kernel service + browser adapters.
 * The service is created eagerly so built-in themes are registered before
 * ThemeHost calls initialize() on mount. Installed packages persist in
 * IndexedDB (the legacy localStorage JSON is migrated on first hydrate).
 */
export const themeService = new ThemeService({
	storage: {
		get: (key) => browserKeyValueStorage.getItem(key),
		set: (key, value) => browserKeyValueStorage.setItem(key, value),
		remove: (key) => browserKeyValueStorage.removeItem(key),
	},
	styles: new DomThemeStyleAdapter(),
	assets: new BrowserThemeAssetUrlAdapter(),
	packageStore: {
		loadAll: () => themePackageStorage.loadAll(),
		save: (id, pkg) => themePackageStorage.save(id, pkg),
		remove: (id) => themePackageStorage.remove(id),
	},
	warn: (message) => console.warn(`[theme] ${message}`),
});

for (const themePackage of BUILTIN_THEME_PACKAGES) {
	const result = themeService.registerBuiltinTheme(themePackage);
	if (!result.ok)
		console.error("[theme] built-in theme failed validation", result.issues);
}
