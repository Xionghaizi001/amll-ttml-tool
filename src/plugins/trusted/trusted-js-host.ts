import type { TrustedJsHostV0 } from "@amll-ttml-tool/plugin-sdk-js";
import { toast } from "react-toastify";
import { getHostEnablementContext } from "$/plugins/adapters/enablement-context";
import { extensionRegistry } from "$/plugins/adapters/extension-host";
import {
	getHostSelection,
	pluginDocumentGateway,
	pluginKvStorage,
	subscribeHostDocumentChanges,
} from "$/plugins/adapters/host-services";
import { registerHostMode } from "$/plugins/adapters/mode-contributions";
import { loadRemotePluginCatalog } from "$/plugins/store/catalog-client";
import { declarativeFormService } from "$/plugins/ui/declarative-form-service";
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
	type TrustedJsStatePort,
} from "./trusted-js-service";

/**
 * Application ports behind the public `TrustedJsHostV0`. Document access and
 * kv storage are the very instances the WASM turn host uses, so both tiers
 * share one transaction path, one revision-conflict rule and one per-plugin
 * storage namespace; modes go through the same entry as core.modes.
 */
const trustedJsHostPorts: TrustedJsHostPorts = {
	documents: pluginDocumentGateway,
	subscribeDocumentChanges: subscribeHostDocumentChanges,
	getSelection: getHostSelection,
	showForm: (schema) => declarativeFormService.showForm(schema),
	notify: ({ level, message, detail, timeoutMs }, { pluginId }) => {
		toast[level](
			[message, detail, `(${pluginId})`].filter(Boolean).join("\n"),
			{
				autoClose: timeoutMs,
			},
		);
	},
	kv: pluginKvStorage,
	getEnablementContext: getHostEnablementContext,
	registerMode: registerHostMode,
};

const STATE_STORAGE_KEY = "amll-trusted-js-plugin-state-v0";
const DESKTOP_TRUST_STORAGE_KEY = "amll-trusted-js-desktop-enabled";

type StateMap = Record<string, TrustedJsPluginStateRecord>;

const readStateMap = (): StateMap => {
	try {
		const raw = localStorage.getItem(STATE_STORAGE_KEY);
		if (raw === null) return {};
		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
			return {};
		return parsed as StateMap;
	} catch {
		return {};
	}
};

const writeStateMap = (map: StateMap): void => {
	try {
		localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(map));
	} catch {
		// Private mode or quota exhaustion: crash accounting degrades to
		// session-only, which is safe (fail-open on availability, not trust —
		// consent still gates every load in this session).
	}
};

const localStorageStatePort: TrustedJsStatePort = {
	get: (pluginId) => readStateMap()[pluginId] ?? null,
	set: (pluginId, record) => {
		const map = readStateMap();
		map[pluginId] = record;
		writeStateMap(map);
	},
	remove: (pluginId) => {
		const map = readStateMap();
		delete map[pluginId];
		writeStateMap(map);
	},
};

/** Read-only state snapshot for management UI (enabled/crash accounting). */
export const getTrustedJsPluginState = (
	pluginId: string,
): TrustedJsPluginStateRecord | null => localStorageStatePort.get(pluginId);

const isDesktop = (): boolean => Boolean(import.meta.env.TAURI_ENV_PLATFORM);

export const isDesktopTrustedJsEnabled = (): boolean => {
	try {
		return localStorage.getItem(DESKTOP_TRUST_STORAGE_KEY) === "1";
	} catch {
		return false;
	}
};

export const setDesktopTrustedJsEnabled = (enabled: boolean): void => {
	try {
		if (enabled) localStorage.setItem(DESKTOP_TRUST_STORAGE_KEY, "1");
		else localStorage.removeItem(DESKTOP_TRUST_STORAGE_KEY);
	} catch {
		// Ignored: without persistence the gate simply stays at its default (off).
	}
};

/**
 * The shared trusted-js plugin host. Modules are imported straight off the
 * application origin — TLS + same-origin + the server publishing them is the
 * same channel integrity the main bundle already relies on, so admitted code
 * is builtin-grade and everything protective happens before import (consent,
 * origin check, crash gate) inside TrustedJsPluginService.
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
		createHost: ({ pluginId, scope }) =>
			createTrustedJsHost(trustedJsHostPorts, { pluginId, scope }),
		requestConsent: (request) => trustedJsConsentService.request(request),
		state: localStorageStatePort,
		isDesktop,
		isDesktopTrustEnabled: isDesktopTrustedJsEnabled,
		warn: (message) => console.warn(message),
	});

const currentPlatform = (): "web" | "desktop" =>
	isDesktop() ? "desktop" : "web";

const FACTORY_PIN_STORAGE_KEY = "amll-trusted-js-factory-pins-v0";

const readFactoryPins = (): string[] => {
	try {
		const raw = localStorage.getItem(FACTORY_PIN_STORAGE_KEY);
		if (raw === null) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((value): value is string => typeof value === "string")
			: [];
	} catch {
		return [];
	}
};

const writeFactoryPins = (pins: string[]): void => {
	try {
		localStorage.setItem(FACTORY_PIN_STORAGE_KEY, JSON.stringify(pins));
	} catch {
		// Without persistence the pin lasts for this session only.
	}
};

export const isPinnedToFactory = (pluginId: string): boolean =>
	readFactoryPins().includes(pluginId);

const setPinnedToFactory = (pluginId: string, pinned: boolean): void => {
	const pins = new Set(readFactoryPins());
	if (pinned) pins.add(pluginId);
	else pins.delete(pluginId);
	writeFactoryPins([...pins]);
};

const resolveCurrentLoadPlan = async (options?: {
	refresh?: boolean;
}): Promise<TrustedJsLoadResolution> => {
	const catalog = await loadRemotePluginCatalog(options);
	return resolveTrustedJsLoadPlan({
		factory: FACTORY_TRUSTED_JS_PLUGINS,
		catalog: catalog?.plugins ?? [],
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
 * silence, not an error. WASM/theme shelf entries are handled by the store
 * UI, not at startup.
 */
export async function initializeTrustedJsPlugins(): Promise<void> {
	for (const entry of FACTORY_TRUSTED_JS_PLUGINS) {
		const result = await trustedJsPluginService.load(entry);
		if (!result.ok)
			console.warn(
				`[trusted-js] factory plugin ${entry.id} not loaded (${result.reason}): ${result.message}`,
			);
	}
	const { plan } = await resolveCurrentLoadPlan();
	for (const item of plan) {
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
	setPinnedToFactory(pluginId, true);
	await reloadTrustedJsPlugin(pluginId);
}

/**
 * Re-resolves one plugin id against the current plan and swaps the live
 * instance to whatever the plan says (factory or remote). Also used after
 * re-enabling a disabled plugin.
 */
export async function reloadTrustedJsPlugin(pluginId: string): Promise<void> {
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
