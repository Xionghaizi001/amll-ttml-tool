import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "$/kernel/commands";
import { ExtensionRegistry, type ExtensionScope } from "$/kernel/extensions";
import { LyricFormatHandledError } from "$/kernel/formats";
import type { HostOpenedFile } from "$/kernel/platform";
import type { TTMLLyric } from "$/types/ttml";
import type { DocumentTransactionMeta } from "$/kernel/editor/EditorDocumentService";
import { LyricFileFlow, type ConfirmRequest } from "$/plugins/adapters/lyric-file-flow";

const emptyLyric = (): TTMLLyric => ({ lyricLines: [], metadata: [] });

const sampleLyric = (): TTMLLyric =>
	({
		lyricLines: [
			{
				id: "l1",
				words: [
					{
						id: "w1",
						word: "Hello",
						startTime: 1000,
						endTime: 2000,
						obscene: false,
						emptyBeat: 0,
						romanWord: "",
					},
				],
				translatedLyric: "",
				romanLyric: "",
				isBG: false,
				isDuet: false,
				startTime: 1000,
				endTime: 2000,
				ignoreSync: false,
			},
		],
		metadata: [],
	}) as unknown as TTMLLyric;

interface HarnessOptions {
	dirty?: boolean;
	document?: TTMLLyric;
	saveFileName?: string;
	pickFile?: () => Promise<HostOpenedFile | null>;
}

const createHarness = (options: HarnessOptions = {}) => {
	const registry = new ExtensionRegistry(new CommandRegistry());
	const scope: ExtensionScope = registry.createScope({
		kind: "builtin",
		id: "core.formats",
		trusted: true,
	});
	const state = {
		document: options.document ?? emptyLyric(),
		saveFileName: options.saveFileName ?? "lyric.ttml",
		projectId: "initial",
		selectionCleared: 0,
		replaced: [] as { document: TTMLLyric; meta: DocumentTransactionMeta }[],
		saved: [] as { fileName: string; content: string; mimeType?: string }[],
		confirms: [] as ConfirmRequest[],
		errors: [] as string[],
		warnings: [] as string[],
	};
	const flow = new LyricFileFlow({
		documents: {
			getRevision: () => 7,
			readSnapshot: () => state.document,
			replace: (document, meta) => {
				state.replaced.push({ document, meta });
				state.document = document;
			},
			transact: (_meta, updater) => updater(state.document),
		},
		formats: registry.contributions,
		picker: { pickFile: options.pickFile ?? (async () => null) },
		saver: {
			saveTextFile: async (input) => {
				state.saved.push(input);
			},
		},
		loadAudio: async () => [],
		listProjects: async () => [],
		getDefaultAuthor: () => ({ githubId: "", githubLogin: "" }),
		getSaveFileName: () => state.saveFileName,
		setSaveFileName: (fileName) => {
			state.saveFileName = fileName;
		},
		setProjectId: (projectId) => {
			state.projectId = projectId;
		},
		clearSelection: () => {
			state.selectionCleared += 1;
		},
		isDirty: () => options.dirty ?? false,
		requestConfirm: (request) => state.confirms.push(request),
		notifyError: (message) => state.errors.push(message),
		notifyWarning: (message) => state.warnings.push(message),
		translate: (_key, fallback) => fallback,
		generateId: () => "generated-id",
		logDebug: () => undefined,
		logError: () => undefined,
	});
	return { registry, scope, state, flow };
};

describe("LyricFileFlow", () => {
	it("imports a lyric source through its provider as one replace transaction", async () => {
		const { scope, state, flow } = createHarness();
		const parsed = sampleLyric();
		scope.registerFormatProvider({
			formatId: "lrc",
			title: "LyRiC",
			extensions: ["lrc"],
			importer: () => parsed,
		});

		flow.openLyricSource({ name: "song.lrc", text: async () => "[raw]" });
		await vi.waitFor(() => expect(state.replaced).toHaveLength(1));

		expect(state.replaced[0].meta).toEqual({
			source: "user",
			label: "Import lyric file",
			expectedRevision: 7,
		});
		expect(state.replaced[0].document).toBe(parsed);
		expect(state.projectId).toBe("generated-id");
		expect(state.selectionCleared).toBe(1);
		expect(state.saveFileName).toBe("song.lrc");
		expect(state.errors).toEqual([]);
	});

	it("gates dirty documents behind one confirmation dialog", async () => {
		const { scope, state, flow } = createHarness({ dirty: true });
		scope.registerFormatProvider({
			formatId: "lrc",
			title: "LyRiC",
			extensions: ["lrc"],
			importer: () => sampleLyric(),
		});

		flow.openLyricSource({ name: "song.lrc", text: async () => "" });
		expect(state.confirms).toHaveLength(1);
		expect(state.replaced).toHaveLength(0);

		state.confirms[0].onConfirm();
		await vi.waitFor(() => expect(state.replaced).toHaveLength(1));
	});

	it("rejects unsupported extensions with a user-facing error", async () => {
		const { state, flow } = createHarness();
		flow.openLyricSource({ name: "song.krc", text: async () => "" });
		await vi.waitFor(() => expect(state.errors).toHaveLength(1));
		expect(state.errors[0]).toContain("不支持的文件格式");
		expect(state.replaced).toHaveLength(0);
	});

	it("skips the generic toast when a provider already surfaced the error", async () => {
		const { scope, state, flow } = createHarness();
		scope.registerFormatProvider({
			formatId: "handled",
			title: "Handled",
			extensions: ["handled"],
			importer: () => {
				throw new LyricFormatHandledError("already shown");
			},
		});
		scope.registerFormatProvider({
			formatId: "broken",
			title: "Broken",
			extensions: ["broken"],
			importer: () => {
				throw new Error("parse failed");
			},
		});

		flow.openLyricSource({ name: "a.handled", text: async () => "" });
		flow.openLyricSource({ name: "a.broken", text: async () => "" });
		await vi.waitFor(() => expect(state.errors).toHaveLength(1));
		expect(state.errors[0]).toBe("打开文件失败");
		expect(state.replaced).toHaveLength(0);
	});

	it("validates exports and derives the export file name", async () => {
		const { scope, state, flow } = createHarness({
			document: sampleLyric(),
			saveFileName: "Artist - Song.ttml",
		});
		const exporter = vi.fn(() => "[00:01.00]Hello");
		scope.registerFormatProvider({
			formatId: "lrc",
			title: "LyRiC",
			extensions: ["lrc"],
			exporter,
		});

		await flow.exportDocumentAs("lrc");
		expect(state.saved).toEqual([
			{
				fileName: "Artist - Song.lrc",
				content: "[00:01.00]Hello",
				mimeType: undefined,
			},
		]);
		expect(exporter).toHaveBeenCalledWith({
			lyric: state.document,
			fileName: "Artist - Song.lrc",
		});
	});

	it("blocks exporting an empty document", async () => {
		const { scope, state, flow } = createHarness();
		scope.registerFormatProvider({
			formatId: "lrc",
			title: "LyRiC",
			extensions: ["lrc"],
			exporter: () => "text",
		});
		await flow.exportDocumentAs("lrc");
		expect(state.warnings).toHaveLength(1);
		expect(state.saved).toHaveLength(0);
	});

	it("reports export failures and rejects empty output", async () => {
		const { scope, state, flow } = createHarness({ document: sampleLyric() });
		scope.registerFormatProvider({
			formatId: "broken",
			title: "Broken",
			extensions: ["broken"],
			exporter: () => {
				throw new Error("stringify failed");
			},
		});
		scope.registerFormatProvider({
			formatId: "empty",
			title: "Empty",
			extensions: ["empty"],
			exporter: () => "",
		});
		scope.registerFormatProvider({
			formatId: "handled",
			title: "Handled",
			extensions: ["handledx"],
			exporter: () => {
				throw new LyricFormatHandledError("already shown");
			},
		});

		await flow.exportDocumentAs("broken");
		await flow.exportDocumentAs("empty");
		await flow.exportDocumentAs("handled");
		expect(state.errors).toHaveLength(2);
		expect(state.saved).toHaveLength(0);
	});

	it("saves the document with the host-native provider and keeps the file name", async () => {
		const { scope, state, flow } = createHarness();
		scope.registerFormatProvider({
			formatId: "ttml",
			title: "TTML",
			extensions: ["ttml"],
			mimeType: "text/xml",
			hostNative: true,
			importer: () => emptyLyric(),
			exporter: () => "<tt/>",
		});

		// 与旧保存行为一致：允许保存空文档。
		await flow.saveDocumentToFile();
		expect(state.saved).toEqual([
			{ fileName: "lyric.ttml", content: "<tt/>", mimeType: "text/xml" },
		]);
		await expect(flow.serializeNativeDocument()).resolves.toBe("<tt/>");
	});

	it("returns null from native serialization without a native provider", async () => {
		const { flow } = createHarness();
		await expect(flow.serializeNativeDocument()).resolves.toBeNull();
	});

	it("imports through the picker with the provider forced", async () => {
		const picked: HostOpenedFile = {
			name: "anything.txt",
			text: async () => "[raw]",
		};
		const { scope, state, flow } = createHarness({
			pickFile: async () => picked,
		});
		scope.registerFormatProvider({
			formatId: "lrc",
			title: "LyRiC",
			extensions: ["lrc"],
			importer: () => sampleLyric(),
		});

		await flow.importWithPicker("lrc");
		await vi.waitFor(() => expect(state.replaced).toHaveLength(1));
		expect(state.saveFileName).toBe("anything.txt");
	});

	it("creates a new document with reset project id and file name", () => {
		const { state, flow } = createHarness({
			document: sampleLyric(),
			saveFileName: "Artist - Song.ttml",
		});
		flow.newDocument();
		expect(state.replaced).toHaveLength(1);
		expect(state.replaced[0].document).toEqual(emptyLyric());
		expect(state.replaced[0].meta.label).toBe("New lyric document");
		expect(state.projectId).toBe("generated-id");
		expect(state.saveFileName).toBe("lyric.ttml");
		expect(state.selectionCleared).toBe(1);
	});
});
