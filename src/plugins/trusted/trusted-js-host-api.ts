import type {
	EnablementContext,
	FormResultV0,
	FormSchemaV0,
	HostResult,
	HttpRequestV0,
	HttpResponseV0,
	JsonValue,
	NotifyParams,
	PluginSelectionV0,
} from "@amll-ttml-tool/plugin-api";
import {
	evaluateEnablement,
	parseEnablement,
} from "@amll-ttml-tool/plugin-api";
import type {
	DocumentChangedEventV0,
	TrustedJsHostV0,
	TrustedJsModeV0,
	TrustedJsProjectInfoV0,
} from "@amll-ttml-tool/plugin-sdk-js";
import { TRUSTED_JS_SDK_VERSION } from "@amll-ttml-tool/plugin-sdk-js";
import type { Disposable } from "$/kernel/commands";
import type { ExtensionScope } from "$/kernel/extensions";
import {
	createDocumentFromPluginLines,
	createSeededIdAllocator,
	type PluginDocumentGateway,
	toPluginDocument,
} from "$/plugins/adapters/plugin-document";

export interface TrustedJsKvPort {
	read(pluginId: string): Promise<Record<string, JsonValue>>;
	apply(
		pluginId: string,
		changes: { set: Record<string, JsonValue>; deleted: string[] },
	): Promise<void>;
}

/** Outbound HTTP port (`network.http`); see `createPluginNetworkPort`. */
export interface TrustedJsNetworkPort {
	request(
		request: HttpRequestV0,
		meta: { pluginId: string; signal?: AbortSignal },
	): Promise<HostResult<HttpResponseV0>>;
	isOffline(): boolean;
}

/** Open-state of plugin dialog views; see `PluginViewService`. */
export interface TrustedJsViewPort {
	open(pluginId: string, viewId: string): void;
	close(viewId: string, pluginId?: string): void;
	closeAllOf(pluginId: string): void;
}

/**
 * Host services the trusted-js host is assembled from. Pure ports, so the
 * real host (EditorDocumentService + PluginDocumentGateway + ExtensionRegistry)
 * runs under the protocol contract suite in Node exactly like the mock.
 */
export interface TrustedJsHostPorts {
	/** One transaction path and revision conflict rule for plugin edits. */
	documents: PluginDocumentGateway;
	subscribeDocumentChanges(
		listener: (event: DocumentChangedEventV0) => void,
	): () => void;
	getSelection(): PluginSelectionV0;
	subscribeSelectionChanges(
		listener: (selection: PluginSelectionV0) => void,
	): () => void;
	/** Read-only project identity (id + current save file name). */
	getProjectInfo(): TrustedJsProjectInfoV0;
	showForm(schema: FormSchemaV0): Promise<FormResultV0>;
	notify(params: NotifyParams, meta: { pluginId: string }): void;
	/** The `amll-extensions/plugin-kv` namespace store, keyed by plugin id. */
	kv: TrustedJsKvPort;
	network: TrustedJsNetworkPort;
	views: TrustedJsViewPort;
	getEnablementContext(): EnablementContext;
	/**
	 * Mode registration entry. The application host passes the same
	 * `registerHostMode` core.modes uses, so builtin and SDK modes share one
	 * path (switch shortcut included); tests pass `scope.registerMode`.
	 */
	registerMode(scope: ExtensionScope, input: TrustedJsModeV0): Disposable;
	/** Unique seed for ids of inserted lines/words; injectable for tests. */
	createEditSeed?(pluginId: string): string;
}

export interface TrustedJsHostHandle {
	host: TrustedJsHostV0;
	/** Drops host-owned subscriptions (document/selection listeners) and closes the plugin's open dialogs; scope disposal is separate. */
	dispose(): void;
}

let seedSequence = 0;
const defaultEditSeed = (pluginId: string): string => {
	seedSequence += 1;
	const compact = pluginId.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 12);
	return `tj-${compact}-${Date.now().toString(36)}-${seedSequence}`;
};

/**
 * Builds the `TrustedJsHostV0` surface for one plugin. Every registration is
 * a thin wrapper over the plugin's ExtensionScope (own-namespace enforcement
 * and disposal come from the registry), document access is projected and
 * merged by the shared PluginDocumentGateway, and the kv store is the
 * per-plugin namespace.
 */
export const createTrustedJsHost = (
	ports: TrustedJsHostPorts,
	{ pluginId, scope }: { pluginId: string; scope: ExtensionScope },
): TrustedJsHostHandle => {
	const nextSeed = ports.createEditSeed ?? defaultEditSeed;
	const unsubscribers = new Set<() => void>();
	const networkController = new AbortController();
	const track = (unsubscribe: () => void) => {
		unsubscribers.add(unsubscribe);
		return {
			dispose: () => {
				if (unsubscribers.delete(unsubscribe)) unsubscribe();
			},
		};
	};

	const host: TrustedJsHostV0 = {
		sdkVersion: TRUSTED_JS_SDK_VERSION,
		document: {
			readSnapshot: () => ports.documents.getDocument({ includeRuby: true }),
			get revision() {
				return ports.documents.getRevision();
			},
			applyEdit: (ops, label, options) =>
				ports.documents.applyEdit({
					pluginId,
					label,
					expectedRevision: options?.expectedRevision ?? -1,
					ops: [...ops],
					idSeed: nextSeed(pluginId),
				}),
			onChanged: (listener) => track(ports.subscribeDocumentChanges(listener)),
		},
		selection: {
			get: () => ports.getSelection(),
			onChanged: (listener) => track(ports.subscribeSelectionChanges(listener)),
		},
		project: {
			getInfo: () => ports.getProjectInfo(),
		},
		commands: {
			register: (input) => {
				const enablement =
					input.enablement === undefined
						? undefined
						: parseEnablement(input.enablement);
				return scope.registerCommand({
					id: input.id,
					title: input.title,
					category: input.category,
					handler: (args) => input.handler(args as JsonValue | undefined),
					enablement:
						enablement === undefined
							? undefined
							: () =>
									evaluateEnablement(
										enablement.ast,
										ports.getEnablementContext(),
										enablement.unknownIdents,
									),
				});
			},
		},
		menus: {
			register: (input) => scope.registerMenu(input),
		},
		titleBarActions: {
			register: (input) => scope.registerTitleBarAction(input),
		},
		ui: {
			showForm: (schema) => ports.showForm(schema),
			notify: (params) => ports.notify(params, { pluginId }),
			openView: (viewId) => ports.views.open(pluginId, viewId),
			closeView: (viewId) => {
				// A plugin may only close its own dialogs; foreign ids are ignored.
				if (viewId.startsWith(`${pluginId}.`))
					ports.views.close(viewId, pluginId);
			},
		},
		network: {
			request: (request) =>
				ports.network.request(request, {
					pluginId,
					signal: networkController.signal,
				}),
			isOffline: () => ports.network.isOffline(),
		},
		storage: {
			kv: {
				get: async (key) => (await ports.kv.read(pluginId))[key] ?? null,
				set: (key, value) =>
					ports.kv.apply(pluginId, { set: { [key]: value }, deleted: [] }),
				delete: (key) => ports.kv.apply(pluginId, { set: {}, deleted: [key] }),
				keys: async () => Object.keys(await ports.kv.read(pluginId)).sort(),
			},
		},
		formats: {
			register: (provider) => {
				const { importer, exporter } = provider;
				return scope.registerFormatProvider({
					formatId: provider.formatId,
					title: provider.title,
					extensions: provider.extensions,
					mimeType: provider.mimeType,
					order: provider.order,
					importer:
						importer === undefined
							? undefined
							: async ({ text, fileName }) => {
									const result = await importer({ text, fileName });
									return createDocumentFromPluginLines(
										result.lines,
										result.metadata,
										createSeededIdAllocator(nextSeed(pluginId)),
									);
								},
					exporter:
						exporter === undefined
							? undefined
							: async ({ lyric, fileName }) => {
									const { lines, metadata } = toPluginDocument(lyric, 0, {
										includeRuby: true,
									});
									return exporter({ document: { lines, metadata }, fileName });
								},
				});
			},
		},
		views: {
			registerMode: (input) => ports.registerMode(scope, input),
			registerView: (input) => scope.registerTrustedView(input),
		},
	};

	return {
		host,
		dispose: () => {
			networkController.abort();
			for (const unsubscribe of [...unsubscribers]) unsubscribe();
			unsubscribers.clear();
			ports.views.closeAllOf(pluginId);
		},
	};
};
