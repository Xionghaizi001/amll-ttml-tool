import { describe, expect, it } from "vitest";
import {
	getExportFileName,
	parsePlainTextLyrics,
	prepareLyricLinesForExport,
} from "$/application/lyrics/index";

const options = {
	mode: "lyric-trans-roman" as const,
	lineSeparatorMode: "same-line-separator" as const,
	lineSeparator: "|",
	swapTransAndRoman: false,
	wordSeparator: "\\",
	enableSpecialPrefix: true,
	bgLyricPrefix: "<",
	duetLyricPrefix: ">",
	enableEmptyBeat: true,
	emptyBeatSymbol: "^",
};

describe("PlainTextImportService", () => {
	it("parses subtitles, prefixes, word separators, and empty beats", () => {
		const [line] = parsePlainTextLyrics(
			">hello\\world^^|translated|roman",
			options,
		);
		expect(line.isDuet).toBe(true);
		expect(line.words.map((word) => word.word)).toEqual(["hello", "world"]);
		expect(line.words[1]?.emptyBeat).toBe(2);
		expect(line.translatedLyric).toBe("translated");
		expect(line.romanLyric).toBe("roman");
	});

	it("rounds export timing without mutating the source", () => {
		const [line] = parsePlainTextLyrics("one", {
			...options,
			mode: "lyric",
			wordSeparator: "",
		});
		line.startTime = 1.4;
		line.endTime = 3.6;
		line.words[0].startTime = 1.4;
		line.words[0].endTime = 3.6;
		const exported = prepareLyricLinesForExport([line]);
		expect(exported[0].startTime).toBe(1);
		expect(exported[0].words[0].endTime).toBe(4);
		expect(line.words[0].endTime).toBe(3.6);
		expect(getExportFileName("song.ttml", "lrc")).toBe("song.lrc");
	});
});
