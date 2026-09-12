import { describe, expect, it } from "vitest";
import {
	applyDocumentOpsV0,
	createSequentialIdAllocator,
} from "@amll-ttml-tool/plugin-api/document-ops";
import type { PluginDocumentV0 } from "@amll-ttml-tool/plugin-api/types";

const fixture = (): PluginDocumentV0 => ({
	revision: 0,
	metadata: [{ key: "title", values: ["Song"] }],
	lines: [
		{
			id: "line-1",
			words: [
				{
					id: "word-1",
					text: "hello",
					startTime: 0,
					endTime: 100,
					emptyBeat: 0,
					romanText: "",
				},
			],
			translation: "",
			romanization: "",
			isBackground: false,
			isDuet: false,
			startTime: 0,
			endTime: 100,
			ignoreSync: false,
		},
		{
			id: "line-2",
			words: [],
			translation: "",
			romanization: "",
			isBackground: false,
			isDuet: false,
			startTime: 100,
			endTime: 200,
			ignoreSync: false,
		},
	],
});

describe("applyDocumentOpsV0", () => {
	it("applies patch, insert, move and metadata ops in order", () => {
		const document = fixture();
		const failure = applyDocumentOpsV0(
			document,
			[
				{ op: "updateWord", wordId: "word-1", patch: { text: "hi" } },
				{
					op: "insertWord",
					lineId: "line-1",
					afterWordId: "word-1",
					word: {
						text: "there",
						startTime: 100,
						endTime: 200,
						emptyBeat: 0,
						romanText: "",
					},
				},
				{ op: "moveLine", lineId: "line-2", afterLineId: null },
				{ op: "setMetadata", entries: [{ key: "artist", values: ["A"] }] },
			],
			createSequentialIdAllocator("t"),
		);
		expect(failure).toBeUndefined();
		expect(document.lines[0].id).toBe("line-2");
		expect(document.lines[1].words.map((word) => word.text)).toEqual([
			"hi",
			"there",
		]);
		expect(document.lines[1].words[1].id).toBe("t-word-1");
		expect(document.metadata).toEqual([{ key: "artist", values: ["A"] }]);
	});

	it("stops at the first failing op and reports it", () => {
		const document = fixture();
		const failure = applyDocumentOpsV0(
			document,
			[
				{ op: "removeLine", lineId: "line-2" },
				{ op: "removeWord", wordId: "missing" },
			],
			createSequentialIdAllocator(),
		);
		expect(failure).toBe("word missing was not found");
	});

	it("restores the original position when moveLine targets a missing anchor", () => {
		const document = fixture();
		const failure = applyDocumentOpsV0(
			document,
			[{ op: "moveLine", lineId: "line-1", afterLineId: "missing" }],
			createSequentialIdAllocator(),
		);
		expect(failure).toBe("line missing was not found");
		expect(document.lines.map((line) => line.id)).toEqual([
			"line-1",
			"line-2",
		]);
	});

	it("allocates line ids before their word ids on insertLine", () => {
		const document = fixture();
		applyDocumentOpsV0(
			document,
			[
				{
					op: "insertLine",
					afterLineId: null,
					line: {
						words: [
							{
								text: "w",
								startTime: 0,
								endTime: 1,
								emptyBeat: 0,
								romanText: "",
							},
						],
						translation: "",
						romanization: "",
						isBackground: false,
						isDuet: false,
						startTime: 0,
						endTime: 1,
						ignoreSync: false,
					},
				},
			],
			createSequentialIdAllocator("s"),
		);
		expect(document.lines[0].id).toBe("s-line-1");
		expect(document.lines[0].words[0].id).toBe("s-word-2");
	});
});
