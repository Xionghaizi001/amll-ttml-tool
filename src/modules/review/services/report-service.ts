import type { LyricLine, LyricWord, TTMLLyric } from "$/types/ttml";

type WordChange = {
	lineNumber: number;
	oldWord: string;
	newWord: string;
	oldRoman: string;
	newRoman: string;
};

type LineChange = {
	lineNumber: number;
	oldTrans: string;
	newTrans: string;
	oldRoman: string;
	newRoman: string;
};

export type SyncChangeCandidate = {
	wordId: string;
	lineNumber: number;
	word: string;
	oldStart: number;
	newStart: number;
	oldEnd: number;
	newEnd: number;
};

export type TimeAxisStashItem = {
	wordId: string;
	field: "startTime" | "endTime";
};

const computeDisplayNumbers = (lines: LyricLine[]) => {
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

const buildLineMap = (lines: LyricLine[]) => {
	const map = new Map<string, LyricLine>();
	lines.forEach((line) => {
		map.set(line.id, line);
	});
	return map;
};

const buildWordMap = (words: LyricWord[]) => {
	const map = new Map<string, LyricWord>();
	words.forEach((word) => {
		map.set(word.id, word);
	});
	return map;
};

const getLineNumber = (
	line: LyricLine,
	index: number,
	primary: Map<string, number>,
	fallback?: Map<string, number>,
) => {
	return primary.get(line.id) ?? fallback?.get(line.id) ?? index + 1;
};

const wrap = (value: string | number) => `\`${value}\``;

export const formatReport = (items: string[]) => {
	if (items.length === 0) return "未检测到差异。";
	return items.map((line) => `- ${line}`).join("\n");
};

export const normalizeReport = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed || trimmed === "未检测到差异。") return "";
	return trimmed;
};

export const mergeReports = (reports: string[]) => {
	const parts = reports.map(normalizeReport).filter(Boolean);
	if (parts.length === 0) return "未检测到差异。";
	return parts.join("\n");
};

export const buildEditReport = (freeze: TTMLLyric, staged: TTMLLyric) => {
	const stagedLineMap = buildLineMap(staged.lyricLines);
	const freezeDisplayMap = computeDisplayNumbers(freeze.lyricLines);
	const stagedDisplayMap = computeDisplayNumbers(staged.lyricLines);
	const wordTextChanges: WordChange[] = [];
	const wordAndRomanChanges: WordChange[] = [];
	const romanOnlyChanges: WordChange[] = [];
	const lineChanges: LineChange[] = [];

	freeze.lyricLines.forEach((freezeLine, index) => {
		const stagedLine = stagedLineMap.get(freezeLine.id) ?? staged.lyricLines[index];
		if (!stagedLine) return;
		const lineNumber = getLineNumber(
			freezeLine,
			index,
			freezeDisplayMap,
			stagedDisplayMap,
		);
		const oldTrans = freezeLine.translatedLyric ?? "";
		const newTrans = stagedLine.translatedLyric ?? "";
		const oldLineRoman = freezeLine.romanLyric ?? "";
		const newLineRoman = stagedLine.romanLyric ?? "";
		if (oldTrans !== newTrans || oldLineRoman !== newLineRoman) {
			lineChanges.push({
				lineNumber,
				oldTrans,
				newTrans,
				oldRoman: oldLineRoman,
				newRoman: newLineRoman,
			});
		}
		const stagedWordMap = buildWordMap(stagedLine.words);
		freezeLine.words.forEach((freezeWord, wordIndex) => {
			const stagedWord =
				stagedWordMap.get(freezeWord.id) ?? stagedLine.words[wordIndex];
			if (!stagedWord) return;
			const oldWord = freezeWord.word ?? "";
			const newWord = stagedWord.word ?? "";
			const oldRoman = freezeWord.romanWord ?? "";
			const newRoman = stagedWord.romanWord ?? "";
			if (oldWord !== newWord && oldRoman !== newRoman) {
				wordAndRomanChanges.push({
					lineNumber,
					oldWord,
					newWord,
					oldRoman,
					newRoman,
				});
			} else if (oldWord !== newWord) {
				wordTextChanges.push({
					lineNumber,
					oldWord,
					newWord,
					oldRoman,
					newRoman,
				});
			} else if (oldRoman !== newRoman) {
				romanOnlyChanges.push({
					lineNumber,
					oldWord,
					newWord,
					oldRoman,
					newRoman,
				});
			}
		});
	});

	const reportLines: string[] = [];
	const groupedByWord = new Map<string, WordChange[]>();
	wordTextChanges.forEach((change) => {
		const key = `${change.oldWord}=>${change.newWord}`;
		const list = groupedByWord.get(key) ?? [];
		list.push(change);
		groupedByWord.set(key, list);
	});
	const consumed = new Set<WordChange>();
	for (const group of groupedByWord.values()) {
		const lineNumbers = Array.from(new Set(group.map((item) => item.lineNumber)));
		if (lineNumbers.length <= 1) continue;
		lineNumbers.sort((a, b) => a - b);
		const sample = group[0];
		reportLines.push(
			`第 ${lineNumbers.join("、")} 行：${wrap(sample.oldWord)} 存在错误，应为 ${wrap(
				sample.newWord,
			)}`,
		);
		group.forEach((item) => {
			consumed.add(item);
		});
	}

	const remainingWordChanges = wordTextChanges.filter((item) => !consumed.has(item));
	const groupByLine = new Map<number, WordChange[]>();
	remainingWordChanges.forEach((item) => {
		const list = groupByLine.get(item.lineNumber) ?? [];
		list.push(item);
		groupByLine.set(item.lineNumber, list);
	});
	const lineNumbers = Array.from(groupByLine.keys()).sort((a, b) => a - b);
	lineNumbers.forEach((lineNumber) => {
		const list = groupByLine.get(lineNumber) ?? [];
		if (list.length <= 1) return;
		const oldWords = list.map((item) => item.oldWord);
		const newWords = list.map((item) => item.newWord);
		reportLines.push(
			`第 ${lineNumber} 行：${oldWords.map(wrap).join("、")} 分别存在错误，应为 ${newWords
				.map(wrap)
				.join("、")}`,
		);
		list.forEach((item) => {
			consumed.add(item);
		});
	});

	const singleWordChanges = remainingWordChanges.filter((item) => !consumed.has(item));
	singleWordChanges
		.sort((a, b) => a.lineNumber - b.lineNumber)
		.forEach((item) => {
			reportLines.push(
				`第 ${item.lineNumber} 行：${wrap(item.oldWord)} 存在错误，应为 ${wrap(
					item.newWord,
				)}`,
			);
		});

	romanOnlyChanges
		.sort((a, b) => a.lineNumber - b.lineNumber)
		.forEach((item) => {
			reportLines.push(
				`第 ${item.lineNumber} 行：${wrap(item.oldWord)} 音译 ${wrap(
					item.oldRoman,
				)} 存在错误，应为 ${wrap(item.newRoman)}`,
			);
		});

	lineChanges
		.sort((a, b) => a.lineNumber - b.lineNumber)
		.forEach((item) => {
			const parts: string[] = [];
			if (item.oldTrans !== item.newTrans) {
				parts.push(
					`翻译 ${wrap(item.oldTrans)} 存在错误，应为 ${wrap(item.newTrans)}`,
				);
			}
			if (item.oldRoman !== item.newRoman) {
				parts.push(
					`音译 ${wrap(item.oldRoman)} 存在错误，应为 ${wrap(item.newRoman)}`,
				);
			}
			if (parts.length > 0) {
				reportLines.push(`第 ${item.lineNumber} 行：${parts.join("，")}`);
			}
		});

	wordAndRomanChanges
		.sort((a, b) => a.lineNumber - b.lineNumber)
		.forEach((item) => {
			const parts = [
				`${wrap(item.oldWord)} 存在错误，应为 ${wrap(item.newWord)}`,
				`音译 ${wrap(item.oldRoman)} 存在错误，应为 ${wrap(item.newRoman)}`,
			];
			reportLines.push(`第 ${item.lineNumber} 行：${parts.join("，")}`);
		});

	return formatReport(reportLines);
};

export const buildSyncChanges = (freeze: TTMLLyric, staged: TTMLLyric) => {
	const stagedLineMap = buildLineMap(staged.lyricLines);
	const freezeDisplayMap = computeDisplayNumbers(freeze.lyricLines);
	const stagedDisplayMap = computeDisplayNumbers(staged.lyricLines);
	const reportLines: SyncChangeCandidate[] = [];

	freeze.lyricLines.forEach((freezeLine, index) => {
		const stagedLine = stagedLineMap.get(freezeLine.id) ?? staged.lyricLines[index];
		if (!stagedLine) return;
		const lineNumber = getLineNumber(
			freezeLine,
			index,
			freezeDisplayMap,
			stagedDisplayMap,
		);
		const stagedWordMap = buildWordMap(stagedLine.words);
		freezeLine.words.forEach((freezeWord, wordIndex) => {
			const stagedWord =
				stagedWordMap.get(freezeWord.id) ?? stagedLine.words[wordIndex];
			if (!stagedWord) return;
			const oldStart = Math.round(freezeWord.startTime);
			const newStart = Math.round(stagedWord.startTime);
			const oldEnd = Math.round(freezeWord.endTime);
			const newEnd = Math.round(stagedWord.endTime);
			if (oldStart === newStart && oldEnd === newEnd) return;
			reportLines.push({
				wordId: freezeWord.id,
				lineNumber,
				word: freezeWord.word || "（空白）",
				oldStart,
				newStart,
				oldEnd,
				newEnd,
			});
		});
	});

	return reportLines;
};

export const buildSyncReport = (reportLines: SyncChangeCandidate[]) => {
	const sentences = reportLines
		.sort((a, b) => a.lineNumber - b.lineNumber)
		.map((item) => {
			const startDelta = item.newStart - item.oldStart;
			const endDelta = item.newEnd - item.oldEnd;
			const delta = startDelta !== 0 ? startDelta : endDelta;
			const speed = delta < 0 ? "快" : "慢";
			return `第 ${item.lineNumber} 行：${wrap(item.word)} 偏${speed}了 ${wrap(
				Math.abs(delta),
			)} 毫秒`;
		})
		.filter((item): item is string => Boolean(item));

	return formatReport(sentences);
};

export const buildSyncReportFromStash = (
	candidates: SyncChangeCandidate[],
	stash: TimeAxisStashItem[],
) => {
	const candidateMap = new Map<string, SyncChangeCandidate>();
	for (const item of candidates) {
		candidateMap.set(item.wordId, item);
	}
	const fieldMap = new Map<string, Set<TimeAxisStashItem["field"]>>();
	for (const item of stash) {
		const fields = fieldMap.get(item.wordId) ?? new Set();
		fields.add(item.field);
		fieldMap.set(item.wordId, fields);
	}
	const items = Array.from(fieldMap.entries())
		.map(([wordId, fields]) => {
			const candidate = candidateMap.get(wordId);
			if (!candidate) return null;
			const startDelta = candidate.newStart - candidate.oldStart;
			const endDelta = candidate.newEnd - candidate.oldEnd;
			const parts: string[] = [];
			if (fields.has("startTime") && startDelta !== 0) {
				const speed = startDelta < 0 ? "快" : "慢";
				const prefix = fields.has("endTime") ? "起始" : "";
				parts.push(
					`${prefix}偏${speed}了 ${wrap(Math.abs(startDelta))} 毫秒`,
				);
			}
			if (fields.has("endTime") && endDelta !== 0) {
				const speed = endDelta < 0 ? "快" : "慢";
				const prefix = fields.has("startTime") ? "结束" : "";
				parts.push(
					`${prefix}偏${speed}了 ${wrap(Math.abs(endDelta))} 毫秒`,
				);
			}
			if (parts.length === 0) return null;
			return {
				lineNumber: candidate.lineNumber,
				text: `第 ${candidate.lineNumber} 行：${wrap(candidate.word)} ${parts.join(
					"，",
				)}`,
			};
		})
		.filter(
			(
				item,
			): item is {
				lineNumber: number;
				text: string;
			} => Boolean(item),
		)
		.sort((a, b) => a.lineNumber - b.lineNumber);
	return formatReport(items.map((item) => item.text));
};
