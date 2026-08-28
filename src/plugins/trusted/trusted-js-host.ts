import type {
	FormResultV0,
	FormSchemaV0,
	NotifyParams,
	RemotePluginCatalogEntryV0,
} from "@amll-ttml-tool/plugin-api";
import { parseRemotePluginCatalog } from "@amll-ttml-tool/plugin-api";
import { toast } from "react-toastify";
import type { EditorDocumentAtomAdapter } from "$/plugins/adapters/editor-document";
import { editorDocumentAdapter } from "$/plugins/adapters/editor-document";
import { extensionRegistry } from "$/plugins/adapters/extension-host";
import { declarativeFormService } from "$/plugins/ui/declarative-form-service";
import { selectedLinesAtom } from "$/states/main";
import { globalStore } from "$/states/store";
import { trustedJsConsentService } from "./trusted-consent-service";
import {
	TrustedJsPluginService,
	type TrustedJsPluginStateRecord,
	type TrustedJsStatePort,
} from "./trusted-js-service";

/**
 * Host services handed to a trusted-js plugin's activate(). A trusted-js
 * module is application-grade by admission, but going through these ports
 * (instead of reaching into app internals) keeps plugin edits inside the
 * document transaction service — one operation, one undo record, labeled
 * provenance — and keeps the surface documentable for plugin authors.
 */
export interface TrustedJsHostApi {
	document: EditorDocumentAtomAdapter;
	getSelectedLineIds(): ReadonlySet<string>;
	showForm(schema: FormSchemaV0): Promise<FormResultV0>;
	notify(params: NotifyParams): void;
}

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

const isDesktop = (): boolean =>
	Boolean(import.meta.env.TAURI_ENV_PLATFORM);

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
export const trustedJsPluginService = new TrustedJsPluginService<TrustedJsHostApi>({
	origin: typeof location === "undefined" ? "http://localhost" : location.origin,
	importModule: (url) => import(/* @vite-ignore */ url),
	createScope: (pluginId) =>
		extensionRegistry.createScope({
			kind: "plugin",
			pluginId,
			runtime: "trusted-js",
			trusted: true,
		}),
	host: {
		document: editorDocumentAdapter,
		getSelectedLineIds: () => globalStore.get(selectedLinesAtom),
		showForm: (schema) => declarativeFormService.showForm(schema),
		notify: ({ level, message, detail, timeoutMs }) => {
			toast[level]([message, detail].filter(Boolean).join("\n"), {
				autoClose: timeoutMs,
			});
		},
	},
	requestConsent: (request) => trustedJsConsentService.request(request),
	state: localStorageStatePort,
	isDesktop,
	isDesktopTrustEnabled: isDesktopTrustedJsEnabled,
	warn: (message) => console.warn(message),
});

const CATALOG_PATH = "plugins/catalog.json";

const currentPlatform = (): "web" | "desktop" =>
	isDesktop() ? "desktop" : "web";

/**
 * Fetches the same-origin static catalog (the store thin slice) and loads
 * its trusted-js entries. A missing or unreachable catalog is silence, not
 * an error: the store is an optional enhancement and its absence must never
 * degrade the editor. WASM/theme shelf entries are handled by the store UI,
 * not at startup.
 */
export async function initializeTrustedJsPlugins(): Promise<void> {
	let response: Response;
	try {
		const base = import.meta.env.BASE_URL ?? "/";
		response = await fetch(`${base}${CATALOG_PATH}`, { cache: "no-store" });
	} catch {
		return;
	}
	if (!response.ok) return;
	let json: unknown;
	try {
		json = await response.json();
	} catch {
		console.warn("[trusted-js] plugin catalog is not valid JSON; ignored");
		return;
	}
	const parsed = parseRemotePluginCatalog(json);
	if (!parsed.ok) {
		console.warn(
			"[trusted-js] plugin catalog failed validation; ignored:",
			parsed.issues
				.map((issue) => `${issue.path || "/"}: ${issue.message}`)
				.join("; "),
		);
		return;
	}
	const platform = currentPlatform();
	const entries = parsed.value.plugins.filter(
		(entry): entry is RemotePluginCatalogEntryV0 & { channel: "trusted-js" } =>
			entry.channel === "trusted-js" &&
			(entry.platforms === undefined || entry.platforms.includes(platform)),
	);
	for (const entry of entries) {
		const result = await trustedJsPluginService.load(entry);
		if (!result.ok && result.reason !== "consent-declined")
			console.warn(
				`[trusted-js] ${entry.id} not loaded (${result.reason}): ${result.message}`,
			);
	}
}
