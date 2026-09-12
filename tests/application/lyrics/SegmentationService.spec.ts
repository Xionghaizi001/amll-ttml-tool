import { describe, expect, it } from "vitest";
import { EditorDocumentService } from "$/kernel/editor";
import type { LyricLine, LyricWord } from "$/types/ttml";
import {
	buildManualSegments,
	createSegmentationConfig,
	normalizeSegmentationRange,
	type SegmentationEnginePort,
	segmentEntireDocument,
} from "$/application/lyrics/SegmentationService";

const word = (id: string, text: string): LyricWord => ({
	id,
	word: text,
	startTime: 0,
	endTime: 100,
	obscene: false,
	emptyBeat: 0,
	romanWord: "",
});

const line = (id: string, text: string): LyricLine => ({
	id,
	words: [word(`${id}-word`, text)],
	translatedLyric: "",
	romanLyric: "",
	isBG: false,
	isDuet: false,
	startTime: 0,
	endTime: 100,
	ignoreSync: false,
});

describe("SegmentationService", () => {
	it("builds normalized configuration", () => {
		const config = createSegmentationConfig({
			splitCJK: true,
			splitEnglish: false,
			punctuationMode: "merge",
			punctuationWeight: "bad",
			removeEmptySegments: true,
			ignoreListText: "a\n\n b ",
			customRules: new Map(),
		});
		expect(config.punctuationWeight).toBe(0.2);
		expect([...config.ignoreList]).toEqual(["a", " b "]);
	});
	it("normalizes ranges and manual split points", () => {
		expect(normalizeSegmentationRange(5, "range", "0", "99")).toEqual({
			startIndex: 0,
			endIndex: 5,
		});
		expect(buildManualSegments("abcdef", [4, 2, 2, 0, 6])).toEqual([
			"ab",
			"cd",
			"ef",
		]);
	});

	it("applies an injected segmentation engine as one undoable transaction", () => {
		const document = new EditorDocumentService({
			metadata: [],
			lyricLines: [line("line-1", "hello")],
		});
		const engine: SegmentationEnginePort<null> = {
			segmentLines: (lines) =>
				lines.map((item) => ({
					...item,
					words: item.words.map((itemWord) => ({
						...itemWord,
						word: `${itemWord.word}!`,
					})),
				})),
			segmentWord: (item) => [item],
			recalculateWordTime: (item) => [item],
			smoothLine: (item) => item,
		};

		const event = segmentEntireDocument(document, null, engine);
		expect(event?.revision).toBe(1);
		expect(document.readSnapshot().lyricLines[0].words[0].word).toBe("hello!");
		document.undo();
		expect(document.readSnapshot().lyricLines[0].words[0].word).toBe("hello");
	});
});
