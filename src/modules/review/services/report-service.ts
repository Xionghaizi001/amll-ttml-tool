import type { LyricLine, LyricWord, TTMLLyric } from "$/types/ttml";

type WordChange = {
	lineNumber: number;
	isBG: boolean;
	oldWord: string;
	newWord: string;
	oldRoman: string;
	newRoman: string;
};

type LineChange = {
	lineNumber: number;
	isBG: boolean;
	oldTrans: string;
	newTrans: string;
	oldRoman: string;
	newRoman: string;
};

export type SyncChangeCandidate = {
	wordId: string;
	lineNumber: number;
	isBG: boolean;
	word: string;
	oldStart: number;
	newStart: number;
	oldEnd: number;
	newEnd: number;
};

export type TimingStashItem = {
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
const formatLineLabel = (lineNumber: number, isBG?: boolean) =>
	`第 ${lineNumber} 行${isBG ? "（背景）" : ""}`;
const formatLineLabelList = (
	items: Array<{ lineNumber: number; isBG?: boolean }>,
) => {
	const seen = new Set<string>();
	const list = items
		.filter((item) => {
			const key = `${item.lineNumber}:${item.isBG ? "bg" : "main"}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort(
			(a, b) =>
				a.lineNumber - b.lineNumber ||
				Number(a.isBG) - Number(b.isBG),
		);
	return list.map((item) => formatLineLabel(item.lineNumber, item.isBG)).join("、");
};
const buildSyncParts = (
	item: SyncChangeCandidate,
	fields?: Set<TimingStashItem["field"]>,
) => {
	const startDelta = item.newStart - item.oldStart;
	const endDelta = item.newEnd - item.oldEnd;
	const useStart = fields ? fields.has("startTime") : true;
	const useEnd = fields ? fields.has("endTime") : true;
	const parts: string[] = [];
	if (useStart && startDelta !== 0) {
		const speed = startDelta < 0 ? "延后" : "提前";
		const prefix = "起始";
		parts.push(`${prefix}${speed}了 ${wrap(Math.abs(startDelta))} 毫秒`);
	}
	if (useEnd && endDelta !== 0) {
		const speed = endDelta < 0 ? "延后" : "提前";
		const prefix = "结束";
		parts.push(`${prefix}${speed}了 ${wrap(Math.abs(endDelta))} 毫秒`);
	}
	return parts;
};
const buildSyncReportItems = (
	candidates: SyncChangeCandidate[],
	fieldMap?: Map<string, Set<TimingStashItem["field"]>>,
) => {
	return candidates
		.map((candidate) => {
			const fields = fieldMap?.get(candidate.wordId);
			if (fieldMap && !fields) return null;
			const parts = buildSyncParts(candidate, fields);
			if (parts.length === 0) return null;
			return {
				lineNumber: candidate.lineNumber,
				isBG: candidate.isBG,
				detail: `${wrap(candidate.word)} ${parts.join("，")}`,
			};
		})
		.filter(
			(
				item,
			): item is {
				lineNumber: number;
				isBG: boolean;
				detail: string;
			} => Boolean(item),
		);
};
const formatSyncReport = (
	items: Array<{ lineNumber: number; isBG: boolean; detail: string }>,
	options?: { groupByLine?: boolean },
) => {
	if (!options?.groupByLine) {
		const lines = items
			.sort(
				(a, b) =>
					a.lineNumber - b.lineNumber || Number(a.isBG) - Number(b.isBG),
			)
			.map((item) => `${formatLineLabel(item.lineNumber, item.isBG)}：${item.detail}`);
		return formatReport(lines);
	}
	const lineMap = new Map<
		string,
		{ lineNumber: number; isBG: boolean; list: string[] }
	>();
	for (const item of items) {
		const key = `${item.lineNumber}:${item.isBG ? "bg" : "main"}`;
		const entry = lineMap.get(key) ?? {
			lineNumber: item.lineNumber,
			isBG: item.isBG,
			list: [],
		};
		entry.list.push(item.detail);
		lineMap.set(key, entry);
	}
	const lines = Array.from(lineMap.values())
		.sort(
			(a, b) =>
				a.lineNumber - b.lineNumber || Number(a.isBG) - Number(b.isBG),
		)
		.map(
			(entry) =>
				`${formatLineLabel(entry.lineNumber, entry.isBG)}：${entry.list.join(
					"；",
				)}`,
		);
	return formatReport(lines);
};

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
		const isBG = freezeLine.isBG ?? stagedLine.isBG ?? false;
		const oldTrans = freezeLine.translatedLyric ?? "";
		const newTrans = stagedLine.translatedLyric ?? "";
		const oldLineRoman = freezeLine.romanLyric ?? "";
		const newLineRoman = stagedLine.romanLyric ?? "";
		if (oldTrans !== newTrans || oldLineRoman !== newLineRoman) {
			lineChanges.push({
				lineNumber,
				isBG,
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
					isBG,
					oldWord,
					newWord,
					oldRoman,
					newRoman,
				});
			} else if (oldWord !== newWord) {
				wordTextChanges.push({
					lineNumber,
					isBG,
					oldWord,
					newWord,
					oldRoman,
					newRoman,
				});
			} else if (oldRoman !== newRoman) {
				romanOnlyChanges.push({
					lineNumber,
					isBG,
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
		const lineKeys = new Set(
			group.map((item) => `${item.lineNumber}:${item.isBG ? "bg" : "main"}`),
		);
		if (lineKeys.size <= 1) continue;
		const sample = group[0];
		reportLines.push(
			`${formatLineLabelList(group)}：${wrap(sample.oldWord)} 存在错误，应为 ${wrap(
				sample.newWord,
			)}`,
		);
		group.forEach((item) => {
			consumed.add(item);
		});
	}

	const remainingWordChanges = wordTextChanges.filter((item) => !consumed.has(item));
	const groupByLine = new Map<
		string,
		{ lineNumber: number; isBG: boolean; items: WordChange[] }
	>();
	remainingWordChanges.forEach((item) => {
		const key = `${item.lineNumber}:${item.isBG ? "bg" : "main"}`;
		const entry = groupByLine.get(key) ?? {
			lineNumber: item.lineNumber,
			isBG: item.isBG,
			items: [],
		};
		entry.items.push(item);
		groupByLine.set(key, entry);
	});
	const groupedLines = Array.from(groupByLine.values()).sort(
		(a, b) =>
			a.lineNumber - b.lineNumber || Number(a.isBG) - Number(b.isBG),
	);
	groupedLines.forEach((entry) => {
		if (entry.items.length <= 1) return;
		const oldWords = entry.items.map((item) => item.oldWord);
		const newWords = entry.items.map((item) => item.newWord);
		reportLines.push(
			`${formatLineLabel(entry.lineNumber, entry.isBG)}：${oldWords
				.map(wrap)
				.join("、")} 分别存在错误，应为 ${newWords.map(wrap).join("、")}`,
		);
		entry.items.forEach((item) => {
			consumed.add(item);
		});
	});

	const singleWordChanges = remainingWordChanges.filter((item) => !consumed.has(item));
	singleWordChanges
		.sort(
			(a, b) => a.lineNumber - b.lineNumber || Number(a.isBG) - Number(b.isBG),
		)
		.forEach((item) => {
			reportLines.push(
				`${formatLineLabel(item.lineNumber, item.isBG)}：${wrap(
					item.oldWord,
				)} 存在错误，应为 ${wrap(
					item.newWord,
				)}`,
			);
		});

	romanOnlyChanges
		.sort(
			(a, b) => a.lineNumber - b.lineNumber || Number(a.isBG) - Number(b.isBG),
		)
		.forEach((item) => {
			reportLines.push(
				`${formatLineLabel(item.lineNumber, item.isBG)}：${wrap(
					item.oldWord,
				)} 音译 ${wrap(
					item.oldRoman,
				)} 存在错误，应为 ${wrap(item.newRoman)}`,
			);
		});

	lineChanges
		.sort(
			(a, b) => a.lineNumber - b.lineNumber || Number(a.isBG) - Number(b.isBG),
		)
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
				reportLines.push(
					`${formatLineLabel(item.lineNumber, item.isBG)}：${parts.join("，")}`,
				);
			}
		});

	wordAndRomanChanges
		.sort(
			(a, b) => a.lineNumber - b.lineNumber || Number(a.isBG) - Number(b.isBG),
		)
		.forEach((item) => {
			const parts = [
				`${wrap(item.oldWord)} 存在错误，应为 ${wrap(item.newWord)}`,
				`音译 ${wrap(item.oldRoman)} 存在错误，应为 ${wrap(item.newRoman)}`,
			];
			reportLines.push(
				`${formatLineLabel(item.lineNumber, item.isBG)}：${parts.join("，")}`,
			);
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
		const isBG = freezeLine.isBG ?? stagedLine.isBG ?? false;
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
				isBG,
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
	const items = buildSyncReportItems(reportLines);
	return formatSyncReport(items);
};

export const buildSyncReportFromStash = (
	candidates: SyncChangeCandidate[],
	stash: TimingStashItem[],
) => {
	const candidateMap = new Map<string, SyncChangeCandidate>();
	for (const item of candidates) {
		candidateMap.set(item.wordId, item);
	}
	const fieldMap = new Map<string, Set<TimingStashItem["field"]>>();
	for (const item of stash) {
		const fields = fieldMap.get(item.wordId) ?? new Set();
		fields.add(item.field);
		fieldMap.set(item.wordId, fields);
	}
	const items = buildSyncReportItems(
		Array.from(fieldMap.entries())
			.map(([wordId]) => candidateMap.get(wordId))
			.filter(
				(item): item is SyncChangeCandidate =>
					Boolean(item),
			),
		fieldMap,
	);
	return formatSyncReport(items, { groupByLine: true });
};
