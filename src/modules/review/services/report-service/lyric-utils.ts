import type { LyricLine, LyricWord } from "$/types/ttml";

export const computeDisplayNumbers = (lines: LyricLine[]) => {
	let current = 0;
	const map = new Map<string, number>();
	lines.forEach((line, index) => {
		if (index === 0 || !line.isBG) {
			current += 1;
		}
		map.set(line.id, current);
	});
	return map;
};

export const buildLineMap = (lines: LyricLine[]) => {
	const map = new Map<string, LyricLine>();
	lines.forEach((line) => {
		map.set(line.id, line);
	});
	return map;
};

export const buildWordMap = (words: LyricWord[]) => {
	const map = new Map<string, LyricWord>();
	words.forEach((word) => {
		map.set(word.id, word);
	});
	return map;
};

export const getLineText = (line: LyricLine) =>
	line.words.map((word) => word.word ?? "").join("") || "（空白）";

export const getWordText = (word: LyricWord) => word.word || "（空白）";

export const getLineNumber = (
	line: LyricLine,
	index: number,
	primary: Map<string, number>,
	fallback?: Map<string, number>,
) => {
	return primary.get(line.id) ?? fallback?.get(line.id) ?? index + 1;
};
