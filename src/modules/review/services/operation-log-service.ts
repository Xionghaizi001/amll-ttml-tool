import { uid } from "uid";
import type { TTMLLyric } from "$/types/ttml";

export type ReviewOperationKind = "timeShift";

type ReviewOperationBase = {
	id: string;
	kind: ReviewOperationKind;
	createdAt: string;
};

export type ReviewTimeShiftOperation = ReviewOperationBase & {
	kind: "timeShift";
	offsetMs: number;
	targetLineIds: string[];
};

export type ReviewOperationRecord = ReviewTimeShiftOperation;

export const createReviewTimeShiftOperation = (options: {
	offsetMs: number;
	targetLineIds: string[];
}): ReviewTimeShiftOperation => ({
	id: uid(),
	kind: "timeShift",
	createdAt: new Date().toISOString(),
	offsetMs: options.offsetMs,
	targetLineIds: options.targetLineIds,
});

const cloneLyric = (data: TTMLLyric): TTMLLyric =>
	JSON.parse(JSON.stringify(data)) as TTMLLyric;

const shiftTime = (value: number, offsetMs: number) =>
	Math.max(0, value + offsetMs);

export const applyReviewTimeShiftOperation = (
	lyric: TTMLLyric,
	operation: ReviewTimeShiftOperation,
) => {
	const targetLineIds = new Set(operation.targetLineIds);
	if (targetLineIds.size === 0 || operation.offsetMs === 0) return lyric;

	lyric.lyricLines.forEach((line) => {
		if (!targetLineIds.has(line.id)) return;

		line.startTime = shiftTime(line.startTime, operation.offsetMs);
		line.endTime = shiftTime(line.endTime, operation.offsetMs);

		line.words.forEach((word) => {
			word.startTime = shiftTime(word.startTime, operation.offsetMs);
			word.endTime = shiftTime(word.endTime, operation.offsetMs);

			word.ruby?.forEach((rubyWord) => {
				rubyWord.startTime = shiftTime(rubyWord.startTime, operation.offsetMs);
				rubyWord.endTime = shiftTime(rubyWord.endTime, operation.offsetMs);
			});
		});
	});

	return lyric;
};

export const applyReviewOperation = (
	lyric: TTMLLyric,
	operation: ReviewOperationRecord,
) => {
	switch (operation.kind) {
		case "timeShift":
			return applyReviewTimeShiftOperation(lyric, operation);
	}
};

export const replayReviewOperations = (
	base: TTMLLyric,
	operations: ReviewOperationRecord[],
) => {
	const replayed = cloneLyric(base);
	operations.forEach((operation) => {
		applyReviewOperation(replayed, operation);
	});
	return replayed;
};
