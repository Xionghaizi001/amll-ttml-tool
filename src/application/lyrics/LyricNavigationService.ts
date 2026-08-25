import type { LyricLine, LyricWord, LyricWordBase } from "../../types/ttml";

export interface SyncWordUnit {
	id: string;
	word: LyricWord;
	wordIndex: number;
	rubyIndex?: number;
	rubyWord?: LyricWordBase;
}

export interface LineLocationResult {
	lines: LyricLine[];
	line: LyricLine;
	lineIndex: number;
}

export interface LineAndWordLocationResult extends LineLocationResult {
	word: LyricWord;
	wordIndex: number;
	rubyIndex?: number;
	rubyWord?: LyricWordBase;
	syncIndex: number;
	syncId: string;
	isFirstWord: boolean;
	isLastWord: boolean;
}

export const buildRubySelectionId = (wordId: string, rubyIndex: number) =>
	`${wordId}-ruby-${rubyIndex}`;

export const parseRubySelectionId = (id: string) => {
	const match = id.match(/^(.*)-ruby-(\d+)$/);
	return match
		? { wordId: match[1], rubyIndex: Number.parseInt(match[2], 10) }
		: undefined;
};

export const getSyncUnitsForLine = (line: LyricLine): SyncWordUnit[] =>
	line.words.flatMap((word, wordIndex) =>
		word.ruby?.length
			? word.ruby.map((rubyWord, rubyIndex) => ({
					id: buildRubySelectionId(word.id, rubyIndex),
					word,
					wordIndex,
					rubyIndex,
					rubyWord,
				}))
			: [{ id: word.id, word, wordIndex }],
	);

export const getSynchronizableUnits = (line: LyricLine) =>
	getSyncUnitsForLine(line).filter(
		(unit) => (unit.rubyWord?.word ?? unit.word.word).trim().length > 0,
	);

export const getFirstSynchronizableUnit = (line: LyricLine) =>
	getSynchronizableUnits(line)[0];
export const getLastSynchronizableUnit = (line: LyricLine) => {
	const units = getSynchronizableUnits(line);
	return units[units.length - 1];
};
export const isSynchronizableLine = (line: LyricLine) => !line.ignoreSync;

export function findLineLocation(
	lines: LyricLine[],
	selectedLineIds: Iterable<string>,
): LineLocationResult | undefined {
	const selected = new Set(selectedLineIds);
	const lineIndex = lines.findIndex((line) => selected.has(line.id));
	const line = lines[lineIndex];
	return line ? { lines, line, lineIndex } : undefined;
}

export function findLocation(
	lines: LyricLine[],
	selectedLineIds: Iterable<string>,
	selectedWordIds: Iterable<string>,
): LineAndWordLocationResult | undefined {
	const lineLocation = findLineLocation(lines, selectedLineIds);
	if (!lineLocation) return;
	const selected = new Set(selectedWordIds);
	const units = getSynchronizableUnits(lineLocation.line);
	let syncIndex = units.findIndex((unit) => selected.has(unit.id));
	if (syncIndex < 0) {
		const selectedId = selected.values().next().value as string | undefined;
		if (!selectedId) return;
		const parsed = parseRubySelectionId(selectedId);
		syncIndex = parsed
			? units.findIndex(
					(unit) =>
						unit.word.id === parsed.wordId &&
						unit.rubyIndex === parsed.rubyIndex,
				)
			: units.findIndex((unit) => unit.word.id === selectedId);
	}
	const unit = units[syncIndex];
	return unit
		? {
				...lineLocation,
				word: unit.word,
				wordIndex: unit.wordIndex,
				rubyIndex: unit.rubyIndex,
				rubyWord: unit.rubyWord,
				syncIndex,
				syncId: unit.id,
				isFirstWord: syncIndex === 0,
				isLastWord: syncIndex === units.length - 1,
			}
		: undefined;
}

export function findNextWord(
	lyricLines: LyricLine[],
	lineIndex: number,
	syncIndex: number,
) {
	const line = lyricLines[lineIndex];
	if (!line) return;
	const nextUnit = getSynchronizableUnits(line)[syncIndex + 1];
	if (nextUnit)
		return { line, lineIndex, unit: nextUnit, syncIndex: syncIndex + 1 };
	const nextOffset = lyricLines
		.slice(lineIndex + 1)
		.findIndex(
			(nextLine) =>
				isSynchronizableLine(nextLine) &&
				getSynchronizableUnits(nextLine).length > 0,
		);
	if (nextOffset < 0) return;
	const nextLineIndex = lineIndex + 1 + nextOffset;
	const nextLine = lyricLines[nextLineIndex];
	const firstUnit = nextLine && getSynchronizableUnits(nextLine)[0];
	return firstUnit && nextLine
		? {
				line: nextLine,
				lineIndex: nextLineIndex,
				unit: firstUnit,
				syncIndex: 0,
			}
		: undefined;
}

export function findPreviousWord(
	lyricLines: LyricLine[],
	lineIndex: number,
	syncIndex: number,
) {
	const line = lyricLines[lineIndex];
	if (!line) return;
	const units = getSynchronizableUnits(line);
	const previousUnit = units[syncIndex - 1];
	if (previousUnit)
		return { line, lineIndex, unit: previousUnit, syncIndex: syncIndex - 1 };
	for (let index = lineIndex - 1; index >= 0; index -= 1) {
		const previousLine = lyricLines[index];
		if (!previousLine || !isSynchronizableLine(previousLine)) continue;
		const previousUnits = getSynchronizableUnits(previousLine);
		const lastUnit = previousUnits[previousUnits.length - 1];
		if (lastUnit)
			return {
				line: previousLine,
				lineIndex: index,
				unit: lastUnit,
				syncIndex: previousUnits.length - 1,
			};
	}
}
