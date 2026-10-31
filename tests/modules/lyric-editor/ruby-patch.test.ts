import { it, expect } from "vitest";
import { isKanaOnly } from "$/modules/segmentation/utils/Transliteration/TransliterationUtils";
import { ttmlLyricToAmllResult } from "$/application/lyrics/TtmlFormatService";
import { newLyricWord, newLyricLine } from "$/types/ttml";
it("applies 45494a1 kana punctuation handling to the shared segmentation port", () => {
	expect(isKanaOnly("「かな」♪")).toBe(true);
	expect(isKanaOnly("♪！？")).toBe(false);
	expect(isKanaOnly("漢字")).toBe(false);
});
it("filters empty and punctuation-only ruby on native export without mutating the document", () => {
	const ruby = ["", " ", "、。", "♪", "かな"].map((word) => ({
		word,
		startTime: 0,
		endTime: 100,
	}));
	const doc = {
		metadata: [],
		lyricLines: [{ ...newLyricLine(), words: [{ ...newLyricWord(), ruby }] }],
	};
	expect(ttmlLyricToAmllResult(doc).lyricLines[0].words[0].ruby).toEqual([
		ruby[4],
	]);
	expect(doc.lyricLines[0].words[0].ruby).toHaveLength(5);
	doc.lyricLines[0].words[0].ruby = ruby.slice(0, 4);
	expect(
		ttmlLyricToAmllResult(doc).lyricLines[0].words[0].ruby,
	).toBeUndefined();
});
