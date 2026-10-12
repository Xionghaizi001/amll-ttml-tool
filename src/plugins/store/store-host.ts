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
	storeProviderClient,
	subscribeRemotePluginCatalog,
} from "./catalog-client";
import { readStoreResponse } from "./read-store-response";
import {
	installStoreArtifact,
	PluginInstallationService,
	type StoreArtifactInstallPorts,
	type StoreInstallOutcome,
} from "./store-install";
import type { ProviderCatalogEntry } from "./store-providers";
import { installStoreBatch, prepareStorePackage, resolveStoreDependencies } from "./dependency-install";
import { installedDependencyNodes } from "../trusted/dependency-context";

/** Browser assembly of the shared trusted-js and theme install gates. */

const fetchArtifact = async (path: string): Promise<Uint8Array> => {
	const base = import.meta.env.BASE_URL ?? "/";
	const response = await fetch(
		new URL(path, new URL(base, window.location.href)),
		{
			credentials: "omit",
			redirect: "error",
			signal: AbortSignal.timeout(30000),
		},
	);
	if (!response.ok)
		throw new Error(`artifact request failed with status ${response.status}`);
	return readStoreResponse(response, 48 * 1024 * 1024);
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

/** Recheck current provider identity before downloading. */
const installOneStoreEntry = async (
	entry: RemotePluginCatalogEntryV0,
): Promise<StoreInstallOutcome> => {
	const selected = entry as ProviderCatalogEntry;
	const current = storeProviderClient
		.entries(new Set(FACTORY_TRUSTED_JS_PLUGINS.map((p) => p.id)))
		.find(
			(candidate) =>
				candidate.id === entry.id &&
				candidate.provider.id === selected.provider?.id,
		);
	if (
		!current ||
		current.sha256 !== entry.sha256 ||
		current.version !== entry.version
	)
		return { ok: false, message: "来源已移除或目录已变化，请刷新后重试" };
	if (current.blockedReason)
		return { ok: false, message: current.blockedReason };
	const provenance = current.sha256
		? {
				providerId: current.provider.id,
				providerName: current.provider.name,
				artifactSha256: current.sha256,
			}
		: undefined;
	return installStoreArtifact(current, {
		...storeInstallPorts,
		fetchArtifact: () => fetchArtifact(current.artifactUrl),
		installTrustedJsPackage: (pkg) =>
			installTrustedJsPackage(pkg, "store", provenance),
		installThemePackage: async (pkg) => {
			const result = await themeService.installThemePackage(pkg, provenance);
			return result.ok
				? { ok: true }
				: {
						ok: false,
						message: result.issues.map((issue) => issue.message).join("\n"),
					};
		},
	});
};

export const installStoreEntry = async (entry: RemotePluginCatalogEntryV0): Promise<StoreInstallOutcome> => {
	const selected = entry as ProviderCatalogEntry;
	const current = storeProviderClient.entries(new Set(FACTORY_TRUSTED_JS_PLUGINS.map((p) => p.id)));
	const root = current.find((candidate) => candidate.id === selected.id && candidate.provider.id === selected.provider?.id);
	if (!root) return { ok: false, message: "来源已移除或目录已变化，请刷新后重试" };
	try {
		const plan = await resolveStoreDependencies(root, current, installedDependencyNodes(), (candidate) =>
			prepareStorePackage(candidate, { fetchArtifact: (path) => fetchArtifact(path), digestSha256 }),
		);
		const snapshot = new Map(current.map((item) => [`${item.provider.id}:${item.id}`, item.version]));
		const result = await installStoreBatch(plan, {
			confirm: async (items) => {
				const lines = items.map((item) => `${item.id}@${item.version}（${item.entry.channel}）`).join("\n");
				return typeof window === "undefined" || window.confirm(`将安装以下插件及依赖：\n\n${lines}`);
			},
			validate: () => {
				for (const item of plan) {
					const now = storeProviderClient.entries().find((candidate) => candidate.provider.id === item.entry.provider.id && candidate.id === item.id);
					if (!now || snapshot.get(`${item.entry.provider.id}:${item.id}`) !== now.version) throw new Error("目录已变化，请刷新后重试");
				}
			},
			checkpoint: (item) => item.entry.channel === "trusted-js"
				? installedTrustedJsService.checkpoint(item.id)
				: themeService.checkpoint(item.id),
			install: (item) => installOneStoreEntry(item.entry),
		});
		return result;
	} catch (error) {
		return { ok: false, message: String(error instanceof Error ? error.message : error) };
	}
};

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
