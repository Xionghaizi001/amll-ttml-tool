import type {
	EnablementContext,
	FormResultV0,
	FormSchemaV0,
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

/**
 * Host services the trusted-js host is assembled from. Pure ports, so the
 * real host (EditorDocumentService + PluginDocumentGateway + ExtensionRegistry)
 * runs under the protocol contract suite in Node exactly like the mock.
 */
export interface TrustedJsHostPorts {
	/** Shared with the WASM turn host: one transaction path, one conflict rule. */
	documents: PluginDocumentGateway;
	subscribeDocumentChanges(
		listener: (event: DocumentChangedEventV0) => void,
	): () => void;
	getSelection(): PluginSelectionV0;
	showForm(schema: FormSchemaV0): Promise<FormResultV0>;
	notify(params: NotifyParams, meta: { pluginId: string }): void;
	/** The `amll-plugin-kv` namespace store, keyed by plugin id like the WASM tier. */
	kv: TrustedJsKvPort;
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
	/** Drops host-owned subscriptions (document listeners); scope disposal is separate. */
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
 * per-plugin namespace the WASM tier uses.
 */
export const createTrustedJsHost = (
	ports: TrustedJsHostPorts,
	{ pluginId, scope }: { pluginId: string; scope: ExtensionScope },
): TrustedJsHostHandle => {
	const nextSeed = ports.createEditSeed ?? defaultEditSeed;
	const unsubscribers = new Set<() => void>();

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
			onChanged: (listener) => {
				const unsubscribe = ports.subscribeDocumentChanges(listener);
				unsubscribers.add(unsubscribe);
				return {
					dispose: () => {
						if (unsubscribers.delete(unsubscribe)) unsubscribe();
					},
				};
			},
		},
		selection: {
			get: () => ports.getSelection(),
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
			for (const unsubscribe of [...unsubscribers]) unsubscribe();
			unsubscribers.clear();
		},
	};
};
