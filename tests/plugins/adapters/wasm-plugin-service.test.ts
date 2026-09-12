import type {
	FormResultV0,
	FunctionPluginManifest,
	NotifyParams,
	PluginEventV0,
} from "@amll-ttml-tool/plugin-api";
import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "$/kernel/commands";
import { ExtensionRegistry } from "$/kernel/extensions";
import { EditorDocumentService } from "$/kernel/editor/EditorDocumentService";
import {
	PluginRuntimeError,
	type WasmGuestExport,
	type WasmTurnContext,
	type WasmTurnResult,
} from "$/plugins/runtime";
import type { TTMLLyric } from "$/types/ttml";
import { registerManifestContributions } from "$/plugins/adapters/manifest-contributions";
import { PluginDocumentGateway } from "$/plugins/adapters/plugin-document";
import {
	type InstalledPluginData,
	PLUGIN_CRASH_AUTO_DISABLE_THRESHOLD,
	type WasmPluginRuntimePort,
	WasmPluginService,
	type WasmPluginServicePorts,
} from "$/plugins/adapters/wasm-plugin-service";

const PLUGIN_ID = "test.demo";
const COMMAND_ID = `${PLUGIN_ID}.run`;

const manifest = (): FunctionPluginManifest => ({
	id: PLUGIN_ID,
	kind: "function",
	name: "Demo",
	version: "1.0.0",
	apiVersion: 0,
	runtime: "extism-wasm",
	entry: "demo.wasm",
	capabilities: ["lyrics.core", "ui.notify", "ui.form", "storage.kv"],
	activationEvents: ["onDocumentChanged"],
	contributes: {
		commands: [{ id: COMMAND_ID, title: "Run" }],
		menus: [{ command: COMMAND_ID, menu: "menu.tool" }],
	},
});

const okReturn = (value: unknown = { kind: "done", value: null }): string =>
	JSON.stringify({ ok: true, value });

const emptyEffects = (): WasmTurnResult["effects"] => ({
	edits: null,
	notifications: [],
	storage: null,
	hostCallCount: 0,
});

type TurnHandler = (
	exportName: WasmGuestExport,
	payloadJson: string,
	context: WasmTurnContext,
) => WasmTurnResult | Promise<WasmTurnResult>;

class FakeRuntime implements WasmPluginRuntimePort {
	loaded: Uint8Array | null = null;
	cancelled: string[] = [];
	closed = false;
	readonly turns: { exportName: string; payload: unknown }[] = [];

	constructor(private readonly onTurn: TurnHandler) {}

	async load(wasm: Uint8Array): Promise<void> {
		this.loaded = wasm;
	}

	async runTurn(
		exportName: WasmGuestExport,
		payloadJson: string,
		context: WasmTurnContext,
	): Promise<WasmTurnResult> {
		this.turns.push({ exportName, payload: JSON.parse(payloadJson) });
		return this.onTurn(exportName, payloadJson, context);
	}

	cancelAll(reason = "cancelled"): void {
		this.cancelled.push(reason);
	}

	async close(): Promise<void> {
		this.closed = true;
	}
}

const documentFixture = (): TTMLLyric => ({
	metadata: [],
	lyricLines: [
		{
			id: "line-1",
			words: [
				{
					id: "word-1",
					word: "hi",
					startTime: 0,
					endTime: 10,
					obscene: false,
					emptyBeat: 0,
					romanWord: "",
				},
			],
			translatedLyric: "",
			romanLyric: "",
			isBG: false,
			isDuet: false,
			startTime: 0,
			endTime: 10,
			ignoreSync: false,
		},
	],
});

interface Harness {
	service: WasmPluginService;
	documents: EditorDocumentService;
	registry: ExtensionRegistry;
	commands: CommandRegistry;
	runtimes: FakeRuntime[];
	notifications: { params: NotifyParams; pluginId: string }[];
	kv: Map<string, Record<string, unknown>>;
	saved: InstalledPluginData[];
	emitDocumentEvent: (
		event: PluginEventV0,
		meta: { sourcePluginId?: string },
	) => void;
	showForm: ReturnType<typeof vi.fn>;
}

const createHarness = (onTurn: TurnHandler): Harness => {
	const documents = new EditorDocumentService(documentFixture());
	const gateway = new PluginDocumentGateway({
		readSnapshot: () => documents.readSnapshot(),
		getRevision: () => documents.getRevision(),
		transact: (meta, updater) => documents.transact(meta, updater),
	});
	const commands = new CommandRegistry();
	const registry = new ExtensionRegistry(commands);
	const runtimes: FakeRuntime[] = [];
	const notifications: { params: NotifyParams; pluginId: string }[] = [];
	const kv = new Map<string, Record<string, unknown>>();
	const saved: InstalledPluginData[] = [];
	const eventListeners = new Set<
		(event: PluginEventV0, meta: { sourcePluginId?: string }) => void
	>();
	const showForm = vi.fn(
		async (): Promise<FormResultV0> => ({ submitted: false }),
	);
	let seedSequence = 0;
	const ports: WasmPluginServicePorts = {
		createRuntime: () => {
			const runtime = new FakeRuntime(onTurn);
			runtimes.push(runtime);
			return runtime;
		},
		documents: gateway,
		getSelection: () => ({ lineIds: [], wordIds: [] }),
		showForm,
		notify: (params, meta) =>
			notifications.push({ params, pluginId: meta.pluginId }),
		kv: {
			read: async (pluginId) => ({
				...(kv.get(pluginId) ?? {}),
			}) as Record<string, never>,
			apply: async (pluginId, changes) => {
				const namespace = { ...(kv.get(pluginId) ?? {}) };
				Object.assign(namespace, changes.set);
				for (const key of changes.deleted) delete namespace[key];
				kv.set(pluginId, namespace);
			},
			clear: async (pluginId) => {
				kv.delete(pluginId);
			},
		},
		packages: {
			loadAll: async () => [],
			save: async (data) => {
				saved.push(JSON.parse(JSON.stringify({ ...data, wasm: undefined })));
			},
			remove: async () => undefined,
		},
		createScope: (pluginId) =>
			registry.createScope({
				kind: "plugin",
				pluginId,
				runtime: "extism-wasm",
				trusted: false,
			}),
		registerContributions: (scope, pluginManifest, executeCommand) =>
			registerManifestContributions(scope, pluginManifest, {
				executeCommand,
				getEnablementContext: () => ({}),
			}),
		subscribeDocumentEvents: (listener) => {
			eventListeners.add(listener);
			return () => eventListeners.delete(listener);
		},
		createTurnSeed: () => {
			seedSequence += 1;
			return `seed${seedSequence}`;
		},
	};
	const service = new WasmPluginService(ports);
	return {
		service,
		documents,
		registry,
		commands,
		runtimes,
		notifications,
		kv,
		saved,
		emitDocumentEvent: (event, meta) => {
			for (const listener of eventListeners) listener(event, meta);
		},
		showForm,
	};
};

// The service never reads the fake wasm bytes' contents, but detectWasiImports
// does compile them — use a minimal valid module: "\0asm" + version 1.
const MINIMAL_WASM = new Uint8Array([
	0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
]);

describe("WasmPluginService", () => {
	it("activates, registers contributions and cleans up on disable", async () => {
		const harness = createHarness(() => ({
			returnJson: okReturn(),
			effects: emptyEffects(),
		}));
		await harness.service.install(manifest(), MINIMAL_WASM);
		expect(harness.service.getPlugins()).toMatchObject([
			{ id: PLUGIN_ID, status: "active", enabled: true },
		]);
		expect(harness.commands.get(COMMAND_ID)).toBeDefined();
		expect(
			harness.registry.contributions.getMenus("menu.tool"),
		).toHaveLength(1);

		await harness.service.setEnabled(PLUGIN_ID, false);
		expect(harness.commands.get(COMMAND_ID)).toBeUndefined();
		expect(
			harness.registry.contributions.getMenus("menu.tool"),
		).toHaveLength(0);
		expect(harness.runtimes[0].closed).toBe(true);
		expect(harness.service.getPlugins()[0].status).toBe("disabled");

		await harness.service.setEnabled(PLUGIN_ID, true);
		expect(harness.commands.get(COMMAND_ID)).toBeDefined();
	});

	it("commits a command turn's edits as one transaction and flushes effects", async () => {
		const harness = createHarness((exportName) => {
			if (exportName !== "plugin_execute_command")
				return { returnJson: okReturn(), effects: emptyEffects() };
			return {
				returnJson: okReturn({ kind: "done", value: { done: true } }),
				effects: {
					edits: {
						baseRevision: 0,
						labels: ["Edit A", "Edit B"],
						ops: [
							{
								op: "updateWord",
								wordId: "word-1",
								patch: { text: "hello" },
							},
							{
								op: "updateLine",
								lineId: "line-1",
								patch: { translation: "x" },
							},
						],
					},
					notifications: [{ level: "success", message: "done" }],
					storage: { set: { last: 1 }, deleted: [] },
					hostCallCount: 4,
				},
			};
		});
		await harness.service.install(manifest(), MINIMAL_WASM);
		const value = await harness.service.executeCommand(PLUGIN_ID, COMMAND_ID);
		expect(value).toEqual({ done: true });
		const snapshot = harness.documents.readSnapshot();
		expect(snapshot.lyricLines[0].words[0].word).toBe("hello");
		expect(snapshot.lyricLines[0].translatedLyric).toBe("x");
		expect(harness.documents.getRevision()).toBe(1);
		// One undo restores both ops at once.
		harness.documents.undo();
		expect(harness.documents.readSnapshot().lyricLines[0].words[0].word).toBe(
			"hi",
		);
		expect(harness.kv.get(PLUGIN_ID)).toEqual({ last: 1 });
		expect(
			harness.notifications.filter((entry) => entry.pluginId === PLUGIN_ID),
		).toHaveLength(1);
	});

	it("rejects the whole turn when the document moved past the base revision", async () => {
		const harness = createHarness((exportName) => {
			if (exportName !== "plugin_execute_command")
				return { returnJson: okReturn(), effects: emptyEffects() };
			return {
				returnJson: okReturn(),
				effects: {
					edits: {
						baseRevision: 0,
						labels: ["Stale"],
						ops: [{ op: "removeLine", lineId: "line-1" }],
					},
					notifications: [],
					storage: null,
					hostCallCount: 1,
				},
			};
		});
		await harness.service.install(manifest(), MINIMAL_WASM);
		// A user edit lands while the (fake) turn is running.
		harness.documents.transact({ source: "user", label: "user edit" }, (draft) => {
			draft.lyricLines[0].translatedLyric = "user";
			return undefined;
		});
		await harness.service.executeCommand(PLUGIN_ID, COMMAND_ID);
		expect(harness.documents.readSnapshot().lyricLines).toHaveLength(1);
		const warning = harness.notifications.find(
			(entry) => entry.params.level === "warning",
		);
		expect(warning).toBeDefined();
	});

	it("runs the showForm outcome loop through plugin_resume_form", async () => {
		const harness = createHarness((exportName) => {
			if (exportName === "plugin_execute_command")
				return {
					returnJson: okReturn({
						kind: "showForm",
						schema: {
							title: "Pick",
							fields: [{ kind: "text", key: "name", label: "Name" }],
						},
						state: { step: 1 },
					}),
					effects: emptyEffects(),
				};
			if (exportName === "plugin_resume_form")
				return {
					returnJson: okReturn({ kind: "done", value: "finished" }),
					effects: emptyEffects(),
				};
			return { returnJson: okReturn(), effects: emptyEffects() };
		});
		harness.showForm.mockResolvedValueOnce({
			submitted: true,
			values: { name: "abc" },
		});
		await harness.service.install(manifest(), MINIMAL_WASM);
		const value = await harness.service.executeCommand(PLUGIN_ID, COMMAND_ID);
		expect(value).toBe("finished");
		expect(harness.showForm).toHaveBeenCalledTimes(1);
		const resume = harness.runtimes[0].turns.find(
			(turn) => turn.exportName === "plugin_resume_form",
		);
		expect(resume?.payload).toMatchObject({
			commandId: COMMAND_ID,
			state: { step: 1 },
			result: { submitted: true, values: { name: "abc" } },
		});
	});

	it("auto-disables a plugin after consecutive crashes", async () => {
		let crash = false;
		const harness = createHarness((exportName) => {
			if (exportName === "plugin_execute_command" && crash)
				throw new PluginRuntimeError("plugin-crashed", "boom");
			return { returnJson: okReturn(), effects: emptyEffects() };
		});
		await harness.service.install(manifest(), MINIMAL_WASM);
		crash = true;
		for (
			let attempt = 0;
			attempt < PLUGIN_CRASH_AUTO_DISABLE_THRESHOLD;
			attempt += 1
		)
			await harness.service
				.executeCommand(PLUGIN_ID, COMMAND_ID)
				.catch(() => undefined);
		const summary = harness.service.getPlugins()[0];
		expect(summary.status).toBe("crash-disabled");
		expect(summary.enabled).toBe(false);
		// Contributions are gone with the scope.
		expect(harness.commands.get(COMMAND_ID)).toBeUndefined();
		// The disable decision is persisted.
		expect(harness.saved.at(-1)).toMatchObject({ enabled: false });
		const errorToast = harness.notifications.find((entry) =>
			entry.params.message.includes("disabled after repeated failures"),
		);
		expect(errorToast).toBeDefined();
	});

	it("dispatches coalesced document events and skips its own edits", async () => {
		const harness = createHarness(() => ({
			returnJson: okReturn(),
			effects: emptyEffects(),
		}));
		await harness.service.install(manifest(), MINIMAL_WASM);
		const event: PluginEventV0 = {
			type: "document.changed",
			revision: 1,
			source: "user",
			changedLineIds: ["line-1"],
			changedWordIds: [],
		};
		harness.emitDocumentEvent(event, {});
		harness.emitDocumentEvent({ ...event, revision: 2 }, {});
		harness.emitDocumentEvent(
			{ ...event, revision: 3, source: "plugin" },
			{ sourcePluginId: PLUGIN_ID },
		);
		await new Promise((resolve) => setTimeout(resolve, 10));
		const eventTurns = harness.runtimes[0].turns.filter(
			(turn) => turn.exportName === "plugin_handle_event",
		);
		// Two queued emissions coalesce into one delivery; the plugin's own
		// edit is skipped entirely.
		expect(eventTurns).toHaveLength(1);
		expect(eventTurns[0].payload).toMatchObject({
			event: { revision: 2, source: "user" },
		});
	});

	it("registers manifest format providers and converts through pure turns", async () => {
		const FORMAT_ID = `${PLUGIN_ID}.krc`;
		const contexts: WasmTurnContext[] = [];
		const harness = createHarness((exportName, payloadJson, context) => {
			contexts.push(context);
			if (exportName !== "plugin_convert_format")
				return { returnJson: okReturn(), effects: emptyEffects() };
			const params = JSON.parse(payloadJson) as {
				direction: "import" | "export";
				formatId: string;
				text?: string;
				document?: { lines: unknown[] };
			};
			expect(params.formatId).toBe(FORMAT_ID);
			if (params.direction === "import")
				return {
					returnJson: okReturn({
						kind: "imported",
						lines: [
							{
								words: [
									{
										text: params.text ?? "",
										startTime: 0,
										endTime: 500,
										emptyBeat: 0,
										romanText: "",
									},
								],
								translation: "",
								romanization: "",
								isBackground: false,
								isDuet: false,
								startTime: 0,
								endTime: 500,
								ignoreSync: false,
							},
						],
						metadata: [{ key: "musicName", values: ["From plugin"] }],
					}),
					effects: emptyEffects(),
				};
			return {
				returnJson: okReturn({
					kind: "exported",
					text: `exported:${params.document?.lines.length ?? 0}`,
				}),
				effects: emptyEffects(),
			};
		});
		const formatManifest: FunctionPluginManifest = {
			...manifest(),
			capabilities: ["lyrics.core", "lyrics.format"],
			contributes: {
				formats: [
					{
						id: FORMAT_ID,
						title: "KRC",
						extensions: ["krc"],
						import: true,
						export: true,
					},
				],
			},
		};
		await harness.service.install(formatManifest, MINIMAL_WASM);

		const provider = harness.registry.contributions.getFormatProvider(FORMAT_ID);
		expect(provider?.extensions).toEqual(["krc"]);
		expect(
			harness.registry.contributions.findFormatProviderForExtension("krc")
				?.formatId,
		).toBe(FORMAT_ID);
		if (!provider?.importer || !provider.exporter)
			throw new Error("provider directions missing");

		const imported = await provider.importer({
			text: "hello",
			fileName: "song.krc",
		});
		expect(imported.lyricLines).toHaveLength(1);
		expect(imported.lyricLines[0].words[0].word).toBe("hello");
		expect(imported.lyricLines[0].id).toBeTruthy();
		expect(imported.metadata).toEqual([
			{ key: "musicName", value: ["From plugin"] },
		]);

		const exported = await provider.exporter({
			lyric: harness.documents.readSnapshot(),
			fileName: "song.krc",
		});
		expect(exported).toBe("exported:1");

		// 转换回合是纯回合：编辑被禁用（activate 回合不受影响）。
		const conversionContexts = contexts.slice(1);
		expect(conversionContexts).toHaveLength(2);
		for (const context of conversionContexts)
			expect(context.editsAllowed).toBe(false);

		// provider 随插件禁用一并消失，重新启用后恢复。
		await harness.service.setEnabled(PLUGIN_ID, false);
		expect(
			harness.registry.contributions.getFormatProvider(FORMAT_ID),
		).toBeUndefined();
		await harness.service.setEnabled(PLUGIN_ID, true);
		expect(
			harness.registry.contributions.getFormatProvider(FORMAT_ID),
		).toBeDefined();
	});

	it("uninstall clears the isolated storage namespace", async () => {
		const harness = createHarness(() => ({
			returnJson: okReturn(),
			effects: emptyEffects(),
		}));
		await harness.service.install(manifest(), MINIMAL_WASM);
		harness.kv.set(PLUGIN_ID, { a: 1 });
		await harness.service.uninstall(PLUGIN_ID);
		expect(harness.kv.has(PLUGIN_ID)).toBe(false);
		expect(harness.service.getPlugins()).toHaveLength(0);
		expect(harness.commands.get(COMMAND_ID)).toBeUndefined();
	});
});
