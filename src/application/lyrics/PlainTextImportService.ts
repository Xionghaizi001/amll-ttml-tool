import { newLyricLine, newLyricWord, type LyricLine } from "../../types/ttml";

export type PlainTextImportMode =
	| "lyric"
	| "lyric-trans"
	| "lyric-roman"
	| "lyric-trans-roman";

export type PlainTextLineSeparatorMode =
	| "interleaved-line"
	| "same-line-separator";

export interface PlainTextImportOptions {
	mode: PlainTextImportMode;
	lineSeparatorMode: PlainTextLineSeparatorMode;
	lineSeparator: string;
	swapTransAndRoman: boolean;
	wordSeparator: string;
	enableSpecialPrefix: boolean;
	bgLyricPrefix: string;
	duetLyricPrefix: string;
	enableEmptyBeat: boolean;
	emptyBeatSymbol: string;
}

const fieldForMode = (mode: PlainTextImportMode) => {
	switch (mode) {
		case "lyric-trans":
			return ["translatedLyric"] as const;
		case "lyric-roman":
			return ["romanLyric"] as const;
		case "lyric-trans-roman":
			return ["translatedLyric", "romanLyric"] as const;
		default:
			return [] as const;
	}
};

/** Parse plain text lyrics without depending on React, Jotai, or the DOM. */
export function parsePlainTextLyrics(
	text: string,
	options: PlainTextImportOptions,
): LyricLine[] {
	const lines = text.split("\n");
	const result: LyricLine[] = [];

	const addLine = (orig = "", trans = "", roman = "") => {
		let finalOrig = orig;
		let isBG = false;
		let isDuet = false;

		if (options.enableSpecialPrefix) {
			while (true) {
				if (finalOrig.startsWith(options.bgLyricPrefix)) {
					isBG = true;
					finalOrig = finalOrig.slice(options.bgLyricPrefix.length);
				} else if (finalOrig.startsWith(options.duetLyricPrefix)) {
					isDuet = true;
					finalOrig = finalOrig.slice(options.duetLyricPrefix.length);
				} else {
					break;
				}
			}
		}

		const line: LyricLine = {
			...newLyricLine(),
			words: [{ ...newLyricWord(), word: finalOrig }],
			translatedLyric: trans,
			romanLyric: roman,
			isBG,
			isDuet,
		};
		result.push(line);
		return line;
	};

	const [sub1, sub2] = fieldForMode(options.mode);
	if (!sub1) {
		for (const line of lines) addLine(line);
	} else if (options.lineSeparatorMode === "interleaved-line") {
		const skip = 1 + (sub1 ? 1 : 0) + (sub2 ? 1 : 0);
		for (let i = 0; i < lines.length; i += skip) {
			const line = addLine(lines[i]);
			if (sub1) line[sub1] = lines[i + 1] ?? "";
			if (sub2) line[sub2] = lines[i + 2] ?? "";
		}
	} else {
		for (const lineText of lines) {
			const parts = lineText.split(options.lineSeparator);
			const line = addLine(parts[0] ?? "");
			if (sub1) line[sub1] = parts[1] ?? "";
			if (sub2) line[sub2] = parts[2] ?? "";
		}
	}

	if (options.swapTransAndRoman) {
		for (const line of result) {
			[line.romanLyric, line.translatedLyric] = [
				line.translatedLyric,
				line.romanLyric,
			];
		}
	}

	if (options.wordSeparator.length > 0) {
		for (const line of result) {
			const wholeLine = line.words.map((word) => word.word).join("");
			line.words = wholeLine.split(options.wordSeparator).map((word) => ({
				...newLyricWord(),
				word,
			}));
		}
	}

	if (options.enableEmptyBeat && options.emptyBeatSymbol.length > 0) {
		for (const line of result) {
			for (const word of line.words) {
				while (word.word.endsWith(options.emptyBeatSymbol)) {
					word.word = word.word.slice(0, -options.emptyBeatSymbol.length);
					word.emptyBeat += 1;
				}
			}
		}
	}

	return result;
}
