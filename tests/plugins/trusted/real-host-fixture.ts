import type {
	FormResultV0,
	FormSchemaV0,
	HttpRequestV0,
	HttpResponseV0,
	JsonValue,
	LocalizedText,
	NotifyParams,
	PluginSelectionV0,
} from "@amll-ttml-tool/plugin-api";
import { parseFormSchema } from "@amll-ttml-tool/plugin-api";
import type { TrustedJsProjectInfoV0 } from "@amll-ttml-tool/plugin-sdk-js";
import { CommandRegistry } from "$/kernel/commands";
import { EditorDocumentService } from "$/kernel/editor";
import { ExtensionRegistry } from "$/kernel/extensions";
import { PluginDocumentGateway } from "$/plugins/adapters/plugin-document";
import { createPluginNetworkPort } from "$/plugins/adapters/plugin-network";
import { PluginViewService } from "$/plugins/ui/plugin-view-service";
import {
	createTrustedJsHost,
	type TrustedJsHostPorts,
} from "$/plugins/trusted/trusted-js-host-api";
import { MockTrustedJsHost } from "@amll-ttml-tool/plugin-sdk-js/testing";
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
	signal?: AbortSignal;
	document?: TTMLLyric;
	selection?: PluginSelectionV0;
	onShowForm?: (schema: FormSchemaV0) => FormResultV0 | Promise<FormResultV0>;
	/** Scripted network transport; absent = transport error (`network-unavailable`). */
	onRequest?: (
		request: HttpRequestV0,
	) => HttpResponseV0 | Promise<HttpResponseV0>;
	offline?: boolean;
	project?: TrustedJsProjectInfoV0;
	strings?: Record<string, LocalizedText>;
	locale?: string;
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
	const selectionListeners = new Set<(selection: PluginSelectionV0) => void>();
	let offline = options.offline ?? false;
	let locale = options.locale ?? "en";
	const localeListeners = new Set<(locale: string) => void>();
	const requests: HttpRequestV0[] = [];
	const views = new PluginViewService(extensions.contributions);
	let seedSequence = 0;
	const media = new MockTrustedJsHost({ pluginId: options.pluginId });
	const ports: TrustedJsHostPorts = {
		documents: gateway,
		segmentation: media.segmentation,
		createEditor: () => ({
			...media.editor,
			revealLine: (id) => {
				if (
					!gateway
						.getDocument({ includeRuby: true })
						.lines.some((line) => line.id === id)
				)
					throw new Error("Unknown lyric line");
				selection = { lineIds: [id], wordIds: [] };
				for (const listener of selectionListeners) listener(selection);
			},
		}),
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
		subscribeSelectionChanges: (listener) => {
			selectionListeners.add(listener);
			return () => selectionListeners.delete(listener);
		},
		getProjectInfo: () =>
			options.project ?? { projectId: "test-project", fileName: "lyric.ttml" },
		getAudioState: media.audio.getState,
		subscribeAudioChanges: (listener) => {
			const d = media.audio.onChanged(listener);
			return () => d.dispose();
		},
		getBpmState: media.bpm.getState,
		subscribeBpmChanges: (listener) => {
			const d = media.bpm.onChanged(listener);
			return () => d.dispose();
		},
		setBpmScale: media.bpm.setScale,
		setBpmFollowPlaybackRate: media.bpm.setFollowPlaybackRate,
		setShowBeatLines: media.bpm.setShowBeatLines,
		tapBpm: media.bpm.tap,
		resetBpm: media.bpm.reset,
		connectBpm: (viewId, listener) => {
			const d = media.bpm.connect(viewId, listener);
			return () => d.dispose();
		},
		setBpmTapMode: media.bpm.setTapMode,
		getBpmTapKeyLabel: media.bpm.getTapKeyLabel,
		applyBpmCalibration: media.bpm.applyCalibration,
		importDocument: async (lyric, { label }) => {
			service.replace(lyric, { source: "user", label });
			return true;
		},
		getLocale: () => locale,
		subscribeLocaleChanges: (listener) => {
			localeListeners.add(listener);
			return () => localeListeners.delete(listener);
		},
		showForm: async (schema) => {
			const parsed = parseFormSchema(schema);
			if (!parsed.ok) throw new Error("Invalid form schema");
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
		network: createPluginNetworkPort({
			isOffline: () => offline,
			transport: async (request) => {
				requests.push(request);
				if (options.onRequest === undefined)
					throw new Error("no transport scripted");
				const response = await options.onRequest(request);
				return {
					ok: response.ok,
					status: response.status,
					statusText: response.statusText,
					headers: Object.entries(response.headers),
					text: async () => response.body,
				};
			},
		}),
		views,
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
		signal: options.signal,
		strings: options.strings,
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
		requests,
		views,
		setOffline: (next: boolean) => {
			offline = next;
		},
		setLocale: (next: string) => {
			locale = next;
			for (const listener of [...localeListeners]) listener(next);
		},
		localeListenerCount: () => localeListeners.size,
		setSelection: (next: PluginSelectionV0) => {
			selection = next;
			for (const listener of [...selectionListeners]) listener(next);
		},
	};
};
