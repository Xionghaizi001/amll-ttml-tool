import { describe, expect, it } from "vitest";
import {
	type AmllLyricResult,
	createTtmlFormatService,
} from "$/application/lyrics/TtmlFormatService";

const result: AmllLyricResult = {
	lyricLines: [
		{
			words: [{ startTime: 1.4, endTime: 2.6, word: "hi ", romanWord: "  " }],
			translatedLyric: "",
			romanLyric: "",
			isBG: false,
			isDuet: false,
			startTime: 1.4,
			endTime: 2.6,
		},
	],
	metadata: [{ key: "songwriter", value: ["A"] }],
};

describe("TtmlFormatService", () => {
	it("normalizes export values before calling the format port", () => {
		let received: AmllLyricResult | undefined;
		const service = createTtmlFormatService({
			parseTtml: () => ({ success: true, data: {} }),
			generateTtml: () => ({ success: true, data: "" }),
			ttmlToAmll: () => ({ success: true, data: result }),
			amllToTtml: (value) => {
				received = value;
				return { success: true, data: "<ttml />" };
			},
			ttmlResultToAmll: () => ({ success: true, data: result }),
			amllToTtmlResult: () => ({ success: true, data: {} }),
		});
		service.amllToTTML(result);
		expect(received?.lyricLines[0].startTime).toBe(1);
		expect(received?.lyricLines[0].words[0].romanWord).toBeUndefined();
		expect(received?.metadata[0].key).toBe("songwriter");
	});
});
