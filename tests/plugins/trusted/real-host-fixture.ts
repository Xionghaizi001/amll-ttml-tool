import type {
	FormResultV0,
	FormSchemaV0,
	JsonValue,
	NotifyParams,
	PluginSelectionV0,
} from "@amll-ttml-tool/plugin-api";
import { CommandRegistry } from "$/kernel/commands";
import { EditorDocumentService } from "$/kernel/editor";
import { ExtensionRegistry } from "$/kernel/extensions";
import { PluginDocumentGateway } from "$/plugins/adapters/plugin-document";
import {
	createTrustedJsHost,
	type TrustedJsHostPorts,
} from "$/plugins/trusted/trusted-js-host-api";
import type { TTMLLyric } from "$/types/ttml";

/** Two lines; the first carries a word with ruby so projection depth is covered. */
export const realHostFixture = (): TTMLLyric => ({
	metadata: [{ key: "title", value: ["Contract"] }],
	lyricLines: [
		{
			id: "line-1",
			words: [
				{
					id: "word-1",
					word: "hello",
					startTime: 100,
					endTime: 500,
					obscene: false,
					emptyBeat: 0,
					romanWord: "",
					ruby: [{ startTime: 100, endTime: 300, word: "he", emptyBeat: 0 }],
				},
			],
			translatedLyric: "before",
			romanLyric: "",
			isBG: false,
			isDuet: false,
			startTime: 100,
			endTime: 500,
			ignoreSync: false,
		},
		{
			id: "line-2",
			words: [],
			translatedLyric: "",
			romanLyric: "",
			isBG: false,
			isDuet: false,
			startTime: 1000,
			endTime: 1500,
			ignoreSync: false,
		},
	],
});

export interface RealTrustedHostOptions {
	pluginId: string;
	document?: TTMLLyric;
	selection?: PluginSelectionV0;
	onShowForm?: (schema: FormSchemaV0) => FormResultV0 | Promise<FormResultV0>;
	ports?: Partial<TrustedJsHostPorts>;
}

/**
 * The real trusted-js host stack in Node: EditorDocumentService +
 * PluginDocumentGateway + ExtensionRegistry behind `createTrustedJsHost`,
 * with in-memory kv/selection/form ports. What the application wires with
 * IndexedDB, Jotai and toasts is exactly this, port for port.
 */
export const createRealTrustedHost = (options: RealTrustedHostOptions) => {
	const service = new EditorDocumentService(
		options.document ?? realHostFixture(),
	);
	const commands = new CommandRegistry();
	const extensions = new ExtensionRegistry(commands);
	const gateway = new PluginDocumentGateway({
		readSnapshot: () => service.readSnapshot(),
		getRevision: () => service.getRevision(),
		transact: (meta, updater) => service.transact(meta, updater),
	});
	const notifications: NotifyParams[] = [];
	const shownForms: FormSchemaV0[] = [];
	const kv = new Map<string, Record<string, JsonValue>>();
	let selection: PluginSelectionV0 = options.selection ?? {
		lineIds: [],
		wordIds: [],
	};
	let seedSequence = 0;
	const ports: TrustedJsHostPorts = {
		documents: gateway,
		subscribeDocumentChanges: (listener) =>
			service.subscribe((event) =>
				listener({
					revision: event.revision,
					source: event.transaction.source === "plugin" ? "plugin" : "user",
					changedLineIds: [...event.changedLineIds],
					changedWordIds: [...event.changedWordIds],
					sourcePluginId: event.transaction.pluginId,
				}),
			),
		getSelection: () => selection,
		showForm: async (schema) => {
			shownForms.push(schema);
			return (await options.onShowForm?.(schema)) ?? { submitted: false };
		},
		notify: (params) => {
			notifications.push(params);
		},
		kv: {
			read: async (pluginId) => ({ ...(kv.get(pluginId) ?? {}) }),
			apply: async (pluginId, changes) => {
				const namespace = { ...(kv.get(pluginId) ?? {}) };
				Object.assign(namespace, changes.set);
				for (const key of changes.deleted) delete namespace[key];
				kv.set(pluginId, namespace);
			},
		},
		getEnablementContext: () => ({
			hasLineSelection: selection.lineIds.length > 0,
			hasWordSelection: selection.wordIds.length > 0,
			hasSelection: selection.lineIds.length + selection.wordIds.length > 0,
		}),
		registerMode: (scope, input) => scope.registerMode(input),
		createEditSeed: () => {
			seedSequence += 1;
			return `test-${seedSequence}`;
		},
		...options.ports,
	};
	const scope = extensions.createScope({
		kind: "plugin",
		pluginId: options.pluginId,
		runtime: "trusted-js",
		trusted: true,
	});
	const handle = createTrustedJsHost(ports, {
		pluginId: options.pluginId,
		scope,
	});
	return {
		host: handle.host,
		handle,
		scope,
		service,
		commands,
		extensions,
		notifications,
		shownForms,
		kv,
		setSelection: (next: PluginSelectionV0) => {
			selection = next;
		},
	};
};
