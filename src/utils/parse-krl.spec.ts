import { describe, expect, it } from "vitest";
import { parseKrl } from "./parse-krl";

describe("parseKrl", () => {
	it("parses paired timestamps as minutes, seconds and hundredths", () => {
		const [line] = parseKrl(
			"\uFEFF[01:02:30]I [01:02:53]sing[01:03:22]\r\n\r\n",
		);
		expect(line).toMatchObject({ startTime: 62300, endTime: 63220 });
		expect(line.words).toMatchObject([
			{ word: "I ", startTime: 62300, endTime: 62530 },
			{ word: "sing", startTime: 62530, endTime: 63220 },
		]);
	});

	it("keeps original text as the base, timed ruby and matching romanization", () => {
		const [line] = parseKrl(
			"{僕|[00:00:02]ぼ[00:00:05]く>[00:00:02]bo[00:00:05]ku}[00:00:07]",
		);
		expect(line.words).toMatchObject([
			{
				word: "僕",
				startTime: 20,
				endTime: 70,
				romanWord: "boku",
				ruby: [
					{ word: "ぼ", startTime: 20, endTime: 50 },
					{ word: "く", startTime: 50, endTime: 70 },
				],
			},
		]);
	});

	it("supports ruby alone and kana alone with shared group boundaries", () => {
		const [line] = parseKrl(
			"{僕|[00:00:02]ぼ[00:00:05]く}{僕|>[00:00:08]bo[00:00:10]ku}[00:00:15]",
		);
		expect(line.words[0]).toMatchObject({
			word: "僕",
			endTime: 80,
			romanWord: "",
			ruby: [{ endTime: 50 }, { endTime: 80 }],
		});
		expect(line.words[1]).toMatchObject({
			word: "僕",
			startTime: 80,
			endTime: 150,
			romanWord: "boku",
		});
		expect(line.words[1].ruby).toBeUndefined();
	});

	it("preserves punctuation, spaces and mixed plain text", () => {
		const [line] = parseKrl(
			"「{会|[00:58:25]あ>[00:58:25]A}」[00:58:49]　{い|>[00:58:60]I}[00:58:97] text[00:59:14]",
		);
		expect(line.words.map((word) => word.word)).toEqual([
			"「会」",
			"　",
			"い",
			" text",
		]);
		expect(line.words[0].ruby).toEqual([
			{ word: "あ", startTime: 58250, endTime: 58490 },
		]);
	});

	it.each([
		"{僕|[00:00:02]ぼ[00:00:05]く>[00:00:02]bo[00:00:06]ku}[00:00:07]",
		"{僕|[00:00:02]ぼ[00:00:05]く>[00:00:02]boku}[00:00:07]",
		"{僕|[00:00:05]ぼ[00:00:02]く}[00:00:07]",
		"{僕|[00:00:02]ぼ[00:00:05]く}[00:00:04]",
		"[00:60:00]text[01:01:00]",
		"[00:00:02]text",
		"{僕|>[00:00:02]bo",
		"{僕|}[00:00:07]",
		"plain text",
		"",
	])("rejects invalid input: %s", (input) => {
		expect(() => parseKrl(input)).toThrow();
	});
});
