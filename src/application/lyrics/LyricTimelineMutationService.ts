import type {
	DocumentChangeEvent,
	EditorDocumentService,
} from "../../kernel/editor";
import type { LyricLine, LyricWord } from "../../types/ttml";
import {
	type ProcessedLyricLine,
	processSingleLine,
	type WordSegment,
} from "./LyricTimelineService";

const MIN_DIVIDER_WIDTH_PX = 15;
const MIN_WORD_DURATION_MS = 10;

const minDuration = (zoom: number) =>
	Math.max(MIN_WORD_DURATION_MS, (MIN_DIVIDER_WIDTH_PX / zoom) * 1000);

export function getUpdatedLineForDivider(
	originalLine: ProcessedLyricLine,
	segmentIndex: number,
	newTime: number,
	isGapCreation: boolean,
	zoom: number,
	lockedGapDirection: "left" | "right" | null = null,
): ProcessedLyricLine {
	const segments = [...originalLine.segments];
	const leftSegment = segments[segmentIndex] ?? null;
	const rightSegment = segments[segmentIndex + 1] ?? null;
	const minimum = minDuration(zoom);
	const minTime =
		leftSegment?.type === "word"
			? leftSegment.startTime + minimum
			: (leftSegment?.startTime ?? 0);
	const maxTime =
		rightSegment?.type === "word"
			? rightSegment.endTime - minimum
			: (rightSegment?.endTime ?? Infinity);
	const clamped = Math.max(0, Math.min(maxTime, Math.max(minTime, newTime)));
	let startTime = originalLine.startTime;
	let endTime = originalLine.endTime;

	if (segmentIndex === -1) {
		startTime =
			rightSegment?.type === "word"
				? Math.min(clamped, rightSegment.endTime - minimum)
				: clamped;
		if (rightSegment) segments[0] = { ...rightSegment, startTime };
	} else if (segmentIndex === segments.length - 1) {
		endTime =
			leftSegment?.type === "word"
				? Math.max(clamped, leftSegment.startTime + minimum)
				: clamped;
		if (leftSegment) segments[segmentIndex] = { ...leftSegment, endTime };
	} else if (leftSegment && rightSegment) {
		const originalTime = leftSegment.endTime;
		if (
			isGapCreation &&
			(lockedGapDirection === "right" || lockedGapDirection === null) &&
			clamped > originalTime
		) {
			segments[segmentIndex + 1] = { ...rightSegment, startTime: clamped };
			segments.splice(segmentIndex + 1, 0, {
				type: "gap",
				id: `preview-gap-${leftSegment.id}`,
				startTime: originalTime,
				endTime: clamped,
			});
		} else if (
			isGapCreation &&
			(lockedGapDirection === "left" || lockedGapDirection === null) &&
			clamped < originalTime
		) {
			segments[segmentIndex] = { ...leftSegment, endTime: clamped };
			segments.splice(segmentIndex + 1, 0, {
				type: "gap",
				id: `preview-gap-${leftSegment.id}`,
				startTime: clamped,
				endTime: originalTime,
			});
		} else {
			segments[segmentIndex] = { ...leftSegment, endTime: clamped };
			segments[segmentIndex + 1] = { ...rightSegment, startTime: clamped };
		}
	}
	return { ...originalLine, startTime, endTime, segments };
}

export function getUpdatedLineForWordPan(
	line: ProcessedLyricLine,
	wordId: string,
	desiredNewStartMS: number,
	zoom: number,
): ProcessedLyricLine {
	const index = line.segments.findIndex((segment) => segment.id === wordId);
	const segment = line.segments[index];
	if (segment?.type !== "word") return line;
	const left = line.segments[index - 1] ?? null;
	const right = line.segments[index + 1] ?? null;
	const duration = segment.endTime - segment.startTime;
	const minimum = minDuration(zoom);
	const minStart = !left
		? line.startTime
		: left.type === "gap"
			? left.startTime
			: left.startTime + minimum;
	const maxStart = !right
		? line.endTime - duration
		: right.type === "gap"
			? right.endTime - duration
			: right.endTime - minimum - duration;
	const startTime = Math.min(maxStart, Math.max(minStart, desiredNewStartMS));
	if (Math.round(startTime) === Math.round(segment.startTime)) return line;
	const segments = [...line.segments];
	segments[index] = { ...segment, startTime, endTime: startTime + duration };
	if (left) segments[index - 1] = { ...left, endTime: startTime };
	if (right)
		segments[index + 1] = { ...right, startTime: startTime + duration };
	return { ...line, segments };
}

export function getUpdatedLineForLinePan(
	line: ProcessedLyricLine,
	newStartMS: number,
): ProcessedLyricLine {
	const startTime = Math.max(0, newStartMS);
	const delta = startTime - line.startTime;
	if (Math.round(delta) === 0) return line;
	return {
		...line,
		startTime,
		endTime: line.endTime + delta,
		segments: line.segments.map((segment) => ({
			...segment,
			startTime: segment.startTime + delta,
			endTime: segment.endTime + delta,
		})),
	};
}

function applySegments(
	line: LyricLine,
	updated: ProcessedLyricLine,
): LyricLine {
	const words = new Map(
		updated.segments
			.filter(
				(segment): segment is WordSegment =>
					segment.type === "word" && !segment.isRuby,
			)
			.map((segment) => [segment.id, segment]),
	);
	const ruby = new Map<string, Map<number, WordSegment>>();
	for (const segment of updated.segments) {
		if (
			segment.type !== "word" ||
			!segment.isRuby ||
			!segment.parentId ||
			segment.rubyIndex == null
		)
			continue;
		const entries =
			ruby.get(segment.parentId) ?? new Map<number, WordSegment>();
		entries.set(segment.rubyIndex, segment);
		ruby.set(segment.parentId, entries);
	}
	return {
		...line,
		startTime: updated.startTime,
		endTime: updated.endTime,
		words: line.words.map((word) => {
			const next = words.get(word.id);
			let result = next
				? { ...word, startTime: next.startTime, endTime: next.endTime }
				: word;
			const rubyUpdates = ruby.get(word.id);
			if (rubyUpdates && result.ruby) {
				const nextRuby = result.ruby.map((rubyWord, index) => {
					const update = rubyUpdates.get(index);
					return update
						? {
								...rubyWord,
								startTime: update.startTime,
								endTime: update.endTime,
								word: update.word,
							}
						: rubyWord;
				});
				const valid = nextRuby.filter((item) => item.endTime > item.startTime);
				result = {
					...result,
					ruby: nextRuby,
					...(valid.length
						? {
								startTime: Math.min(...valid.map((item) => item.startTime)),
								endTime: Math.max(...valid.map((item) => item.endTime)),
							}
						: {}),
				};
			}
			return result;
		}),
	};
}

export type TimelineDocumentPort = Pick<
	EditorDocumentService,
	"getRevision" | "transact"
>;

export function commitUpdatedLine(
	document: TimelineDocumentPort,
	updatedLine: ProcessedLyricLine,
): DocumentChangeEvent | undefined {
	return document.transact(
		{
			source: "user",
			label: "Spectrogram adjust timeline",
			expectedRevision: document.getRevision(),
		},
		(draft) => {
			const index = draft.lyricLines.findIndex(
				(line) => line.id === updatedLine.id,
			);
			if (index >= 0)
				draft.lyricLines[index] = applySegments(
					draft.lyricLines[index],
					updatedLine,
				);
		},
	);
}

function fillRubyTimingFromWord(word: LyricWord) {
	if (
		!word.ruby?.length ||
		!word.ruby.every((ruby) => ruby.startTime === 0 && ruby.endTime === 0)
	)
		return;
	const duration = word.endTime - word.startTime;
	if (duration <= 0) return;
	let cursor = word.startTime;
	for (const ruby of word.ruby) {
		ruby.startTime = cursor;
		ruby.endTime = cursor + duration / word.ruby.length;
		cursor = ruby.endTime;
	}
}

export function tryInitializeZeroTimestampLine(
	line: LyricLine,
	newStartTime: number,
	newEndTime: number,
): boolean {
	if (
		!line.words.length ||
		!line.words.every((word) => word.startTime === 0 && word.endTime === 0)
	)
		return false;
	line.startTime = newStartTime;
	line.endTime = newEndTime;
	const nonEmptyCount = line.words.filter((word) => word.word.trim()).length;
	if (!nonEmptyCount) return true;
	const duration = (newEndTime - newStartTime) / nonEmptyCount;
	let index = 0;
	for (const word of line.words) {
		if (word.word.trim()) {
			word.startTime = newStartTime + index * duration;
			word.endTime = newStartTime + (index + 1) * duration;
			index += 1;
		}
		fillRubyTimingFromWord(word);
	}
	return true;
}

export function tryFixPartialInitialization(line: LyricLine): boolean {
	const hasZero = line.words.some(
		(word) => word.startTime === 0 && word.endTime === 0 && word.word.trim(),
	);
	const hasTimed = line.words.some(
		(word) => word.startTime !== 0 || word.endTime !== 0,
	);
	if (!hasZero || !hasTimed) return false;
	let changed = false;
	for (let index = 0; index < line.words.length; index += 1) {
		const anchor = line.words[index];
		if (anchor.startTime === 0 && anchor.endTime === 0) continue;
		const group = [anchor];
		let next = index + 1;
		while (
			next < line.words.length &&
			line.words[next].startTime === 0 &&
			line.words[next].endTime === 0
		)
			group.push(line.words[next++]);
		if (group.length === 1) continue;
		changed = true;
		const nonEmptyCount = group.filter((word) => word.word.trim()).length;
		const duration = anchor.endTime - anchor.startTime;
		if (nonEmptyCount && duration > 0) {
			let cursor = anchor.startTime;
			for (const word of group) {
				word.startTime = cursor;
				word.endTime = word.word.trim()
					? cursor + duration / nonEmptyCount
					: cursor;
				cursor = word.endTime;
				fillRubyTimingFromWord(word);
			}
		}
		index = next - 1;
	}
	return changed;
}

export function shiftLineStartTime(line: LyricLine, newStartTime: number) {
	const delta = newStartTime - line.startTime;
	if (!delta) return;
	line.startTime = newStartTime;
	for (const word of line.words) {
		word.startTime += delta;
		word.endTime += delta;
		for (const ruby of word.ruby ?? []) {
			ruby.startTime += delta;
			ruby.endTime += delta;
		}
	}
}

export function adjustLineEndTime(line: LyricLine, newEndTime: number) {
	const lastEnd = line.words.at(-1)?.endTime ?? line.endTime;
	const difference = lastEnd - newEndTime;
	line.endTime = newEndTime;
	if (!line.words.length) return;
	if (difference < 0) {
		const last = line.words.at(-1);
		if (last && newEndTime > last.startTime) last.endTime = newEndTime;
		return;
	}
	if (difference <= 0) return;
	const processed = processSingleLine(line);
	type Target = {
		duration: number;
		ref?: LyricWord | NonNullable<LyricWord["ruby"]>[number];
	};
	const wordMap = new Map(line.words.map((word) => [word.id, word]));
	const targets: Target[] = processed.segments.map((segment) => ({
		duration: segment.endTime - segment.startTime,
		ref:
			segment.type === "word"
				? segment.isRuby && segment.parentId && segment.rubyIndex != null
					? wordMap.get(segment.parentId)?.ruby?.[segment.rubyIndex]
					: wordMap.get(segment.id)
				: undefined,
	}));
	let remaining = difference;
	for (
		let index = targets.length - 1;
		index >= 0 && remaining > 0;
		index -= 1
	) {
		const reducible = Math.max(0, targets[index].duration - 50);
		const reduction = Math.min(remaining, reducible);
		targets[index].duration -= reduction;
		remaining -= reduction;
	}
	if (remaining > 0) {
		const current = targets.reduce((sum, target) => sum + target.duration, 0);
		const target = current - remaining;
		if (current > 0 && target > 0)
			for (const item of targets) item.duration *= target / current;
	}
	let cursor = line.startTime;
	for (const target of targets) {
		if (target.ref) {
			target.ref.startTime = cursor;
			target.ref.endTime = cursor + target.duration;
		}
		cursor += target.duration;
	}
	for (const word of line.words) {
		const valid =
			word.ruby?.filter((ruby) => ruby.endTime > ruby.startTime) ?? [];
		if (valid.length) {
			word.startTime = Math.min(...valid.map((ruby) => ruby.startTime));
			word.endTime = Math.max(...valid.map((ruby) => ruby.endTime));
		}
	}
}
