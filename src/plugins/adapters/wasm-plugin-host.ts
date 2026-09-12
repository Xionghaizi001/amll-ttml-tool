import type {
	FunctionPluginManifest,
	PluginEventV0,
} from "@amll-ttml-tool/plugin-api";
import { parseManifest } from "@amll-ttml-tool/plugin-api";
import { toast } from "react-toastify";
import {
	IndexedDbPluginPackageStorage,
	type StoredPluginPackageRecord,
} from "$/platform/storage/IndexedDbPluginPackageStorage";
import { WasmPluginWorkerClient } from "$/plugins/runtime";
import { declarativeFormService } from "$/plugins/ui/declarative-form-service";
import { getHostEnablementContext } from "./enablement-context";
import { extensionRegistry } from "./extension-host";
import {
	getHostSelection,
	pluginDocumentGateway,
	pluginKvStorage,
	subscribeHostDocumentChanges,
} from "./host-services";
import { registerManifestContributions } from "./manifest-contributions";
import {
	type InstalledPluginData,
	WasmPluginService,
} from "./wasm-plugin-service";

const packageStorage = new IndexedDbPluginPackageStorage();

const toStoredRecord = (
	data: InstalledPluginData,
): StoredPluginPackageRecord => ({
	id: data.manifest.id,
	manifest: data.manifest,
	wasm: data.wasm.slice().buffer,
	granted: [...data.grantedCapabilities],
	enabled: data.enabled,
	source: data.source === "dev" ? "user" : data.source,
	installedAt: data.installedAt,
});

const fromStoredRecord = (
	record: StoredPluginPackageRecord,
): InstalledPluginData | null => {
	// Persistence is inside the trust boundary on paper, but a corrupted or
	// tampered record must still fail the same parse gate as a fresh import.
	const manifest = parseManifest(record.manifest);
	if (!manifest.ok || manifest.value.kind !== "function") {
		console.warn(
			`[plugins] dropping stored plugin ${record.id}: manifest failed validation`,
		);
		return null;
	}
	return {
		manifest: manifest.value as FunctionPluginManifest,
		wasm: new Uint8Array(record.wasm),
		grantedCapabilities: manifest.value.capabilities.filter((capability) =>
			record.granted.includes(capability),
		),
		enabled: record.enabled,
		source: record.source,
		installedAt: record.installedAt,
	};
};

export { pluginDocumentGateway } from "./host-services";

/** Shared WASM plugin host: real workers, IndexedDB persistence, host UI. */
export const wasmPluginService = new WasmPluginService({
	createRuntime: () => new WasmPluginWorkerClient({ timeoutMs: 10000 }),
	documents: pluginDocumentGateway,
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
	packages: {
		loadAll: async () =>
			(await packageStorage.loadAll())
				.map(fromStoredRecord)
				.filter((data): data is InstalledPluginData => data !== null),
		save: (data) => packageStorage.save(toStoredRecord(data)),
		remove: (pluginId) => packageStorage.remove(pluginId),
	},
	createScope: (pluginId) =>
		extensionRegistry.createScope({
			kind: "plugin",
			pluginId,
			runtime: "extism-wasm",
			trusted: false,
		}),
	registerContributions: (scope, manifest, executeCommand) =>
		registerManifestContributions(scope, manifest, {
			executeCommand,
			getEnablementContext: getHostEnablementContext,
		}),
	subscribeDocumentEvents: (listener) =>
		subscribeHostDocumentChanges((change) => {
			const pluginEvent: PluginEventV0 = {
				type: "document.changed",
				revision: change.revision,
				source: change.source,
				changedLineIds: change.changedLineIds,
				changedWordIds: change.changedWordIds,
			};
			listener(pluginEvent, { sourcePluginId: change.sourcePluginId });
		}),
	locale: typeof navigator === "undefined" ? "en" : navigator.language,
	hostVersion: "experimental-v0",
	warn: (message) => console.warn(`[plugins] ${message}`),
});
