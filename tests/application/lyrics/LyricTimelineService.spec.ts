import { describe, expect, it } from "vitest";
import type { LyricLine } from "$/types/ttml";
import {
	generateBoundaries,
	normalizeLineTime,
	processSingleLine,
	resolveBoundaryVisualState,
	resolveWordVisualState,
} from "$/application/lyrics/LyricTimelineService";

const line: LyricLine = {
	id: "line-1",
	startTime: 100,
	endTime: 500,
	translatedLyric: "",
	romanLyric: "",
	isBG: false,
	isDuet: false,
	ignoreSync: false,
	words: [
		{
			id: "word-1",
			startTime: 200,
			endTime: 300,
			word: "a",
			romanWord: "",
			obscene: false,
			emptyBeat: 0,
		},
	],
};

describe("LyricTimelineService", () => {
	it("creates stable word and gap segments without changing the line", () => {
		const processed = processSingleLine(line);
		expect(processed.segments.map((segment) => segment.id)).toEqual([
			"line-1-gap-100",
			"word-1",
			"line-1-gap-end",
		]);
		expect(line.words[0].startTime).toBe(200);
	});

	it("builds timeline boundaries and resolves adjacent word visual states", () => {
		const boundaries = generateBoundaries(processSingleLine(line));
		expect(boundaries.map((boundary) => boundary.kind)).toEqual([
			"line-start",
			"internal",
			"internal",
			"line-end",
		]);
		const wordStartBoundary = boundaries[1];
		expect(wordStartBoundary.rightWordId).toBe("word-1");
		expect(
			resolveBoundaryVisualState(wordStartBoundary, {
				selectedWordId: "word-1",
				hoveredWordId: null,
				focusedWordId: null,
				draggingBoundaryId: null,
			}),
		).toBe("selected");
		expect(resolveWordVisualState("word-1", "word-1", "word-1", null)).toBe(
			"selected-hovered",
		);
	});

	it("normalizes line bounds from the first and last words", () => {
		const target = structuredClone(line);
		target.startTime = 0;
		target.endTime = 0;
		normalizeLineTime(target);
		expect([target.startTime, target.endTime]).toEqual([200, 300]);
	});
});
