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

export function processLyricLines(lines: readonly LyricLine[]): ProcessedLyricLine[] {
	return lines.map(processSingleLine);
}
