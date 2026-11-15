import { describe, expect, it } from "vitest";
import { generateTTMLLyric, parseTTML } from "$/modules/ttml-processor";
import { newLyricLine, newLyricWord } from "$/types/ttml";
import { applyLineRomanization } from "./distributor";

const makeLine = (...tokens: string[]) => ({
	...newLyricLine(),
	startTime: 1000,
	endTime: 3000,
	words: tokens.map((word, index) => ({
		...newLyricWord(),
		startTime: 1000 + index * 200,
		endTime: 1200 + index * 200,
		word,
	})),
});

describe("automatic Korean romanization", () => {
	it("uses pronunciation across timing spans and skips English in mixed lines", () => {
		const line = makeLine("꽃", "을 ", "피", "워, ", "dance");
		const original = structuredClone(line);

		applyLineRomanization(line);

		expect(line).toEqual({
			...original,
			words: original.words.map((word, index) => ({
				...word,
				romanWord: ["kko", "cheul", " pi", "wo", ""][index],
			})),
			wordRomanizationLang: "ko-Latn",
			romanLyric: "kkocheul piwo",
			romanLyricByLang: { "ko-Latn": "kkocheul piwo" },
		});
	});

	it("preserves manual and saved readings while generating missing Korean words", () => {
		const english = makeLine("Ready? 1, 2, go!");
		const original = structuredClone(english);
		applyLineRomanization(english);
		expect(english).toEqual(original);

		const manual = { ...makeLine("국", "물"), romanLyric: "manual reading" };
		applyLineRomanization(manual);
		expect(manual.romanLyric).toBe("manual reading");
		expect(manual.words.map(({ romanWord }) => romanWord)).toEqual([
			"gung",
			"mul",
		]);
		manual.words[0].romanWord = "my correction";
		applyLineRomanization(manual);
		expect(manual.words[0].romanWord).toBe("my correction");

		const saved = {
			...makeLine("국물"),
			wordRomanizationLang: "ja-Latn",
			romanLyricByLang: { "ko-Latn": "saved reading" },
		};
		saved.words[0].romanWord = "custom word";
		const originalSaved = structuredClone(saved);
		applyLineRomanization(saved);
		expect(saved).toEqual(originalSaved);

		const tagged = {
			...makeLine("국", "물"),
			romanLyric: "custom Korean",
			romanLyricByLang: { "ko-Latn": "custom Korean" },
		};
		const originalTagged = structuredClone(tagged);
		applyLineRomanization(tagged);
		expect(tagged).toEqual(originalTagged);
	});

	it("keeps the existing distribution for Japanese lyrics", () => {
		const line = { ...makeLine("す", "き"), romanLyric: "suki" };
		applyLineRomanization(line);
		expect(line.words.map(({ romanWord }) => romanWord)).toEqual(["su", "ki"]);
	});

	it("exports line and background readings as Korean without changing timing", () => {
		const lead = makeLine("같", "이");
		const background = { ...makeLine("국물"), isBG: true };
		applyLineRomanization(lead);
		applyLineRomanization(background);

		const result = generateTTMLLyric({
			lyricLines: [lead, background],
			metadata: [],
			agents: [],
			vocalTags: [],
		});
		if (!result.success) throw result.error;
		const parsed = parseTTML(result.data);
		if (!parsed.success) throw parsed.error;
		const [line] = parsed.data.lines;
		expect(line.startTime).toBe(1000);
		expect(line.words?.map(({ startTime }) => startTime)).toEqual([1000, 1200]);
		expect(line.romanizations).toMatchObject([
			{
				language: "ko-Latn",
				text: "ga chi",
				words: [
					{ text: "ga", startTime: 1000, endTime: 1200 },
					{ text: "chi", startTime: 1200, endTime: 1400 },
				],
			},
		]);
		expect(line.backgroundVocal?.romanizations).toMatchObject([
			{ language: "ko-Latn", text: "gungmul" },
		]);
	});
});
