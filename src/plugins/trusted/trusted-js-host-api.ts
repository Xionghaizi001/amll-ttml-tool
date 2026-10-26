import type {
	EnablementContext,
	FormResultV0,
	FormSchemaV0,
	HostResult,
	HttpRequestV0,
	HttpResponseV0,
	JsonValue,
	LocalizedText,
	NotifyParams,
	PluginSelectionV0,
} from "@amll-ttml-tool/plugin-api";
import {
	evaluateEnablement,
	formatPluginString,
	localizeText,
	parseEnablement,
} from "@amll-ttml-tool/plugin-api";
import type {
	DocumentChangedEventV0,
	TrustedJsHostV0,
	TrustedJsAudioStateV0,
	TrustedJsBpmStateV0,
	TrustedJsModeV0,
	TrustedJsProjectInfoV0,
} from "@amll-ttml-tool/plugin-sdk-js";
import { TRUSTED_JS_SDK_VERSION } from "@amll-ttml-tool/plugin-sdk-js";
import type { Disposable } from "$/kernel/commands";
import type { TTMLLyric } from "$/types/ttml";
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
	connectBpm(
		sidebarViewId: string,
		onTap: (timeSeconds: number) => void,
	): () => void;
	setBpmTapMode(
		mode: import("@amll-ttml-tool/plugin-sdk-js").TrustedJsTapModeV0,
	): void;
	getBpmTapKeyLabel(): string;
	applyBpmCalibration(
		result: import("@amll-ttml-tool/plugin-sdk-js").TrustedJsBeatResultV0,
	): void;
	getAudioState(): TrustedJsAudioStateV0;
	subscribeAudioChanges(
		listener: (state: TrustedJsAudioStateV0) => void,
	): () => void;
	getBpmState(): TrustedJsBpmStateV0;
	subscribeBpmChanges(
		listener: (state: TrustedJsBpmStateV0) => void,
	): () => void;
	setBpmScale(scale: number): void;
	setBpmFollowPlaybackRate(value: boolean): void;
	setShowBeatLines(value: boolean): void;
	tapBpm(timeSeconds?: number): void;
	resetBpm(): void;
	/** File → Open commit path; resolves false when the user keeps the current document. */
	importDocument(
		lyric: TTMLLyric,
		options: { label: string },
	): Promise<boolean>;
	/** Host UI locale for `i18n`; the application passes i18next's language. */
	getLocale(): string;
	subscribeLocaleChanges(listener: (locale: string) => void): () => void;
	showForm(schema: FormSchemaV0, signal: AbortSignal): Promise<FormResultV0>;
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
	{
		pluginId,
		scope,
		signal,
		strings = {},
	}: {
		pluginId: string;
		scope: ExtensionScope;
		signal?: AbortSignal;
		/** Validated `contributes.strings` table of the loaded package. */
		strings?: Readonly<Record<string, LocalizedText>>;
	},
): TrustedJsHostHandle => {
	const nextSeed = ports.createEditSeed ?? defaultEditSeed;
	const unsubscribers = new Set<() => void>();
	const lifecycle = new AbortController();
	const assertActive = () => {
		if (lifecycle.signal.aborted)
			throw new Error(`Plugin ${pluginId} host is disposed`);
	};
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
			applyEdit: (ops, label, options) => {
				if (lifecycle.signal.aborted)
					return {
						ok: false,
						error: {
							code: "cancelled",
							message: `Plugin ${pluginId} host is disposed`,
						},
					};
				return ports.documents.applyEdit({
					pluginId,
					label,
					expectedRevision: options?.expectedRevision ?? -1,
					ops: [...ops],
					idSeed: nextSeed(pluginId),
				});
			},
			onChanged: (listener) => {
				assertActive();
				const reportError = (error: unknown) =>
					console.warn(`Plugin ${pluginId} document.onChanged failed`, error);
				return track(
					ports.subscribeDocumentChanges((event) => {
						try {
							Promise.resolve(listener(event)).catch(reportError);
						} catch (error) {
							reportError(error);
						}
					}),
				);
			},
		},
		selection: {
			get: () => ports.getSelection(),
			onChanged: (listener) => {
				assertActive();
				return track(ports.subscribeSelectionChanges(listener));
			},
		},
		project: {
			getInfo: () => ports.getProjectInfo(),
			importDocument: async ({ lines, metadata }, label) => {
				const cancelled = {
					ok: false as const,
					error: {
						code: "cancelled" as const,
						message: "The current document was kept",
					},
				};
				if (lifecycle.signal.aborted) return cancelled;
				const lyric = createDocumentFromPluginLines(
					lines,
					metadata,
					createSeededIdAllocator(nextSeed(pluginId)),
				);
				if (!(await ports.importDocument(lyric, { label }))) return cancelled;
				return { ok: true, value: { revision: ports.documents.getRevision() } };
			},
		},
		audio: {
			getState: () => ports.getAudioState(),
			onChanged: (listener) => {
				assertActive();
				return track(ports.subscribeAudioChanges(listener));
			},
		},
		bpm: {
			connect: (viewId, onTap) => {
				assertActive();
				if (!viewId.startsWith(pluginId + "."))
					throw new Error("BPM view must belong to the plugin");
				return track(ports.connectBpm(viewId, onTap));
			},
			setTapMode: (mode) => {
				assertActive();
				ports.setBpmTapMode(mode);
			},
			getTapKeyLabel: () => ports.getBpmTapKeyLabel(),
			applyCalibration: (result) => {
				assertActive();
				ports.applyBpmCalibration(result);
			},
			getState: () => ports.getBpmState(),
			onChanged: (listener) => {
				assertActive();
				return track(ports.subscribeBpmChanges(listener));
			},
			setScale: (scale) => {
				assertActive();
				ports.setBpmScale(scale);
			},
			setFollowPlaybackRate: (value) => {
				assertActive();
				ports.setBpmFollowPlaybackRate(value);
			},
			setShowBeatLines: (value) => {
				assertActive();
				ports.setShowBeatLines(value);
			},
			tap: (timeSeconds) => {
				assertActive();
				ports.tapBpm(timeSeconds);
			},
			reset: () => {
				assertActive();
				ports.resetBpm();
			},
		},
		i18n: {
			get locale() {
				return ports.getLocale();
			},
			t: (key, params) =>
				Object.hasOwn(strings, key)
					? formatPluginString(
							localizeText(
								scope.resolveOwnText(`/strings/${key}`, strings[key]),
								ports.getLocale(),
							),
							params,
						)
					: key,
			// Also fires when a language pack overriding this table is enabled
			// or disabled: either way the plugin must re-read its texts.
			onLocaleChanged: (listener) => {
				assertActive();
				const notify = (locale: string) => {
					try {
						listener(locale);
					} catch (error) {
						console.warn(
							`Plugin ${pluginId} i18n.onLocaleChanged failed`,
							error,
						);
					}
				};
				const overrides = scope.onOwnOverridesChanged(() =>
					notify(ports.getLocale()),
				);
				const unsubscribe = ports.subscribeLocaleChanges(notify);
				return track(() => {
					unsubscribe();
					overrides.dispose();
				});
			},
		},
		commands: {
			register: (input) => {
				assertActive();
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
			register: (input) => {
				assertActive();
				return scope.registerMenu(input);
			},
		},
		titleBarActions: {
			register: (input) => {
				assertActive();
				return scope.registerTitleBarAction(input);
			},
		},
		ui: {
			showForm: (schema) =>
				lifecycle.signal.aborted
					? Promise.resolve({ submitted: false })
					: ports.showForm(schema, lifecycle.signal),
			notify: (params) => {
				assertActive();
				ports.notify(params, { pluginId });
			},
			openView: (viewId) => {
				assertActive();
				ports.views.open(pluginId, viewId);
			},
			closeView: (viewId) => {
				if (lifecycle.signal.aborted) return;
				// A plugin may only close its own dialogs; foreign ids are ignored.
				if (viewId.startsWith(`${pluginId}.`))
					ports.views.close(viewId, pluginId);
			},
		},
		network: {
			request: (request) =>
				ports.network.request(request, {
					pluginId,
					signal: lifecycle.signal,
				}),
			isOffline: () => ports.network.isOffline(),
		},
		storage: {
			kv: {
				get: async (key) => (await ports.kv.read(pluginId))[key] ?? null,
				set: async (key, value) => {
					assertActive();
					await ports.kv.apply(pluginId, {
						set: { [key]: value },
						deleted: [],
					});
				},
				delete: async (key) => {
					assertActive();
					await ports.kv.apply(pluginId, { set: {}, deleted: [key] });
				},
				keys: async () => Object.keys(await ports.kv.read(pluginId)).sort(),
			},
		},
		formats: {
			register: (provider) => {
				assertActive();
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
			registerMode: (input) => {
				assertActive();
				return ports.registerMode(scope, input);
			},
			registerView: (input) => {
				assertActive();
				return scope.registerTrustedView(input);
			},
		},
	};

	const dispose = () => {
		if (lifecycle.signal.aborted) return;
		signal?.removeEventListener("abort", dispose);
		lifecycle.abort();
		for (const unsubscribe of [...unsubscribers]) unsubscribe();
		unsubscribers.clear();
		ports.views.closeAllOf(pluginId);
	};
	if (signal?.aborted) dispose();
	else signal?.addEventListener("abort", dispose, { once: true });
	return { host, dispose };
};
