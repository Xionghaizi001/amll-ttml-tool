import type { PluginDocumentV0 } from "@amll-ttml-tool/plugin-api";
import { describe, expect, it } from "vitest";
import { EditorDocumentService } from "$/kernel/editor/EditorDocumentService";
import type { TTMLLyric } from "$/types/ttml";
import {
	createSeededIdAllocator,
	PluginDocumentGateway,
	toPluginDocument,
} from "$/plugins/adapters/plugin-document";

const fixture = (): TTMLLyric => ({
	metadata: [{ key: "title", value: ["Song"], error: false }],
	lyricLines: [
		{
			id: "line-1",
			words: [
				{
					id: "word-1",
					word: " hello ",
					startTime: 0,
					endTime: 100,
					obscene: true,
					emptyBeat: 2,
					romanWord: "he",
					romanWarning: true,
					ruby: [{ word: "ha", startTime: 0, endTime: 50 }],
				},
			],
			translatedLyric: "你好",
			romanLyric: "ni hao",
			isBG: false,
			isDuet: true,
			startTime: 0,
			endTime: 100,
			ignoreSync: false,
			endTimeLink: { originalEndTime: 100, originalNextStartTime: null },
		},
	],
});

const createGateway = (document = fixture()) => {
	const service = new EditorDocumentService(document);
	const gateway = new PluginDocumentGateway({
		readSnapshot: () => service.readSnapshot(),
		getRevision: () => service.getRevision(),
		transact: (meta, updater) => service.transact(meta, updater),
	});
	return { service, gateway };
};

describe("toPluginDocument", () => {
	it("projects public fields and hides internal ones", () => {
		const projected = toPluginDocument(fixture(), 7, { includeRuby: true });
		expect(projected.revision).toBe(7);
		const line = projected.lines[0];
		expect(line).toMatchObject({
			id: "line-1",
			translation: "你好",
			romanization: "ni hao",
			isBackground: false,
			isDuet: true,
		});
		expect(line.words[0]).toEqual({
			id: "word-1",
			text: " hello ",
			startTime: 0,
			endTime: 100,
			emptyBeat: 2,
			romanText: "he",
			ruby: [{ text: "ha", startTime: 0, endTime: 50 }],
		});
		expect(JSON.stringify(projected)).not.toContain("obscene");
		expect(JSON.stringify(projected)).not.toContain("endTimeLink");
		expect(projected.metadata).toEqual([{ key: "title", values: ["Song"] }]);
	});

	it("omits ruby without the lyrics.ruby capability", () => {
		const projected = toPluginDocument(fixture(), 0, { includeRuby: false });
		expect(projected.lines[0].words[0].ruby).toBeUndefined();
	});
});

describe("PluginDocumentGateway", () => {
	it("applies one edit as one transaction and preserves internal fields", () => {
		const { service, gateway } = createGateway();
		const result = gateway.applyEdit({
			pluginId: "test.plugin",
			label: "Trim",
			expectedRevision: 0,
			idSeed: "s1",
			ops: [
				{ op: "updateWord", wordId: "word-1", patch: { text: "hello" } },
				{ op: "updateLine", lineId: "line-1", patch: { translation: "hi" } },
			],
		});
		expect(result).toMatchObject({ ok: true, value: { revision: 1, appliedOps: 2 } });
		const snapshot = service.readSnapshot();
		const word = snapshot.lyricLines[0].words[0];
		expect(word.word).toBe("hello");
		// Internal-only fields survive because ops patch by id.
		expect(word.obscene).toBe(true);
		expect(word.romanWarning).toBe(true);
		expect(snapshot.lyricLines[0].endTimeLink).toBeDefined();
		expect(snapshot.lyricLines[0].translatedLyric).toBe("hi");

		// One undo restores everything at once.
		expect(service.canUndo()).toBe(true);
		service.undo();
		expect(service.canUndo()).toBe(false);
		expect(service.readSnapshot().lyricLines[0].words[0].word).toBe(" hello ");
	});

	it("rejects a stale revision without touching the document", () => {
		const { service, gateway } = createGateway();
		const before = service.readSnapshot();
		const result = gateway.applyEdit({
			label: "Stale",
			expectedRevision: 5,
			idSeed: "s1",
			ops: [{ op: "removeLine", lineId: "line-1" }],
		});
		expect(result).toMatchObject({
			ok: false,
			error: { code: "revision-conflict" },
		});
		expect(service.readSnapshot()).toEqual(before);
		expect(service.canUndo()).toBe(false);
	});

	it("rolls back the whole batch when one op fails", () => {
		const { service, gateway } = createGateway();
		const result = gateway.applyEdit({
			label: "Partial",
			expectedRevision: 0,
			idSeed: "s1",
			ops: [
				{ op: "updateLine", lineId: "line-1", patch: { translation: "x" } },
				{ op: "removeLine", lineId: "missing" },
			],
		});
		expect(result).toMatchObject({ ok: false, error: { code: "not-found" } });
		expect(service.readSnapshot().lyricLines[0].translatedLyric).toBe("你好");
		expect(service.canUndo()).toBe(false);
	});

	it("assigns the same seeded ids the worker turn host produced", () => {
		const { service, gateway } = createGateway();
		const result = gateway.applyEdit({
			label: "Insert",
			expectedRevision: 0,
			idSeed: "turn9",
			ops: [
				{
					op: "insertLine",
					afterLineId: "line-1",
					line: {
						words: [
							{
								text: "a",
								startTime: 0,
								endTime: 1,
								emptyBeat: 0,
								romanText: "",
							},
							{
								text: "b",
								startTime: 1,
								endTime: 2,
								emptyBeat: 0,
								romanText: "",
							},
						],
						translation: "",
						romanization: "",
						isBackground: false,
						isDuet: false,
						startTime: 0,
						endTime: 2,
						ignoreSync: false,
					},
				},
				// References the id the guest saw inside its own turn.
				{ op: "updateLine", lineId: "turn9-line-1", patch: { isDuet: true } },
				{ op: "updateWord", wordId: "turn9-word-3", patch: { text: "B" } },
			],
		});
		expect(result).toMatchObject({ ok: true });
		const inserted = service.readSnapshot().lyricLines[1];
		expect(inserted.id).toBe("turn9-line-1");
		expect(inserted.words.map((word) => word.id)).toEqual([
			"turn9-word-2",
			"turn9-word-3",
		]);
		expect(inserted.isDuet).toBe(true);
		expect(inserted.words[1].word).toBe("B");
	});

	it("keeps allocator ordering identical to the protocol's document-ops", () => {
		const allocator = createSeededIdAllocator("x");
		expect(allocator.nextId("line")).toBe("x-line-1");
		expect(allocator.nextId("word")).toBe("x-word-2");
	});

	it("round-trips a full document projection", () => {
		const { gateway } = createGateway();
		const projected: PluginDocumentV0 = gateway.getDocument({
			includeRuby: true,
		});
		expect(projected.revision).toBe(0);
		expect(projected.lines).toHaveLength(1);
	});
});
