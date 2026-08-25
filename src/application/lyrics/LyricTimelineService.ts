import type { LyricLine, LyricWord } from "../../types/ttml";

export interface WordSegment extends LyricWord {
	type: "word";
	isRuby?: boolean;
	parentId?: string;
	rubyIndex?: number;
}

export interface GapSegment {
	type: "gap";
	id: string;
	startTime: number;
	endTime: number;
}

export type ProcessedSegment = WordSegment | GapSegment;

export interface ProcessedLyricLine extends Omit<LyricLine, "words"> {
	segments: ProcessedSegment[];
}

export type BoundaryKind = "line-start" | "internal" | "line-end";

export type BoundaryVisualState =
	| "default"
	| "selected"
	| "hovered"
	| "editing";

export type WordVisualState =
	| "default"
	| "selected"
	| "hovered"
	| "selected-hovered";

export interface TimelineBoundary {
	id: string;
	timeMs: number;
	segmentIndex: number;
	kind: BoundaryKind;
	leftSegmentId: string | null;
	rightSegmentId: string | null;
	leftWordId: string | null;
	rightWordId: string | null;
}

export interface BoundaryStateOptions {
	selectedWordId: string | null;
	hoveredWordId: string | null;
	focusedWordId: string | null;
	draggingBoundaryId: string | null;
}

export function processSingleLine(line: LyricLine): ProcessedLyricLine {
	const rawWordSegments: WordSegment[] = line.words.flatMap(
		(word): WordSegment[] => {
			if (word.ruby && word.ruby.length > 0) {
				return word.ruby.map((rubyWord, index) => ({
					type: "word" as const,
					id: `${word.id}-ruby-${index}`,
					word: rubyWord.word,
					startTime: rubyWord.startTime,
					endTime: rubyWord.endTime,
					obscene: word.obscene,
					emptyBeat: word.emptyBeat,
					romanWord: "",
					isRuby: true,
					parentId: word.id,
					rubyIndex: index,
				}));
			}
			return [{ ...word, type: "word" as const }];
		},
	);

	const validWords = rawWordSegments
		.filter((word) => word.endTime > word.startTime)
		.sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
	const segments: ProcessedSegment[] = [];
	let cursor = line.startTime;

	for (const word of validWords) {
		if (word.startTime > cursor) {
			segments.push({
				type: "gap",
				id: `${line.id}-gap-${cursor}`,
				startTime: cursor,
				endTime: word.startTime,
			});
		}
		segments.push(word);
		cursor = word.endTime;
	}
	if (line.endTime > cursor) {
		segments.push({
			type: "gap",
			id: `${line.id}-gap-end`,
			startTime: cursor,
			endTime: line.endTime,
		});
	}
	return { ...line, segments };
}

export function processLyricLines(
	lines: readonly LyricLine[],
): ProcessedLyricLine[] {
	return lines.map(processSingleLine);
}

export function normalizeLineTime(line: LyricLine): void {
	const firstWord = line.words[0];
	const lastWord = line.words.at(-1);
	if (!firstWord || !lastWord) return;
	line.startTime = firstWord.startTime || line.startTime;
	line.endTime = lastWord.endTime || line.endTime;
}

export function generateBoundaries(
	line: ProcessedLyricLine,
): TimelineBoundary[] {
	const { id: lineId, startTime, segments } = line;
	if (startTime == null) return [];

	const boundaries: TimelineBoundary[] = [
		{
			id: `${lineId}:start`,
			timeMs: startTime,
			segmentIndex: -1,
			kind: "line-start",
			leftSegmentId: null,
			rightSegmentId: segments[0]?.id ?? null,
			leftWordId: null,
			rightWordId: segments[0]?.type === "word" ? segments[0].id : null,
		},
	];

	segments.forEach((segment, index) => {
		const nextSegment = segments[index + 1];
		const resolvedEndTime =
			segment.endTime ??
			nextSegment?.startTime ??
			line.endTime ??
			segment.startTime;
		boundaries.push({
			id: `${lineId}:boundary:${segment.id}`,
			timeMs: resolvedEndTime,
			segmentIndex: index,
			kind: index === segments.length - 1 ? "line-end" : "internal",
			leftSegmentId: segment.id,
			rightSegmentId: nextSegment?.id ?? null,
			leftWordId: segment.type === "word" ? segment.id : null,
			rightWordId: nextSegment?.type === "word" ? nextSegment.id : null,
		});
	});

	return boundaries;
}

export function resolveBoundaryVisualState(
	boundary: TimelineBoundary,
	options: BoundaryStateOptions,
): BoundaryVisualState {
	const { selectedWordId, hoveredWordId, focusedWordId, draggingBoundaryId } =
		options;
	if (draggingBoundaryId === boundary.id) return "editing";

	const adjacentWordIds = [boundary.leftWordId, boundary.rightWordId];
	if (
		(hoveredWordId && adjacentWordIds.includes(hoveredWordId)) ||
		(focusedWordId && adjacentWordIds.includes(focusedWordId))
	)
		return "hovered";
	if (selectedWordId && adjacentWordIds.includes(selectedWordId))
		return "selected";
	return "default";
}

export function resolveWordVisualState(
	wordId: string,
	selectedWordId: string | null,
	hoveredWordId: string | null,
	focusedWordId: string | null,
): WordVisualState {
	const isSelected = selectedWordId === wordId;
	const isHovered = hoveredWordId === wordId || focusedWordId === wordId;
	if (isSelected && isHovered) return "selected-hovered";
	if (isSelected) return "selected";
	if (isHovered) return "hovered";
	return "default";
}
