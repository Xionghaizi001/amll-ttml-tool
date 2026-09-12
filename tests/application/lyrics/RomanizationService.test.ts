import { describe, expect, it } from "vitest";
import { EditorDocumentService } from "$/kernel/editor";
import type { LyricLine, LyricWord, TTMLLyric } from "$/types/ttml";
import {
	createRomanizationDebugReport,
	distributeDocumentRomanization,
	generateDocumentRuby,
	type RomanizationEnginePort,
	type RubyGenerationEnginePort,
} from "$/application/lyrics/RomanizationService";

const createWord = (id: string, word: string): LyricWord => ({
	id,
	word,
	startTime: 0,
	endTime: 100,
	obscene: false,
	emptyBeat: 0,
	romanWord: "",
});

const createLine = (id: string, word: string): LyricLine => ({
	id,
	words: [createWord(`${id}-word`, word)],
	romanLyric: `${word}-roman`,
	translatedLyric: "",
	isBG: false,
	isDuet: false,
	startTime: 0,
	endTime: 100,
	ignoreSync: false,
});

const createDocument = (): TTMLLyric => ({
	metadata: [],
	lyricLines: [createLine("line-1", "a"), createLine("line-2", "b")],
});

const engine: RomanizationEnginePort = {
	predict: (words, romanLyric) => words.map(() => romanLyric.toUpperCase()),
	applyWarnings: (words) => {
		for (const word of words) word.romanWarning = false;
	},
};

const rubyEngine: RubyGenerationEnginePort = {
	generate: (word) => [
		{
			word: word.romanWord ?? "",
			startTime: word.startTime,
			endTime: word.endTime,
		},
	],
};

describe("RomanizationService", () => {
	it("applies selected lines in one document transaction and can undo", () => {
		const document = new EditorDocumentService(createDocument());
		const result = distributeDocumentRomanization(
			document,
			engine,
			new Set(["line-2"]),
		);

		expect(result.failures).toEqual([]);
		expect(result.event?.revision).toBe(1);
		expect(document.readSnapshot().lyricLines[0].words[0].romanWord).toBe("");
		expect(document.readSnapshot().lyricLines[1].words[0].romanWord).toBe(
			"B-ROMAN",
		);
		document.undo();
		expect(document.readSnapshot().lyricLines[1].words[0].romanWord).toBe("");
	});

	it("builds debugger output without React, Jotai or window access", () => {
		const report = createRomanizationDebugReport(
			createDocument(),
			engine,
			1,
			1,
		);
		expect(report).toEqual([
			{
				line: 1,
				originalText: "b",
				romanSource: "b-roman",
				syllables: [{ word: "b", emptyBeat: 0, predicted: "B-ROMAN" }],
			},
		]);
	});

	it("generates ruby for selected lines in one undoable transaction", () => {
		const initial = createDocument();
		initial.lyricLines[1].words[0].romanWord = "bi";
		const document = new EditorDocumentService(initial);
		const event = generateDocumentRuby(
			document,
			rubyEngine,
			new Set(["line-2"]),
		);
		expect(event?.revision).toBe(1);
		expect(document.readSnapshot().lyricLines[1].words[0].ruby?.[0].word).toBe(
			"bi",
		);
		document.undo();
		expect(document.readSnapshot().lyricLines[1].words[0].ruby).toBeUndefined();
	});
});
