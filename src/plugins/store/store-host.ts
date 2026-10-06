import type { RemotePluginCatalogEntryV0 } from "@amll-ttml-tool/plugin-api";
import { themeService } from "$/plugins/adapters/theme-host";
import { FACTORY_TRUSTED_JS_PLUGINS } from "../trusted/factory-plugins";
import {
	getTrustedJsPluginState,
	installedTrustedJsService,
	installTrustedJsPackage,
	isPinnedToFactory,
	reloadTrustedJsPlugin,
	revertTrustedJsToFactory,
	trustedJsPluginService,
	uninstallTrustedJsPackage,
} from "../trusted/trusted-js-host";
import {
	getRemotePluginCatalogSnapshot,
	subscribeRemotePluginCatalog,
} from "./catalog-client";
import {
	installStoreArtifact,
	PluginInstallationService,
	type StoreArtifactInstallPorts,
	type StoreInstallOutcome,
} from "./store-install";

/** Browser assembly of the shared trusted-js and theme install gates. */

const fetchArtifact = async (path: string): Promise<Uint8Array> => {
	const base = import.meta.env.BASE_URL ?? "/";
	const response = await fetch(`${base}${path}`);
	if (!response.ok)
		throw new Error(`artifact request failed with status ${response.status}`);
	return new Uint8Array(await response.arrayBuffer());
};

const digestSha256 = async (bytes: Uint8Array): Promise<string> => {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		bytes.slice().buffer as ArrayBuffer,
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
};

const storeInstallPorts: StoreArtifactInstallPorts = {
	fetchArtifact,
	digestSha256,
	installTrustedJsPackage: (pkg) => installTrustedJsPackage(pkg, "store"),
	installThemePackage: async (pkg): Promise<StoreInstallOutcome> => {
		const result = themeService.importThemePackage(pkg);
		if (result.ok) return { ok: true };
		return {
			ok: false,
			message: result.issues
				.map((issue) => `${issue.path || "/"}: ${issue.message}`)
				.join("\n"),
		};
	},
};

/** Store page action: install or update one catalog artifact entry. */
export const installStoreEntry = (
	entry: RemotePluginCatalogEntryV0,
): Promise<StoreInstallOutcome> =>
	installStoreArtifact(entry, storeInstallPorts);

export const pluginInstallationService = new PluginInstallationService({
	factory: () => FACTORY_TRUSTED_JS_PLUGINS,
	installed: installedTrustedJsService.list,
	loaded: () => trustedJsPluginService.getLoaded(),
	entry: (id) => trustedJsPluginService.getEntry(id),
	catalog: () =>
		(getRemotePluginCatalogSnapshot()?.plugins ?? []).filter(
			(entry) =>
				entry.platforms === undefined ||
				entry.platforms.includes(
					import.meta.env.TAURI_ENV_PLATFORM ? "desktop" : "web",
				),
		),
	state: (id) => {
		const state = getTrustedJsPluginState(id);
		const development = installedTrustedJsService
			.list()
			.some((record) => record.id === id && record.source === "dev");
		if (!development) return state;
		// Development loads ignore release failure history and use session consent.
		// The persisted disabled switch still gates them; a live dev load proves consent.
		return {
			crashes: 0,
			pending: false,
			disabled: state?.disabled,
			consented: trustedJsPluginService.isLoaded(id) ? true : undefined,
			consentKey: trustedJsPluginService.isLoaded(id) ? `dev:${id}` : undefined,
		};
	},
	pinned: isPinnedToFactory,
	themes: () => themeService.listThemes(),
	themeState: () => themeService.getState(),
	subscribe: (listener) => {
		const unsubscribe = [
			trustedJsPluginService.subscribe(listener),
			installedTrustedJsService.subscribe(listener),
			themeService.subscribe(listener),
			subscribeRemotePluginCatalog(listener),
		];
		return () => {
			for (const dispose of unsubscribe) dispose();
		};
	},
	setEnabled: async (kind, id, enabled) => {
		if (kind === "theme") {
			if (enabled) {
				themeService.setSafeMode(false);
				themeService.applyTheme(id);
			} else if (
				themeService.getState().activeThemeId === id ||
				themeService.getState().previewThemeId === id
			) {
				themeService.cancelPreview();
				if (themeService.getState().activeThemeId === id)
					themeService.applyTheme(null);
			}
			return;
		}
		await trustedJsPluginService.setEnabled(id, enabled);
		if (enabled) await reloadTrustedJsPlugin(id);
	},
	uninstall: async (kind, id) => {
		if (kind === "theme") themeService.removeInstalledTheme(id);
		else await uninstallTrustedJsPackage(id);
	},
	revertToFactory: revertTrustedJsToFactory,
	reauthorize: async (id) => {
		// Development consent lives in a separate session state inside the runtime.
		// Forgetting that state forces its existing consent gate to run again.
		if (
			installedTrustedJsService
				.list()
				.some((record) => record.id === id && record.source === "dev")
		)
			trustedJsPluginService.forget(id);
		else
			trustedJsPluginService.restoreConsent(id, {
				consented: false,
				consentKey: undefined,
			});
		await trustedJsPluginService.setEnabled(id, true);
		await reloadTrustedJsPlugin(id);
	},
});
