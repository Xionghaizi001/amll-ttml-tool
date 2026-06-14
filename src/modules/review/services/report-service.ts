import type { LyricLine, LyricWord, TTMLLyric } from "$/types/ttml";
import {
	DEFAULT_REVIEW_REPORT_EMPTY_TEXT,
	type ReviewReportFormat,
	renderFormattedReviewReport,
	renderReviewReportBlock,
} from "./report-format-service";

type WordChange = {
	wordId: string;
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

type WordPresenceChange = {
	wordId: string;
	lineNumber: number;
	isBG: boolean;
	word: string;
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

export type LineTimingChangeCandidate = {
	lineId: string;
	lineNumber: number;
	isBG: boolean;
	oldStart: number;
	newStart: number;
	oldEnd: number;
	newEnd: number;
};

export type TimingField = "startTime" | "endTime";

export type TimingReportSelectionItem = {
	wordId: string;
	field: TimingField;
};

export const DEFAULT_REVIEW_REPORT_TEXT = DEFAULT_REVIEW_REPORT_EMPTY_TEXT;

export type ReviewReportLineRef = {
	lineNumber: number;
	isBG: boolean;
};

export type ReviewReportBlockBase = {
	id: string;
	enabled: boolean;
};

export type ReviewReportBlock =
	| (ReviewReportBlockBase & {
			kind: "manual";
			content: string;
	  })
	| (ReviewReportBlockBase & {
			kind: "wordTextShared";
			lineRefs: ReviewReportLineRef[];
			oldWord: string;
			newWord: string;
	  })
	| (ReviewReportBlockBase & {
			kind: "wordTextGroup";
			lineNumber: number;
			isBG: boolean;
			changes: Array<{
				wordId?: string;
				oldWord: string;
				newWord: string;
				enabled?: boolean;
			}>;
	  })
	| (ReviewReportBlockBase & {
			kind: "wordText";
			wordId?: string;
			lineNumber: number;
			isBG: boolean;
			oldWord: string;
			newWord: string;
	  })
	| (ReviewReportBlockBase & {
			kind: "wordRoman";
			wordId?: string;
			lineNumber: number;
			isBG: boolean;
			word: string;
			oldRoman: string;
			newRoman: string;
	  })
	| (ReviewReportBlockBase & {
			kind: "lineTranslation";
			lineNumber: number;
			isBG: boolean;
			oldText: string;
			newText: string;
	  })
	| (ReviewReportBlockBase & {
			kind: "lineRoman";
			lineNumber: number;
			isBG: boolean;
			oldText: string;
			newText: string;
	  })
	| (ReviewReportBlockBase & {
			kind: "wordAndRoman";
			wordId?: string;
			lineNumber: number;
			isBG: boolean;
			oldWord: string;
			newWord: string;
			oldRoman: string;
			newRoman: string;
	  })
	| (ReviewReportBlockBase & {
			kind: "wordAdded";
			wordId?: string;
			lineNumber: number;
			isBG: boolean;
			word: string;
	  })
	| (ReviewReportBlockBase & {
			kind: "wordRemoved";
			wordId?: string;
			lineNumber: number;
			isBG: boolean;
			word: string;
	  })
	| (ReviewReportBlockBase & {
			kind: "lineAdded";
			lineNumber: number;
			isBG: boolean;
			text: string;
	  })
	| (ReviewReportBlockBase & {
			kind: "lineRemoved";
			lineNumber: number;
			isBG: boolean;
			text: string;
	  })
	| (ReviewReportBlockBase & {
			kind: "timeShift";
			operationId: string;
			offsetMs: number;
			lineRefs: ReviewReportLineRef[];
			targetCount: number;
			totalLineCount: number;
	  })
	| (ReviewReportBlockBase & {
			kind: "timing";
			operationId?: string;
			wordId: string;
			lineNumber: number;
			isBG: boolean;
			word: string;
			oldStart: number;
			newStart: number;
			oldEnd: number;
			newEnd: number;
			fields: TimingField[];
	  })
	| (ReviewReportBlockBase & {
			kind: "lineTiming";
			operationId?: string;
			lineId: string;
			lineNumber: number;
			isBG: boolean;
			oldStart: number;
			newStart: number;
			oldEnd: number;
			newEnd: number;
	  });

export type ReviewReport = {
	version: 1;
	blocks: ReviewReportBlock[];
};

export type ReviewReportInput = ReviewReport | string | null | undefined;

const createBlockId = (() => {
	let nextId = 0;
	return (prefix: string) => {
		nextId += 1;
		return `${prefix}-${Date.now().toString(36)}-${nextId.toString(36)}`;
	};
})();

export const createReviewReport = (
	blocks: ReviewReportBlock[] = [],
): ReviewReport => ({
	version: 1,
	blocks,
});

export function normalizeReportText(value: string) {
	const trimmed = value.trim();
	if (!trimmed || trimmed === DEFAULT_REVIEW_REPORT_TEXT) return "";
	return trimmed;
}

export const createManualReviewReport = (content: string): ReviewReport => {
	const trimmed = normalizeReportText(content);
	if (!trimmed) return createReviewReport();
	return createReviewReport([
		{
			id: createBlockId("manual"),
			kind: "manual",
			content: trimmed,
			enabled: true,
		},
	]);
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

const getLineText = (line: LyricLine) =>
	line.words.map((word) => word.word ?? "").join("") || "（空白）";

const getWordText = (word: LyricWord) => word.word || "（空白）";

const getLineNumber = (
	line: LyricLine,
	index: number,
	primary: Map<string, number>,
	fallback?: Map<string, number>,
) => {
	return primary.get(line.id) ?? fallback?.get(line.id) ?? index + 1;
};

const wrap = (value: string | number) => `\`${value}\``;
const buildSyncParts = (
	item: SyncChangeCandidate,
	fields?: Set<TimingField>,
) => {
	const startDelta = item.newStart - item.oldStart;
	const endDelta = item.newEnd - item.oldEnd;
	const useStart = fields ? fields.has("startTime") : true;
	const useEnd = fields ? fields.has("endTime") : true;
	const parts: string[] = [];
	if (useStart && startDelta !== 0) {
		const speed = startDelta < 0 ? "提前" : "延后";
		const prefix = "起始";
		parts.push(`${prefix}${speed}了 ${wrap(Math.abs(startDelta))} 毫秒`);
	}
	if (useEnd && endDelta !== 0) {
		const speed = endDelta < 0 ? "提前" : "延后";
		const prefix = "结束";
		parts.push(`${prefix}${speed}了 ${wrap(Math.abs(endDelta))} 毫秒`);
	}
	return parts;
};
const buildSyncReportBlocks = (
	candidates: SyncChangeCandidate[],
	fieldMap?: Map<string, Set<TimingField>>,
	lineCandidates: LineTimingChangeCandidate[] = [],
) => {
	const wordTimingBlocks = candidates
		.map((candidate) => {
			const fields = fieldMap?.get(candidate.wordId);
			if (fieldMap && !fields) return null;
			if (buildSyncParts(candidate, fields).length === 0) return null;
			return {
				id: createBlockId("timing"),
				kind: "timing" as const,
				enabled: true,
				wordId: candidate.wordId,
				lineNumber: candidate.lineNumber,
				isBG: candidate.isBG,
				word: candidate.word,
				oldStart: candidate.oldStart,
				newStart: candidate.newStart,
				oldEnd: candidate.oldEnd,
				newEnd: candidate.newEnd,
				fields: fieldMap
					? Array.from(fields ?? [])
					: (["startTime", "endTime"] satisfies TimingField[]),
			};
		})
		.filter((item): item is Extract<ReviewReportBlock, { kind: "timing" }> =>
			Boolean(item),
		);
	const lineTimingBlocks = lineCandidates
		.map((candidate) => {
			if (
				candidate.oldStart === candidate.newStart &&
				candidate.oldEnd === candidate.newEnd
			) {
				return null;
			}
			return {
				id: createBlockId("line-timing"),
				kind: "lineTiming" as const,
				enabled: true,
				lineId: candidate.lineId,
				lineNumber: candidate.lineNumber,
				isBG: candidate.isBG,
				oldStart: candidate.oldStart,
				newStart: candidate.newStart,
				oldEnd: candidate.oldEnd,
				newEnd: candidate.newEnd,
			};
		})
		.filter(
			(item): item is Extract<ReviewReportBlock, { kind: "lineTiming" }> =>
				Boolean(item),
		);
	return [...wordTimingBlocks, ...lineTimingBlocks];
};

export const isReviewReport = (value: unknown): value is ReviewReport => {
	if (!value || typeof value !== "object") return false;
	const maybe = value as Partial<ReviewReport>;
	return maybe.version === 1 && Array.isArray(maybe.blocks);
};

export const normalizeReviewReport = (
	report: ReviewReportInput,
): ReviewReport => {
	if (isReviewReport(report)) {
		return createReviewReport(report.blocks ?? []);
	}
	if (typeof report === "string") {
		return createManualReviewReport(report);
	}
	return createReviewReport();
};

export const normalizeReport = normalizeReportText;

export const getReviewReportBlockText = (
	block: ReviewReportBlock,
	format?: Partial<ReviewReportFormat> | null,
) => renderReviewReportBlock(block, format);

export const getReviewReportBlockLabel = (block: ReviewReportBlock) => {
	switch (block.kind) {
		case "manual":
			return "手写内容";
		case "wordTextShared":
		case "wordTextGroup":
		case "wordText":
		case "wordAdded":
		case "wordRemoved":
			return "歌词文本";
		case "wordRoman":
		case "lineRoman":
		case "wordAndRoman":
			return "音译";
		case "lineTranslation":
			return "翻译";
		case "lineAdded":
		case "lineRemoved":
			return "歌词行";
		case "timeShift":
			return "时轴平移";
		case "timing":
			return "时轴";
		case "lineTiming":
			return "行时轴修正";
	}
};

export const renderReviewReport = (
	report: ReviewReportInput,
	format?: Partial<ReviewReportFormat> | null,
) => {
	const normalized = normalizeReviewReport(report);
	return renderFormattedReviewReport(normalized, format);
};

export const hasReviewReportContent = (
	report: ReviewReportInput,
	format?: Partial<ReviewReportFormat> | null,
) => {
	return normalizeReviewReport(report).blocks.some(
		(block) =>
			block.enabled &&
			normalizeReportText(getReviewReportBlockText(block, format)),
	);
};

const reportLineRefKey = (ref: ReviewReportLineRef) =>
	`${ref.lineNumber}:${ref.isBG ? "bg" : "main"}`;

const reportLineRefsKey = (refs: ReviewReportLineRef[]) =>
	refs.map(reportLineRefKey).sort().join(",");

const reportLineKey = (lineNumber: number, isBG: boolean) =>
	`${lineNumber}:${isBG ? "bg" : "main"}`;

const getWordTextGroupChangeKey = (
	block: Extract<ReviewReportBlock, { kind: "wordTextGroup" }>,
	change: Extract<
		ReviewReportBlock,
		{ kind: "wordTextGroup" }
	>["changes"][number],
) =>
	change.wordId
		? `wordText:${change.wordId}`
		: `wordText:${reportLineKey(block.lineNumber, block.isBG)}:${change.oldWord}->${change.newWord}`;

const getReviewReportSelectionKey = (block: ReviewReportBlock) => {
	switch (block.kind) {
		case "manual":
			return `manual:${block.id}`;
		case "wordTextShared":
			return `${block.kind}:${block.oldWord}->${block.newWord}:${reportLineRefsKey(block.lineRefs)}`;
		case "wordTextGroup":
			return `${block.kind}:${reportLineKey(block.lineNumber, block.isBG)}`;
		case "wordText":
			return block.wordId
				? `${block.kind}:${block.wordId}`
				: `${block.kind}:${reportLineKey(block.lineNumber, block.isBG)}:${block.oldWord}->${block.newWord}`;
		case "wordRoman":
			return block.wordId
				? `${block.kind}:${block.wordId}`
				: `${block.kind}:${reportLineKey(block.lineNumber, block.isBG)}`;
		case "wordAndRoman":
			return block.wordId
				? `${block.kind}:${block.wordId}`
				: `${block.kind}:${reportLineKey(block.lineNumber, block.isBG)}`;
		case "wordAdded":
		case "wordRemoved":
			return block.wordId
				? `${block.kind}:${block.wordId}`
				: `${block.kind}:${reportLineKey(block.lineNumber, block.isBG)}:${block.word}`;
		case "lineTranslation":
		case "lineRoman":
			return `${block.kind}:${reportLineKey(block.lineNumber, block.isBG)}`;
		case "lineAdded":
		case "lineRemoved":
			return `${block.kind}:${reportLineKey(block.lineNumber, block.isBG)}:${block.text}`;
		case "timeShift":
			return `${block.kind}:${block.operationId}`;
		case "timing":
			return block.operationId
				? `${block.kind}:${block.operationId}:${block.wordId}`
				: `${block.kind}:${block.wordId}`;
		case "lineTiming":
			return block.operationId
				? `${block.kind}:${block.operationId}:${block.lineId}`
				: `${block.kind}:${block.lineId}`;
	}
};

const getReviewReportSelectionKeys = (block: ReviewReportBlock) => {
	const keys = [getReviewReportSelectionKey(block)];
	switch (block.kind) {
		case "wordText":
		case "wordRoman":
		case "wordAndRoman":
			if (block.wordId) keys.push(`wordEdit:${block.wordId}`);
			break;
		case "timing":
			keys.push(`timing:${block.wordId}`);
			break;
		case "lineTiming":
			keys.push(`lineTiming:${block.lineId}`);
			break;
	}
	return keys;
};

const getSelectionStateValue = (
	state: ReviewReportSelectionState,
	keys: string[],
) => {
	for (const key of keys) {
		const value = state.blocks.get(key);
		if (value !== undefined) return value;
	}
	return undefined;
};

type ReviewReportSelectionState = {
	blocks: Map<string, boolean>;
	groupChanges: Map<string, boolean>;
};

const collectReviewReportSelectionState = (
	reports: ReviewReportInput[],
): ReviewReportSelectionState => {
	const state: ReviewReportSelectionState = {
		blocks: new Map(),
		groupChanges: new Map(),
	};
	reports.forEach((report) => {
		normalizeReviewReport(report).blocks.forEach((block) => {
			getReviewReportSelectionKeys(block).forEach((key) => {
				state.blocks.set(key, block.enabled);
			});
			if (block.kind !== "wordTextGroup") return;
			block.changes.forEach((change) => {
				const key = getWordTextGroupChangeKey(block, change);
				const enabled = block.enabled && change.enabled !== false;
				state.blocks.set(key, enabled);
				state.groupChanges.set(key, enabled);
			});
		});
	});
	return state;
};

export const applyReviewReportSelectionState = (
	report: ReviewReportInput,
	baseReports: ReviewReportInput[],
) => {
	const selectionState = collectReviewReportSelectionState(baseReports);
	return createReviewReport(
		normalizeReviewReport(report).blocks.map((block) => {
			if (block.kind === "wordTextGroup") {
				const groupEnabled = getSelectionStateValue(
					selectionState,
					getReviewReportSelectionKeys(block),
				);
				const changes = block.changes.map((change) => {
					const key = getWordTextGroupChangeKey(block, change);
					const enabled =
						selectionState.groupChanges.get(key) ??
						selectionState.blocks.get(key);
					return enabled === undefined ? change : { ...change, enabled };
				});
				const hasChangeState = changes.some((change, index) => {
					const original = block.changes[index];
					return original && change.enabled !== original.enabled;
				});
				if (hasChangeState) {
					return {
						...block,
						enabled: changes.some((change) => change.enabled !== false),
						changes,
					};
				}
				if (groupEnabled !== undefined) {
					return {
						...block,
						enabled: groupEnabled,
						changes: changes.map((change) => ({
							...change,
							enabled: groupEnabled,
						})),
					};
				}
				return block;
			}
			const enabled = getSelectionStateValue(
				selectionState,
				getReviewReportSelectionKeys(block),
			);
			return enabled === undefined ? block : { ...block, enabled };
		}),
	);
};

const mergeTimingBlocks = (
	blocks: Extract<ReviewReportBlock, { kind: "timing" }>[],
) => {
	if (blocks.length <= 1) return blocks[0] ?? null;
	const first = blocks[0];
	const last = blocks[blocks.length - 1];
	if (!first || !last) return null;
	const operationIds = blocks
		.map((block) => block.operationId)
		.filter((id): id is string => Boolean(id));
	const mergedFields = new Set<TimingField>(
		blocks.flatMap((block) => block.fields),
	);
	const fields = Array.from(mergedFields).filter((field) =>
		field === "startTime"
			? first.oldStart !== last.newStart
			: first.oldEnd !== last.newEnd,
	);
	if (fields.length === 0) return null;
	return {
		...first,
		id: first.id,
		operationId:
			operationIds.length === blocks.length
				? `merged:${operationIds.join("+")}`
				: undefined,
		word: first.word || last.word,
		oldStart: first.oldStart,
		newStart: last.newStart,
		oldEnd: first.oldEnd,
		newEnd: last.newEnd,
		fields,
	};
};

const mergeLineTimingBlocks = (
	blocks: Extract<ReviewReportBlock, { kind: "lineTiming" }>[],
) => {
	if (blocks.length <= 1) return blocks[0] ?? null;
	const first = blocks[0];
	const last = blocks[blocks.length - 1];
	if (!first || !last) return null;
	if (first.oldStart === last.newStart && first.oldEnd === last.newEnd) {
		return null;
	}
	const operationIds = blocks
		.map((block) => block.operationId)
		.filter((id): id is string => Boolean(id));
	return {
		...first,
		id: first.id,
		operationId:
			operationIds.length === blocks.length
				? `merged:${operationIds.join("+")}`
				: undefined,
		oldStart: first.oldStart,
		newStart: last.newStart,
		oldEnd: first.oldEnd,
		newEnd: last.newEnd,
	};
};

type WordEditReportBlock =
	| Extract<ReviewReportBlock, { kind: "wordText" }>
	| Extract<ReviewReportBlock, { kind: "wordRoman" }>
	| Extract<ReviewReportBlock, { kind: "wordAndRoman" }>;

const mergeWordEditBlocks = (blocks: WordEditReportBlock[]) => {
	const first = blocks[0];
	if (!first) return null;
	if (blocks.length <= 1) return first;

	let oldWord: string | undefined;
	let newWord: string | undefined;
	let oldRoman: string | undefined;
	let newRoman: string | undefined;

	blocks.forEach((block) => {
		if (block.kind === "wordText" || block.kind === "wordAndRoman") {
			oldWord ??= block.oldWord;
			newWord = block.newWord;
		}
		if (block.kind === "wordRoman") {
			oldWord ??= block.word;
			newWord ??= block.word;
			oldRoman ??= block.oldRoman;
			newRoman = block.newRoman;
		}
		if (block.kind === "wordAndRoman") {
			oldRoman ??= block.oldRoman;
			newRoman = block.newRoman;
		}
	});

	const finalOldWord = oldWord ?? "";
	const finalNewWord = newWord ?? finalOldWord;
	const finalOldRoman = oldRoman ?? "";
	const finalNewRoman = newRoman ?? finalOldRoman;
	const hasWordChange = finalOldWord !== finalNewWord;
	const hasRomanChange = finalOldRoman !== finalNewRoman;
	if (!hasWordChange && !hasRomanChange) return null;
	if (hasWordChange && hasRomanChange) {
		return {
			id: first.id,
			kind: "wordAndRoman" as const,
			enabled: first.enabled,
			wordId: first.wordId,
			lineNumber: first.lineNumber,
			isBG: first.isBG,
			oldWord: finalOldWord,
			newWord: finalNewWord,
			oldRoman: finalOldRoman,
			newRoman: finalNewRoman,
		};
	}
	if (hasWordChange) {
		return {
			id: first.id,
			kind: "wordText" as const,
			enabled: first.enabled,
			wordId: first.wordId,
			lineNumber: first.lineNumber,
			isBG: first.isBG,
			oldWord: finalOldWord,
			newWord: finalNewWord,
		};
	}
	return {
		id: first.id,
		kind: "wordRoman" as const,
		enabled: first.enabled,
		wordId: first.wordId,
		lineNumber: first.lineNumber,
		isBG: first.isBG,
		word: finalNewWord || finalOldWord,
		oldRoman: finalOldRoman,
		newRoman: finalNewRoman,
	};
};

const mergeWordOperationBlocks = (blocks: ReviewReportBlock[]) => {
	const wordEditGroups = new Map<
		string,
		{
			firstIndex: number;
			blocks: WordEditReportBlock[];
		}
	>();
	const timingGroups = new Map<
		string,
		{
			firstIndex: number;
			blocks: Extract<ReviewReportBlock, { kind: "timing" }>[];
		}
	>();
	const lineTimingGroups = new Map<
		string,
		{
			firstIndex: number;
			blocks: Extract<ReviewReportBlock, { kind: "lineTiming" }>[];
		}
	>();
	const keys = blocks.map((block, index) => {
		if (
			(block.kind === "wordText" ||
				block.kind === "wordRoman" ||
				block.kind === "wordAndRoman") &&
			block.wordId
		) {
			const key = `wordEdit:${block.wordId}`;
			const group = wordEditGroups.get(key);
			if (group) {
				group.blocks.push(block);
			} else {
				wordEditGroups.set(key, { firstIndex: index, blocks: [block] });
			}
			return key;
		}
		if (block.kind === "timing") {
			const key = `timing:${block.wordId}`;
			const group = timingGroups.get(key);
			if (group) {
				group.blocks.push(block);
			} else {
				timingGroups.set(key, { firstIndex: index, blocks: [block] });
			}
			return key;
		}
		if (block.kind === "lineTiming") {
			const key = `lineTiming:${block.lineId}`;
			const group = lineTimingGroups.get(key);
			if (group) {
				group.blocks.push(block);
			} else {
				lineTimingGroups.set(key, { firstIndex: index, blocks: [block] });
			}
			return key;
		}
		return null;
	});

	return blocks
		.map<ReviewReportBlock | null>((block, index) => {
			const key = keys[index];
			if (!key) return block;
			if (
				block.kind === "wordText" ||
				block.kind === "wordRoman" ||
				block.kind === "wordAndRoman"
			) {
				const group = wordEditGroups.get(key);
				if (!group || group.firstIndex !== index) return null;
				return mergeWordEditBlocks(group.blocks);
			}
			if (block.kind === "timing") {
				const group = timingGroups.get(key);
				if (!group || group.firstIndex !== index) return null;
				return mergeTimingBlocks(group.blocks);
			}
			if (block.kind === "lineTiming") {
				const group = lineTimingGroups.get(key);
				if (!group || group.firstIndex !== index) return null;
				return mergeLineTimingBlocks(group.blocks);
			}
			return block;
		})
		.filter((block): block is ReviewReportBlock => Boolean(block));
};

export const mergeReports = (reports: ReviewReportInput[]) => {
	const seen = new Set<string>();
	const reportBlocks = reports.flatMap(
		(report) => normalizeReviewReport(report).blocks,
	);
	const blocks = mergeWordOperationBlocks(reportBlocks).filter((block) => {
		if (block.enabled) {
			const text = getReviewReportBlockText(block);
			if (!text) return false;
		}
		if (block.kind === "manual") return true;
		const dedupeKey =
			block.kind === "timeShift"
				? `${block.kind}:${block.operationId}`
				: getReviewReportSelectionKey(block);
		if (seen.has(dedupeKey)) return false;
		seen.add(dedupeKey);
		return true;
	});
	return createReviewReport(blocks);
};

const isOperationGeneratedReportBlock = (block: ReviewReportBlock) =>
	"operationId" in block && Boolean(block.operationId);

const isEditableGeneratedReportBlock = (block: ReviewReportBlock) =>
	(block.kind !== "manual" && block.kind !== "timing") ||
	isOperationGeneratedReportBlock(block);

export const keepManualReviewReportBlocks = (report: ReviewReportInput) =>
	createReviewReport(
		normalizeReviewReport(report).blocks.filter(
			(block) => block.kind === "manual",
		),
	);

export const keepPersistentReviewReportBlocks = (report: ReviewReportInput) => {
	// 自动编辑差异会随歌词变化重算；手写内容和已确认的时轴条目属于用户显式选择，需要跨刷新保留。
	return createReviewReport(
		normalizeReviewReport(report).blocks.filter(
			(block) => !isEditableGeneratedReportBlock(block),
		),
	);
};

export const buildEditReport = (freeze: TTMLLyric, staged: TTMLLyric) => {
	const stagedLineMap = buildLineMap(staged.lyricLines);
	const freezeDisplayMap = computeDisplayNumbers(freeze.lyricLines);
	const stagedDisplayMap = computeDisplayNumbers(staged.lyricLines);
	const wordTextChanges: WordChange[] = [];
	const wordAndRomanChanges: WordChange[] = [];
	const romanOnlyChanges: WordChange[] = [];
	const wordAdditions: WordPresenceChange[] = [];
	const wordRemovals: WordPresenceChange[] = [];
	const lineChanges: LineChange[] = [];
	const blocks: ReviewReportBlock[] = [];
	const matchedStagedLineIds = new Set<string>();

	freeze.lyricLines.forEach((freezeLine, index) => {
		// 优先按稳定 id 对齐；id 不存在或已被消费时再按位置兜底，避免插入/删除行后整段误报。
		const foundStagedById = stagedLineMap.get(freezeLine.id);
		const stagedById =
			foundStagedById && !matchedStagedLineIds.has(foundStagedById.id)
				? foundStagedById
				: undefined;
		const fallbackLine = staged.lyricLines[index];
		const stagedLine =
			stagedById ??
			(fallbackLine && !matchedStagedLineIds.has(fallbackLine.id)
				? fallbackLine
				: undefined);
		const lineNumber = getLineNumber(
			freezeLine,
			index,
			freezeDisplayMap,
			stagedDisplayMap,
		);
		if (!stagedLine) {
			blocks.push({
				id: createBlockId("line-removed"),
				kind: "lineRemoved",
				enabled: true,
				lineNumber,
				isBG: freezeLine.isBG ?? false,
				text: getLineText(freezeLine),
			});
			return;
		}
		matchedStagedLineIds.add(stagedLine.id);
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
		const matchedStagedWordIndexes = new Set<number>();
		const matchedStagedWordIds = new Set<string>();
		freezeLine.words.forEach((freezeWord, wordIndex) => {
			// 逐词也采用 id 优先、位置兜底的匹配策略，以支持分词微调后的报告仍能定位到原行。
			const foundStagedByWordId = stagedWordMap.get(freezeWord.id);
			const foundStagedIndexById = foundStagedByWordId
				? stagedLine.words.indexOf(foundStagedByWordId)
				: -1;
			const stagedByWordId =
				foundStagedByWordId &&
				foundStagedIndexById >= 0 &&
				!matchedStagedWordIndexes.has(foundStagedIndexById) &&
				!matchedStagedWordIds.has(foundStagedByWordId.id)
					? foundStagedByWordId
					: undefined;
			const fallbackWord = stagedLine.words[wordIndex];
			const stagedWord =
				stagedByWordId ??
				(fallbackWord && !matchedStagedWordIndexes.has(wordIndex)
					? fallbackWord
					: undefined);
			if (!stagedWord) {
				wordRemovals.push({
					wordId: freezeWord.id,
					lineNumber,
					isBG,
					word: getWordText(freezeWord),
				});
				return;
			}
			const stagedWordIndex =
				stagedByWordId && foundStagedIndexById >= 0
					? foundStagedIndexById
					: wordIndex;
			matchedStagedWordIndexes.add(stagedWordIndex);
			matchedStagedWordIds.add(stagedWord.id);
			const oldWord = freezeWord.word ?? "";
			const newWord = stagedWord.word ?? "";
			const oldRoman = freezeWord.romanWord ?? "";
			const newRoman = stagedWord.romanWord ?? "";
			if (oldWord !== newWord && oldRoman !== newRoman) {
				wordAndRomanChanges.push({
					wordId: freezeWord.id,
					lineNumber,
					isBG,
					oldWord,
					newWord,
					oldRoman,
					newRoman,
				});
			} else if (oldWord !== newWord) {
				wordTextChanges.push({
					wordId: freezeWord.id,
					lineNumber,
					isBG,
					oldWord,
					newWord,
					oldRoman,
					newRoman,
				});
			} else if (oldRoman !== newRoman) {
				romanOnlyChanges.push({
					wordId: freezeWord.id,
					lineNumber,
					isBG,
					oldWord,
					newWord,
					oldRoman,
					newRoman,
				});
			}
		});
		stagedLine.words.forEach((stagedWord, wordIndex) => {
			if (
				matchedStagedWordIndexes.has(wordIndex) ||
				matchedStagedWordIds.has(stagedWord.id)
			) {
				return;
			}
			wordAdditions.push({
				wordId: stagedWord.id,
				lineNumber,
				isBG,
				word: getWordText(stagedWord),
			});
		});
	});

	staged.lyricLines.forEach((stagedLine, index) => {
		if (matchedStagedLineIds.has(stagedLine.id)) return;
		blocks.push({
			id: createBlockId("line-added"),
			kind: "lineAdded",
			enabled: true,
			lineNumber: stagedDisplayMap.get(stagedLine.id) ?? index + 1,
			isBG: stagedLine.isBG ?? false,
			text: getLineText(stagedLine),
		});
	});

	const groupedByWord = new Map<string, WordChange[]>();
	wordTextChanges.forEach((change) => {
		const key = `${change.oldWord}=>${change.newWord}`;
		const list = groupedByWord.get(key) ?? [];
		list.push(change);
		groupedByWord.set(key, list);
	});
	const consumed = new Set<WordChange>();
	for (const group of groupedByWord.values()) {
		// 相同的文本修正如果跨多行出现，合并成一条报告，减少审阅输出里的重复噪声。
		const lineKeys = new Set(
			group.map((item) => `${item.lineNumber}:${item.isBG ? "bg" : "main"}`),
		);
		if (lineKeys.size <= 1) continue;
		const sample = group[0];
		blocks.push({
			id: createBlockId("word-text-shared"),
			kind: "wordTextShared",
			enabled: true,
			lineRefs: group.map((item) => ({
				lineNumber: item.lineNumber,
				isBG: item.isBG,
			})),
			oldWord: sample.oldWord,
			newWord: sample.newWord,
		});
		group.forEach((item) => {
			consumed.add(item);
		});
	}

	const remainingWordChanges = wordTextChanges.filter(
		(item) => !consumed.has(item),
	);
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
		(a, b) => a.lineNumber - b.lineNumber || Number(a.isBG) - Number(b.isBG),
	);
	groupedLines.forEach((entry) => {
		if (entry.items.length <= 1) return;
		blocks.push({
			id: createBlockId("word-text-group"),
			kind: "wordTextGroup",
			enabled: true,
			lineNumber: entry.lineNumber,
			isBG: entry.isBG,
			changes: entry.items.map((item) => ({
				wordId: item.wordId,
				oldWord: item.oldWord,
				newWord: item.newWord,
			})),
		});
		entry.items.forEach((item) => {
			consumed.add(item);
		});
	});

	const singleWordChanges = remainingWordChanges.filter(
		(item) => !consumed.has(item),
	);
	singleWordChanges
		.sort(
			(a, b) => a.lineNumber - b.lineNumber || Number(a.isBG) - Number(b.isBG),
		)
		.forEach((item) => {
			blocks.push({
				id: createBlockId("word-text"),
				kind: "wordText",
				enabled: true,
				wordId: item.wordId,
				lineNumber: item.lineNumber,
				isBG: item.isBG,
				oldWord: item.oldWord,
				newWord: item.newWord,
			});
		});

	wordRemovals
		.sort(
			(a, b) => a.lineNumber - b.lineNumber || Number(a.isBG) - Number(b.isBG),
		)
		.forEach((item) => {
			blocks.push({
				id: createBlockId("word-removed"),
				kind: "wordRemoved",
				enabled: true,
				wordId: item.wordId,
				lineNumber: item.lineNumber,
				isBG: item.isBG,
				word: item.word,
			});
		});

	wordAdditions
		.sort(
			(a, b) => a.lineNumber - b.lineNumber || Number(a.isBG) - Number(b.isBG),
		)
		.forEach((item) => {
			blocks.push({
				id: createBlockId("word-added"),
				kind: "wordAdded",
				enabled: true,
				wordId: item.wordId,
				lineNumber: item.lineNumber,
				isBG: item.isBG,
				word: item.word,
			});
		});

	romanOnlyChanges
		.sort(
			(a, b) => a.lineNumber - b.lineNumber || Number(a.isBG) - Number(b.isBG),
		)
		.forEach((item) => {
			blocks.push({
				id: createBlockId("word-roman"),
				kind: "wordRoman",
				enabled: true,
				wordId: item.wordId,
				lineNumber: item.lineNumber,
				isBG: item.isBG,
				word: item.oldWord,
				oldRoman: item.oldRoman,
				newRoman: item.newRoman,
			});
		});

	lineChanges
		.sort(
			(a, b) => a.lineNumber - b.lineNumber || Number(a.isBG) - Number(b.isBG),
		)
		.forEach((item) => {
			if (item.oldTrans !== item.newTrans) {
				blocks.push({
					id: createBlockId("line-translation"),
					kind: "lineTranslation",
					enabled: true,
					lineNumber: item.lineNumber,
					isBG: item.isBG,
					oldText: item.oldTrans,
					newText: item.newTrans,
				});
			}
			if (item.oldRoman !== item.newRoman) {
				blocks.push({
					id: createBlockId("line-roman"),
					kind: "lineRoman",
					enabled: true,
					lineNumber: item.lineNumber,
					isBG: item.isBG,
					oldText: item.oldRoman,
					newText: item.newRoman,
				});
			}
		});

	wordAndRomanChanges
		.sort(
			(a, b) => a.lineNumber - b.lineNumber || Number(a.isBG) - Number(b.isBG),
		)
		.forEach((item) => {
			blocks.push({
				id: createBlockId("word-and-roman"),
				kind: "wordAndRoman",
				enabled: true,
				wordId: item.wordId,
				lineNumber: item.lineNumber,
				isBG: item.isBG,
				oldWord: item.oldWord,
				newWord: item.newWord,
				oldRoman: item.oldRoman,
				newRoman: item.newRoman,
			});
		});

	return createReviewReport(blocks);
};

export const buildReviewReportFromDiffs = (
	baseReports: ReviewReportInput[],
	freeze: TTMLLyric,
	staged: TTMLLyric,
	syncReport: ReviewReportInput = createReviewReport(),
) => {
	const editReport = buildEditReport(freeze, staged);
	const editBlocks = normalizeReviewReport(editReport).blocks;
	const syncBlocks = normalizeReviewReport(syncReport).blocks;
	const generatedReport = applyReviewReportSelectionState(
		createReviewReport([...editBlocks, ...syncBlocks]),
		baseReports,
	);
	// 这里是所有入口的统一组装点：先保留用户持久条目，再用最新 freeze/staged 重建自动编辑差异。
	const persistentBaseReports = baseReports.map(
		keepPersistentReviewReportBlocks,
	);

	return mergeReports([...persistentBaseReports, generatedReport]);
};

export const buildSyncChanges = (freeze: TTMLLyric, staged: TTMLLyric) => {
	const stagedLineMap = buildLineMap(staged.lyricLines);
	const freezeDisplayMap = computeDisplayNumbers(freeze.lyricLines);
	const stagedDisplayMap = computeDisplayNumbers(staged.lyricLines);
	const reportLines: SyncChangeCandidate[] = [];
	const matchedStagedLineIds = new Set<string>();

	freeze.lyricLines.forEach((freezeLine, index) => {
		const foundStagedById = stagedLineMap.get(freezeLine.id);
		const stagedById =
			foundStagedById && !matchedStagedLineIds.has(foundStagedById.id)
				? foundStagedById
				: undefined;
		const fallbackLine = staged.lyricLines[index];
		const stagedLine =
			stagedById ??
			(fallbackLine && !matchedStagedLineIds.has(fallbackLine.id)
				? fallbackLine
				: undefined);
		if (!stagedLine) return;
		matchedStagedLineIds.add(stagedLine.id);
		const lineNumber = getLineNumber(
			freezeLine,
			index,
			freezeDisplayMap,
			stagedDisplayMap,
		);
		const isBG = freezeLine.isBG ?? stagedLine.isBG ?? false;
		const stagedWordMap = buildWordMap(stagedLine.words);
		const matchedStagedWordIndexes = new Set<number>();
		const matchedStagedWordIds = new Set<string>();
		freezeLine.words.forEach((freezeWord, wordIndex) => {
			const foundStagedByWordId = stagedWordMap.get(freezeWord.id);
			const foundStagedIndexById = foundStagedByWordId
				? stagedLine.words.indexOf(foundStagedByWordId)
				: -1;
			const stagedByWordId =
				foundStagedByWordId &&
				foundStagedIndexById >= 0 &&
				!matchedStagedWordIndexes.has(foundStagedIndexById) &&
				!matchedStagedWordIds.has(foundStagedByWordId.id)
					? foundStagedByWordId
					: undefined;
			const fallbackWord = stagedLine.words[wordIndex];
			const stagedWord =
				stagedByWordId ??
				(fallbackWord && !matchedStagedWordIndexes.has(wordIndex)
					? fallbackWord
					: undefined);
			if (!stagedWord) return;
			matchedStagedWordIndexes.add(
				stagedByWordId && foundStagedIndexById >= 0
					? foundStagedIndexById
					: wordIndex,
			);
			matchedStagedWordIds.add(stagedWord.id);
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

export const buildLineTimingChanges = (
	freeze: TTMLLyric,
	staged: TTMLLyric,
) => {
	const stagedLineMap = buildLineMap(staged.lyricLines);
	const freezeDisplayMap = computeDisplayNumbers(freeze.lyricLines);
	const stagedDisplayMap = computeDisplayNumbers(staged.lyricLines);
	const reportLines: LineTimingChangeCandidate[] = [];
	const matchedStagedLineIds = new Set<string>();

	freeze.lyricLines.forEach((freezeLine, index) => {
		const foundStagedById = stagedLineMap.get(freezeLine.id);
		const stagedById =
			foundStagedById && !matchedStagedLineIds.has(foundStagedById.id)
				? foundStagedById
				: undefined;
		const fallbackLine = staged.lyricLines[index];
		const stagedLine =
			stagedById ??
			(fallbackLine && !matchedStagedLineIds.has(fallbackLine.id)
				? fallbackLine
				: undefined);
		if (!stagedLine) return;
		matchedStagedLineIds.add(stagedLine.id);

		const oldStart = Math.round(freezeLine.startTime);
		const newStart = Math.round(stagedLine.startTime);
		const oldEnd = Math.round(freezeLine.endTime);
		const newEnd = Math.round(stagedLine.endTime);
		if (oldStart === newStart && oldEnd === newEnd) return;

		reportLines.push({
			lineId: freezeLine.id,
			lineNumber: getLineNumber(
				freezeLine,
				index,
				freezeDisplayMap,
				stagedDisplayMap,
			),
			isBG: freezeLine.isBG ?? stagedLine.isBG ?? false,
			oldStart,
			newStart,
			oldEnd,
			newEnd,
		});
	});

	return reportLines;
};

export const buildSyncReport = (
	reportLines: SyncChangeCandidate[],
	lineTimingLines: LineTimingChangeCandidate[] = [],
) => {
	return createReviewReport(
		buildSyncReportBlocks(reportLines, undefined, lineTimingLines),
	);
};
