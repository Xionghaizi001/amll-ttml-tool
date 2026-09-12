import { describe, expect, it } from "vitest";
import { newLyricLine, newLyricWord } from "$/types/ttml";
import {
	findNextWord,
	findPreviousWord,
	getSynchronizableUnits,
} from "$/application/lyrics/LyricNavigationService";

const line = (words: string[], ignoreSync = false) => {
	const result = newLyricLine();
	result.ignoreSync = ignoreSync;
	result.words = words.map((word) => ({ ...newLyricWord(), word }));
	return result;
};

describe("LyricNavigationService", () => {
	it("expands ruby units and skips whitespace", () => {
		const value = line([" ", "hello"]);
		value.words[1].ruby = [
			{ word: "he", startTime: 0, endTime: 1 },
			{ word: "llo", startTime: 1, endTime: 2 },
		];
		expect(
			getSynchronizableUnits(value).map(
				(unit) => unit.rubyWord?.word ?? unit.word.word,
			),
		).toEqual(["he", "llo"]);
	});

	it("moves across synchronizable lines", () => {
		const lines = [
			line(["one"]),
			line(["ignored"], true),
			line(["three", "four"]),
		];
		expect(findNextWord(lines, 0, 0)?.unit.word.word).toBe("three");
		expect(findPreviousWord(lines, 2, 0)?.unit.word.word).toBe("one");
	});
});
