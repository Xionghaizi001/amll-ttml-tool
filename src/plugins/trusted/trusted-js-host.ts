import { TrustedJsStateStorage } from "./trusted-js-state-storage";
import type { TrustedJsHostV0 } from "@amll-ttml-tool/plugin-sdk-js";
import { toast } from "react-toastify";
import semverGt from "semver/functions/gt";
import { parseTrustedJsPackage } from "@amll-ttml-tool/plugin-api";
import { IndexedDbTrustedJsStorage } from "$/platform/storage/IndexedDbTrustedJsStorage";
import { InstalledTrustedJsService } from "./installed-trusted-js";
import { getHostEnablementContext } from "$/plugins/adapters/enablement-context";
import { extensionRegistry } from "$/plugins/adapters/extension-host";
import {
	getHostProjectInfo,
	getHostSelection,
	pluginDocumentGateway,
	pluginKvStorage,
	pluginNetworkPort,
	subscribeHostDocumentChanges,
	subscribeHostSelectionChanges,
} from "$/plugins/adapters/host-services";
import { registerHostMode } from "$/plugins/adapters/mode-contributions";
import { loadRemotePluginCatalog } from "$/plugins/store/catalog-client";
import { declarativeFormService } from "$/plugins/ui/declarative-form-service";
import { pluginViewService } from "$/plugins/ui/plugin-view-host";
import { FACTORY_TRUSTED_JS_PLUGINS } from "./factory-plugins";
import { trustedJsConsentService } from "./trusted-consent-service";
import {
	createTrustedJsHost,
	type TrustedJsHostPorts,
} from "./trusted-js-host-api";
import {
	resolveTrustedJsLoadPlan,
	type TrustedJsFactoryUpdateState,
	type TrustedJsLoadPlanItem,
	type TrustedJsLoadResolution,
} from "./trusted-js-load-plan";
import {
	TrustedJsPluginService,
	type TrustedJsPluginStateRecord,

} from "./trusted-js-service";
import { dependencyOrder } from "./dependencies";
import { checkDependencyActivation, checkDependencyGraph, registerDependencySource } from "./dependency-context";

/**
 * Application ports behind the public `TrustedJsHostV0`. Document access and
 * kv storage share the host transaction and namespace rules.
 * Modes go through the same entry as core.modes.
 */
const trustedJsHostPorts: TrustedJsHostPorts = {
	documents: pluginDocumentGateway,
	subscribeDocumentChanges: subscribeHostDocumentChanges,
	getSelection: getHostSelection,
	subscribeSelectionChanges: subscribeHostSelectionChanges,
	getProjectInfo: getHostProjectInfo,
	showForm: (schema, signal) => declarativeFormService.showForm(schema, signal),
	notify: ({ level, message, detail, timeoutMs }, { pluginId }) => {
		toast[level](
			[message, detail, `(${pluginId})`].filter(Boolean).join("\n"),
			{
				autoClose: timeoutMs,
			},
		);
	},
	kv: pluginKvStorage,
	network: pluginNetworkPort,
	views: pluginViewService,
	getEnablementContext: getHostEnablementContext,
	registerMode: registerHostMode,
};

const localStorageStatePort = new TrustedJsStateStorage();

/** Read-only state snapshot for management UI (enabled/crash accounting). */
export const getTrustedJsPluginState = (
	pluginId: string,
): TrustedJsPluginStateRecord | null => {
	try { return localStorageStatePort.get(pluginId); }
	catch { return { crashes: 0, pending: false, disabled: true }; }
};

const isDesktop = (): boolean => Boolean(import.meta.env.TAURI_ENV_PLATFORM);

/** Desktop uses the same per-package consent gate as the browser. */
export const isDesktopTrustedJsEnabled = (): boolean => true;

/**
 * The shared trusted-js plugin host. Modules are imported straight off the
 * application origin. Same-origin and artifact checks provide deployment
 * consistency, not a sandbox or publisher authentication; admitted code runs
 * with application-level power. Consent, origin checks and crash recovery
 * still happen before and around import inside TrustedJsPluginService.
 */
export const trustedJsPluginService =
	new TrustedJsPluginService<TrustedJsHostV0>({
		origin:
			typeof location === "undefined" ? "http://localhost" : location.origin,
		importModule: (url) => import(/* @vite-ignore */ url),
		createScope: (pluginId) =>
			extensionRegistry.createScope({
				kind: "plugin",
				pluginId,
				runtime: "trusted-js",
				trusted: true,
			}),
		createHost: ({ pluginId, scope, signal }) =>
			createTrustedJsHost(trustedJsHostPorts, { pluginId, scope, signal }),
		requestConsent: (request) => trustedJsConsentService.request(request),
		state: localStorageStatePort,
		isDesktop,
		isDesktopTrustEnabled: isDesktopTrustedJsEnabled,
		warn: (message) => console.warn(message),
		checkDependencies: checkDependencyActivation,
	});

const currentPlatform = (): "web" | "desktop" =>
	isDesktop() ? "desktop" : "web";

export const installedTrustedJsService = new InstalledTrustedJsService(
	new IndexedDbTrustedJsStorage(),
	trustedJsPluginService,
	(id) => pluginKvStorage.clear(id),
);

export async function installTrustedJsPackage(
	input: unknown,
	source: "user" | "dev" | "store" = "user",
	store?: import("$/kernel/extensions/installation-provenance").StoreInstallationProvenance,
	approvedConsentKey?: string,
) {
	const parsed = parseTrustedJsPackage(input);
	if (parsed.ok) {
		try { checkDependencyGraph(parsed.value.manifest); } catch (error) {
			return { ok: false as const, message: String(error instanceof Error ? error.message : error) };
		}
		const factory = FACTORY_TRUSTED_JS_PLUGINS.find(
			(p) => p.id === parsed.value.manifest.id,
		);
		if (
			source !== "dev" &&
			factory &&
			!semverGt(parsed.value.manifest.version, factory.version)
		)
			return {
				ok: false as const,
				message: "安装版本必须高于同名出厂插件版本",
			};
	}
	if (!parsed.ok || source === "dev")
		return installedTrustedJsService.install(input, source, store, approvedConsentKey);
	const id = parsed.value.manifest.id;
	const pinned = isPinnedToFactory(id);
	setPinnedToFactory(id, false);
	try {
		const result = await installedTrustedJsService.install(input, source, store, approvedConsentKey);
		if (!result.ok) setPinnedToFactory(id, pinned);
		return result;
	} catch (error) {
		setPinnedToFactory(id, pinned);
		throw error;
	}
}

export async function uninstallTrustedJsPackage(id: string) {
	const pinned = isPinnedToFactory(id);
	setPinnedToFactory(id, true);
	try { await installedTrustedJsService.uninstall(id); }
	catch (error) { setPinnedToFactory(id, pinned); throw error; }
	const factory = FACTORY_TRUSTED_JS_PLUGINS.find((p) => p.id === id);
	if (factory) await trustedJsPluginService.load(factory);
}

const FACTORY_PIN_STORAGE_KEY = "amll-trusted-js-factory-pins-v0";

const readFactoryPins = (): string[] => {
	const raw = localStorage.getItem(FACTORY_PIN_STORAGE_KEY);
	if (raw === null) return [];
	const parsed = JSON.parse(raw);
	return Array.isArray(parsed)
		? parsed.filter((value): value is string => typeof value === "string")
		: [];
};

const writeFactoryPins = (pins: string[]): void => {
	localStorage.setItem(FACTORY_PIN_STORAGE_KEY, JSON.stringify(pins));
};

export const isPinnedToFactory = (pluginId: string): boolean =>
	readFactoryPins().includes(pluginId);

export const setPinnedToFactory = (pluginId: string, pinned: boolean): void => {
	const pins = new Set(readFactoryPins());
	if (pinned) pins.add(pluginId);
	else pins.delete(pluginId);
	writeFactoryPins([...pins]);
};

registerDependencySource("trusted-js", () => {
	const entries = new Map(FACTORY_TRUSTED_JS_PLUGINS.map((entry) => [entry.id, entry]));
	for (const record of installedTrustedJsService.list()) {
		if (!isPinnedToFactory(record.id) || record.source === "dev") entries.set(record.id, installedTrustedJsService.entry(record.id)!);
	}
	for (const live of trustedJsPluginService.getLoaded()) entries.set(live.id, trustedJsPluginService.getEntry(live.id)!);
	return [...entries.values()].map((entry) => {
		const state = getTrustedJsPluginState(entry.id);
		return { ...entry, enabled: !state?.disabled && (state?.crashes ?? 0) < 3, ready: trustedJsPluginService.isLoaded(entry.id) };
	});
});

const resolveCurrentLoadPlan = async (options?: {
	refresh?: boolean;
}): Promise<TrustedJsLoadResolution> => {
	const catalog = await loadRemotePluginCatalog(options);
	return resolveTrustedJsLoadPlan({
		factory: FACTORY_TRUSTED_JS_PLUGINS,
		catalog: catalog?.plugins ?? [],
		installed: installedTrustedJsService.list().flatMap((record) => {
			const entry = installedTrustedJsService.entry(record.id);
			return entry ? [entry] : [];
		}),
		platform: currentPlatform(),
		desktopRemoteAllowed: isDesktopTrustedJsEnabled(),
		isPinnedToFactory,
	});
};

/**
 * Loads a plan item, falling back to the factory copy when a shadowing
 * remote load fails for any reason — a bad store artifact must never leave
 * the user without the factory feature.
 */
const loadPlanItem = async (item: TrustedJsLoadPlanItem): Promise<void> => {
	const result = await trustedJsPluginService.load(item.entry);
	if (result.ok) return;
	if (result.reason !== "consent-declined")
		console.warn(
			`[trusted-js] ${item.entry.id} not loaded (${result.reason}): ${result.message}`,
		);
	if (item.fallback && !trustedJsPluginService.isLoaded(item.fallback.id)) {
		const fallback = await trustedJsPluginService.load(item.fallback);
		if (!fallback.ok)
			console.warn(
				`[trusted-js] ${item.fallback.id} factory fallback failed (${fallback.reason}): ${fallback.message}`,
			);
	}
};

/**
 * Startup: factory plugins load immediately so bundled features never wait
 * on the network, then the same-origin static catalog (the store thin slice)
 * is consulted — newer first-party versions shadow their factory copies and
 * remote-only trusted-js entries load. A missing or unreachable catalog is
 * silence, not an error. Theme shelf entries are handled by the store
 * UI, not at startup.
 */
export async function initializeTrustedJsPlugins(): Promise<void> {
	try {
		await installedTrustedJsService.restore();
	} catch (error) {
		console.warn("Installed JS restore failed", error);
	}
	for (const entry of dependencyOrder(FACTORY_TRUSTED_JS_PLUGINS)) {
		const result = await trustedJsPluginService.load(entry);
		if (!result.ok)
			console.warn(
				`[trusted-js] factory plugin ${entry.id} not loaded (${result.reason}): ${result.message}`,
			);
	}
	const { plan } = await resolveCurrentLoadPlan();
	for (const { item } of dependencyOrder(plan.map((item) => ({ ...item.entry, item })), (id) => !getTrustedJsPluginState(id)?.disabled)) {
		if (item.origin === "factory") continue; // already live (or intentionally rejected)
		if (item.fallback && trustedJsPluginService.isLoaded(item.fallback.id))
			await trustedJsPluginService.unload(item.fallback.id);
		await loadPlanItem(item);
	}
}

/** Store page data: per-factory-plugin update/pin state from the catalog. */
export async function getTrustedJsUpdateStates(options?: {
	refresh?: boolean;
}): Promise<TrustedJsFactoryUpdateState[]> {
	const { updates } = await resolveCurrentLoadPlan(options);
	return updates;
}

/** Store page action: clear the factory pin and load the newer remote copy. */
export async function applyTrustedJsUpdate(pluginId: string): Promise<void> {
	installedTrustedJsService.discardDevelopment(pluginId);
	setPinnedToFactory(pluginId, false);
	await reloadTrustedJsPlugin(pluginId);
}

/**
 * Store page action ("uninstall the update"): pin the factory copy so the
 * catalog stops shadowing it, then swap the live instance back.
 */
export async function revertTrustedJsToFactory(
	pluginId: string,
): Promise<void> {
	installedTrustedJsService.discardDevelopment(pluginId);
	setPinnedToFactory(pluginId, true);
	await reloadTrustedJsPlugin(pluginId);
}

/**
 * Re-resolves one plugin id against the current plan and swaps the live
 * instance to whatever the plan says (factory or remote). Also used after
 * re-enabling a disabled plugin.
 */
export async function reloadTrustedJsPlugin(pluginId: string): Promise<void> {
	const development = installedTrustedJsService
		.list()
		.find((record) => record.id === pluginId && record.source === "dev");
	if (development) {
		const entry = installedTrustedJsService.entry(pluginId);
		await trustedJsPluginService.unload(pluginId);
		if (entry) await trustedJsPluginService.load(entry);
		return;
	}
	const { plan } = await resolveCurrentLoadPlan();
	const item = plan.find((candidate) => candidate.entry.id === pluginId);
	if (trustedJsPluginService.isLoaded(pluginId))
		await trustedJsPluginService.unload(pluginId);
	if (item) {
		await loadPlanItem(item);
		return;
	}
	// Not in the plan (e.g. remote-only entry no longer listed): nothing to load.
}
