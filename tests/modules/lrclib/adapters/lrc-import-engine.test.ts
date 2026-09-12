import { describe, expect, it } from "vitest";
import { parseLrcLyrics, prepareLrcLibImport } from "$/application/lyrics";
import { lrcLibImportEngine, lrcParserEngine } from "$/modules/lrclib/adapters/lrc-import-engine";

describe("LRC import adapters", () => {
	it("parses translations and romanization through the application port", () => {
		const lines = parseLrcLyrics(
			"[00:01.00]Main\n[00:01.00]Translation\n[00:01.00]Roman\n[00:02.00]Next",
			lrcParserEngine,
		);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({
			startTime: 1000,
			endTime: 2000,
			translatedLyric: "Translation",
			romanLyric: "Roman",
		});
		expect(lines[0].words[0].word).toBe("Main");
	});

	it("converts an LRCLIB track without exposing utility modules to UI", () => {
		const prepared = prepareLrcLibImport(
			{
				name: "Song",
				artistName: "Artist",
				albumName: "Album",
				plainLyrics: null,
				syncedLyrics: "[00:01.00]Line",
			},
			{ extractBackground: false, autoSegment: false },
			{} as never,
			lrcLibImportEngine,
		);
		expect(prepared.fileName).toBe("Artist - Song.ttml");
		expect(prepared.document.lyricLines[0].words[0].word).toBe("Line");
	});
});
