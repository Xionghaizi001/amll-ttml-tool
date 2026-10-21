import { describe, expect, it } from "vitest";
import {
	getExportFileName,
	prepareLyricLinesForExport,
} from "$/application/lyrics/index";
import { newLyricLine, newLyricWord } from "$/types/ttml";

describe("lyric export preparation", () => {
	it("rounds export timing without mutating the source", () => {
		const line = {
			...newLyricLine(),
			words: [{ ...newLyricWord(), word: "one", startTime: 1.4, endTime: 3.6 }],
			startTime: 1.4,
			endTime: 3.6,
		};
		const exported = prepareLyricLinesForExport([line]);
		expect(exported[0].startTime).toBe(1);
		expect(exported[0].words[0].endTime).toBe(4);
		expect(line.words[0].endTime).toBe(3.6);
		expect(getExportFileName("song.ttml", "lrc")).toBe("song.lrc");
	});
});
