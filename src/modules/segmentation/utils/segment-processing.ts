import { atom } from "jotai";
import { lyricLinesAtom } from "$/states/main.ts";
import { processLyricLines } from "$/application/lyrics";
export { processSingleLine } from "$/application/lyrics";
export type {
	GapSegment,
	ProcessedLyricLine,
	ProcessedSegment,
	WordSegment,
} from "$/application/lyrics";
import type { ProcessedLyricLine } from "$/application/lyrics";

export const processedLyricLinesAtom = atom<ProcessedLyricLine[]>((get) => {
	const { lyricLines } = get(lyricLinesAtom);
	if (!lyricLines) return [];
	return processLyricLines(lyricLines);
});
