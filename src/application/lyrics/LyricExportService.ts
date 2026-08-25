import type { LyricLine } from "../../types/ttml";

export interface ExportableLyricLine extends LyricLine {
	words: LyricLine["words"];
}

/** Remove editor-only timing precision before passing lyrics to a format stringifier. */
export function prepareLyricLinesForExport(
	lines: readonly LyricLine[],
): ExportableLyricLine[] {
	return lines.map((line) => ({
		...line,
		startTime: Math.round(line.startTime),
		endTime: Math.round(line.endTime),
		words: line.words.map((word) => ({
			...word,
			startTime: Math.round(word.startTime),
			endTime: Math.round(word.endTime),
		})),
	}));
}

export function getExportFileName(
	saveFileName: string,
	extension: string,
): string {
	const baseName = saveFileName.replace(/\.[^.]*$/, "");
	return `${baseName}.${extension}`;
}
