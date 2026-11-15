import { describe, expect, it } from "vitest";
import { generateTTMLLyric, parseTTMLLyric } from "$/modules/ttml-processor";
import { parseGeniusAlbum, parseGeniusSong, parsePastedLyrics } from "./parser";
import { toGeniusProject } from "./project";
import { parseGeniusLink } from "./urls";

describe("Genius import", () => {
	it("only recognizes Genius song and album links", () => {
		expect(
			parseGeniusLink("www.genius.com/albums/Sample/Example?ref=share#tracks"),
		).toEqual({
			kind: "album",
			path: "/albums/Sample/Example",
			url: "https://genius.com/albums/Sample/Example",
		});
		for (const url of [
			"https://genius.com.evil.test/Example-lyrics",
			"https://example.com/Example-lyrics",
			"https://abc@genius.com/Example-lyrics",
			"https://genius.com:222/Example-lyrics",
			"https://genius.com/api/search/multi",
		]) {
			expect(parseGeniusLink(url)).toBeUndefined();
		}
	});

	it("reads the album tracklist without picking up recommended songs", () => {
		const html = `<h1>Example &amp; Friends</h1>
			<div class="chart_row"><a href="/sample-01-lyrics"><h3 class="chart_row-content-title">
				First <span class="chart_row-content-title-subtitle">Lyrics</span></h3>
			</a></div>
			<div class="chart_row"><a href="https://genius.com/sample-02-lyrics">Second</a></div>
			<a href="https://genius.com/random-recommendation-lyrics">Recommendation</a>`;
		expect(parseGeniusAlbum(html)).toEqual([
			{
				title: "First",
				path: "/sample-01-lyrics",
				kind: "song",
				album: "Example & Friends",
			},
			{
				title: "Second",
				path: "/sample-02-lyrics",
				kind: "song",
				album: "Example & Friends",
			},
		]);
	});

	it("uses Genius formatting to resolve different singers and exports each section", () => {
		const { lyrics } = parseGeniusSong(`
			<div data-lyrics-container="true"><div class="LyricsHeader__Container-example">123 Contributors</div>
			[Verse 1: Jun, <i>May</i>, <b>Hal &amp; Rae</b>]<br>Line one<br><em>Line two</em><br>
			<b>Line three</b> <i>(reply)</i><br><span data-exclude-from-selection="true">Advertisement</span></div>
			<div data-lyrics-container="true">[Pre-Chorus: Jun &amp; May]<br>Line four<br>
			[Chorus: All]<br>Line five<br>[Interlude]<br>Line six<br>[Chorus: All]<br>Line seven</div>`);
		expect(lyrics).toEqual([
			{ text: "Line one", songPart: "Verse", singers: ["Jun"] },
			{ text: "Line two", songPart: undefined, singers: ["May"] },
			{
				text: "Line three",
				background: ["reply"],
				songPart: undefined,
				singers: ["Hal", "Rae"],
			},
			{ text: "Line four", songPart: "PreChorus", singers: ["Jun", "May"] },
			{ text: "Line five", songPart: "Chorus", singers: ["All"] },
			{ text: "Line six", songPart: "Interlude", singers: [] },
			{ text: "Line seven", songPart: "Chorus", singers: ["All"] },
		]);

		const project = toGeniusProject(lyrics, { artist: "Example Group" });
		expect(project.lyricLines.every((line) => line.startTime === 0)).toBe(true);
		expect(project.agents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "person", names: ["Jun"] }),
				expect.objectContaining({ type: "person", names: ["May"] }),
				expect.objectContaining({ type: "group", names: ["Hal & Rae"] }),
				expect.objectContaining({ type: "group", names: ["Example Group"] }),
			]),
		);
		expect(project.lyricLines[5].agent).toBe(project.lyricLines[7].agent);
		expect(project.lyricLines[6].agent).toBeUndefined();

		const generated = generateTTMLLyric(project);
		expect(generated.success).toBe(true);
		if (!generated.success) return;
		expect(generated.data.match(/itunes:songPart="Chorus"/g)).toHaveLength(2);
		expect(generated.data).toContain('itunes:songPart="PreChorus"');
		expect(generated.data).toContain('type="group"');
		expect(generated.data).toContain("Hal &amp; Rae");
	});

	it("preserves the order and separate timing of parenthesized phrases", () => {
		const lyrics = parsePastedLyrics(
			"[Intro]\n(opening)\n[Verse]\n(before) a line (echo) （reply （soft））, ends\n(next answer)\n(next again)\n[Chorus]\n(only in this part)\nuntouched (unclosed",
		);
		const project = toGeniusProject(lyrics, {});
		const extract = (lines: typeof project.lyricLines) =>
			lines.map((line) => [
				line.words.map((word) => word.word).join(""),
				line.standaloneBackground
					? "standalone"
					: line.isBG
						? "attached"
						: "lead",
				line.songPart,
				line.startTime,
				line.endTime,
			]);
		const expected = [
			["opening", "standalone", "Intro", 1000, 1250],
			["a line, ends", "lead", "Verse", 1500, 1750],
			["before", "attached", undefined, 2000, 2250],
			["next answer", "standalone", undefined, 2500, 2750],
			["next again", "standalone", undefined, 3000, 3250],
			["echo", "standalone", undefined, 3500, 3750],
			["reply soft", "standalone", undefined, 4000, 4250],
			["only in this part", "standalone", "Chorus", 4500, 4750],
			["untouched (unclosed", "lead", undefined, 5000, 5250],
		];
		project.lyricLines.forEach((line, index) => {
			line.startTime = 1000 + index * 500;
			line.endTime = line.startTime + 250;
			line.words[0].startTime = line.startTime;
			line.words[0].endTime = line.endTime;
		});
		expect(extract(project.lyricLines)).toEqual(expected);

		const xml = generateTTMLLyric(project);
		expect(xml.success).toBe(true);
		if (!xml.success) return;
		expect(xml.data.match(/ttm:role="x-bg"/g)).toHaveLength(7);
		const parsed = parseTTMLLyric(xml.data);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(extract(parsed.data.lyricLines)).toEqual(expected);
			const exportedAgain = generateTTMLLyric(parsed.data);
			expect(
				exportedAgain.success && exportedAgain.data.match(/itunes:songPart=/g),
			).toHaveLength(3);
		}
	});

	it("shifts each occupied lead's own harmony after earlier queued harmonies", () => {
		const project = toGeniusProject(
			parsePastedLyrics(
				"[Verse]\n(Yeah) First lead (Ooh)\nSecond lead (Own)\n(Independent)\nThird lead (Carried)\n[Chorus]\nNew section (Fresh)",
			),
			{},
		);
		const result = project.lyricLines.map((line) => [
			line.words[0].word,
			line.standaloneBackground
				? "standalone"
				: line.isBG
					? "attached"
					: "lead",
			line.songPart,
		]);
		expect(result).toEqual([
			["First lead", "lead", "Verse"],
			["Yeah", "attached", undefined],
			["Second lead", "lead", undefined],
			["Ooh", "attached", undefined],
			["Independent", "standalone", undefined],
			["Third lead", "lead", undefined],
			["Own", "attached", undefined],
			["Carried", "standalone", undefined],
			["New section", "lead", "Chorus"],
			["Fresh", "attached", undefined],
		]);
	});

	it("defaults an unsigned solo song to its credited artist", () => {
		const song = parseGeniusSong(`<script type="application/ld+json">{
			"@type": "MusicRecording", "name": "Solo Song", "byArtist": [{"@type": "MusicGroup", "name": "Solo Artist"}],
			"inAlbum": [{"name": "Solo Album"}]
		}</script><div data-lyrics-container="true">[Verse 1]<br>Line one<br>[Chorus]<br>Line two</div>`);
		const project = toGeniusProject(song.lyrics, song);
		expect(project.agents).toEqual([
			{ id: "v1", type: "person", names: ["Solo Artist"] },
		]);
		expect(project.lyricLines.map((line) => line.agent)).toEqual(["v1", "v1"]);
		expect(project.lyricLines.every((line) => !line.isDuet)).toBe(true);
		const generated = generateTTMLLyric(project);
		expect(generated.success && generated.data).toMatch(
			/<ttm:agent[^>]*type="person"/,
		);
		expect(project.metadata).toContainEqual({
			key: "album",
			value: ["Solo Album"],
		});
	});

	it("marks multiple credited performers as a group when there are no line credits", () => {
		const song = parseGeniusSong(`<script type="application/ld+json">{
			"@type": "MusicRecording", "byArtist": [{"name": "First"}, {"name": "Second"}]
		}</script><div data-lyrics-container="true">[Verse]<br>Line one</div>`);
		const project = toGeniusProject(song.lyrics, song);
		expect(project.agents).toEqual([
			{ id: "v1", type: "group", names: ["First & Second"] },
		]);
	});

	it("retains all listed singers when pasted plain text has no style distinctions", () => {
		expect(
			parsePastedLyrics(
				"[Post-Chorus: Jun, May]\nLine one\n[Chorus]\nLine two",
			),
		).toEqual([
			{ text: "Line one", songPart: "PostChorus", singers: ["Jun", "May"] },
			{ text: "Line two", songPart: "Chorus", singers: [] },
		]);
	});
});
