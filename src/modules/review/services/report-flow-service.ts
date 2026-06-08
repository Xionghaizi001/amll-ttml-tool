import type { TTMLLyric } from "$/types/ttml";
import type {
	ReviewLineTimingOperation,
	ReviewOperationRecord,
} from "./operation-log-service";
import { replayReviewOperations } from "./operation-log-service";
import {
	buildReviewReportFromDiffs,
	createReviewReport,
	keepPersistentReviewReportBlocks,
	mergeReports,
	type ReviewReportBlock,
	type ReviewReportLineRef,
	type ReviewReportInput,
} from "./report-service";

const computeDisplayNumbers = (lyric: TTMLLyric) => {
	let current = 0;
	const map = new Map<string, number>();
	lyric.lyricLines.forEach((line, index) => {
		if (index === 0 || !line.isBG) {
			current += 1;
		}
		map.set(line.id, current);
	});
	return map;
};

type TimeShiftReportScope = {
	id: string;
	offsetMs: number;
	targetLineIds: string[];
	operations: ReviewOperationRecord[];
};

const buildLineTimeDeltaMap = (before: TTMLLyric, after: TTMLLyric) => {
	const afterLineMap = new Map(after.lyricLines.map((line) => [line.id, line]));
	const deltaMap = new Map<string, number>();
	before.lyricLines.forEach((line) => {
		const afterLine = afterLineMap.get(line.id);
		if (!afterLine) return;
		const startDelta = Math.round(afterLine.startTime - line.startTime);
		const endDelta = Math.round(afterLine.endTime - line.endTime);
		// 平移报告以行起始时间为代表；起始时间已触底不动时，用结束时间兜底保留实际变化。
		deltaMap.set(line.id, startDelta !== 0 ? startDelta : endDelta);
	});
	return deltaMap;
};

const buildTimeShiftReportScopes = (
	operations: ReviewOperationRecord[],
	freeze: TTMLLyric,
): TimeShiftReportScope[] => {
	// 平移报告按“用户当次选择的作用域”合并，而不是按每一行的最终净位移重分组。
	// 这样全局平移后再局部微调时，全局记录仍保持为“全部歌词行”，不会被拆成大量散落行。
	// 报告里的 offset 使用同一作用域操作 replay 后的实际差值，避免负向平移触底 0ms 时误报原始操作量。
	const lineOrder = new Map<string, number>();
	freeze.lyricLines.forEach((line, index) => {
		lineOrder.set(line.id, index);
	});
	const scopeByKey = new Map<string, TimeShiftReportScope>();

	operations.forEach((operation) => {
		if (operation.kind !== "timeShift" || operation.offsetMs === 0) return;

		const targetLineIds = Array.from(new Set(operation.targetLineIds))
			.filter((lineId) => lineOrder.has(lineId))
			.sort((a, b) => (lineOrder.get(a) ?? 0) - (lineOrder.get(b) ?? 0));
		if (targetLineIds.length === 0) return;

		// 全局作用域使用固定 key，避免行 id 串变化影响合并语义；局部作用域则用排序后的行集合精确匹配。
		const key =
			targetLineIds.length === freeze.lyricLines.length
				? "all"
				: targetLineIds.join(",");
		const scope = scopeByKey.get(key) ?? {
			id: `merged:${key}`,
			offsetMs: 0,
			targetLineIds,
			operations: [],
		};
		scope.operations.push(operation);
		scopeByKey.set(key, scope);
	});

	return Array.from(scopeByKey.values()).flatMap((scope) => {
		const replayedScope = replayReviewOperations(freeze, scope.operations);
		const deltaByLineId = buildLineTimeDeltaMap(freeze, replayedScope);
		const splitByActualDelta = new Map<number, string[]>();
		scope.targetLineIds.forEach((lineId) => {
			const delta = deltaByLineId.get(lineId) ?? 0;
			if (delta === 0) return;
			const lineIds = splitByActualDelta.get(delta) ?? [];
			lineIds.push(lineId);
			splitByActualDelta.set(delta, lineIds);
		});
		return Array.from(splitByActualDelta.entries()).map(
			([offsetMs, targetLineIds]) => ({
				id: `${scope.id}:${offsetMs}:${targetLineIds.join(",")}`,
				offsetMs,
				targetLineIds,
				operations: scope.operations,
			}),
		);
	});
};

const buildTimeShiftReportBlock = (
	scope: TimeShiftReportScope,
	freeze: TTMLLyric,
): Extract<ReviewReportBlock, { kind: "timeShift" }> | null => {
	const displayNumbers = computeDisplayNumbers(freeze);
	const targetIds = new Set(scope.targetLineIds);
	const lineRefs: ReviewReportLineRef[] = freeze.lyricLines
		.filter((line) => targetIds.has(line.id))
		.map((line, index) => ({
			lineNumber: displayNumbers.get(line.id) ?? index + 1,
			isBG: line.isBG ?? false,
		}));

	if (scope.offsetMs === 0 || lineRefs.length === 0) return null;

	return {
		id: `time-shift-${scope.id}`,
		kind: "timeShift",
		enabled: true,
		operationId: scope.id,
		offsetMs: scope.offsetMs,
		lineRefs,
		targetCount: lineRefs.length,
		totalLineCount: freeze.lyricLines.length,
	};
};

const buildLineTimingOperationReportBlocks = (
	operation: ReviewLineTimingOperation,
	freeze: TTMLLyric,
): ReviewReportBlock[] => {
	const displayNumbers = computeDisplayNumbers(freeze);
	const freezeLine = freeze.lyricLines.find(
		(line) => line.id === operation.lineId,
	);
	const fallbackLineIndex = freeze.lyricLines.findIndex(
		(line) => line.id === operation.lineId,
	);
	const lineNumber =
		displayNumbers.get(operation.lineId) ??
		(fallbackLineIndex >= 0 ? fallbackLineIndex + 1 : 1);
	const isBG = freezeLine?.isBG ?? operation.before.isBG ?? false;
	const blocks: ReviewReportBlock[] = [];

	const beforeSegments = new Map(
		operation.before.segments.map((segment) => [segment.id, segment]),
	);
	const afterSegments = new Map(
		operation.after.segments.map((segment) => [segment.id, segment]),
	);

	operation.reportItems.forEach((item) => {
		const beforeSegment = beforeSegments.get(item.wordId);
		const afterSegment = afterSegments.get(item.wordId);
		if (!beforeSegment || !afterSegment) return;

		const fields = item.fields.filter((field) => {
			if (field === "startTime") {
				return (
					Math.round(beforeSegment.startTime) !==
					Math.round(afterSegment.startTime)
				);
			}
			return (
				Math.round(beforeSegment.endTime) !== Math.round(afterSegment.endTime)
			);
		});
		if (fields.length === 0) return;

		blocks.push({
			id: `timing-${operation.id}-${item.wordId}`,
			kind: "timing",
			enabled: true,
			operationId: operation.id,
			wordId: item.wordId,
			lineNumber,
			isBG,
			word: beforeSegment.word || "（空白）",
			oldStart: Math.round(beforeSegment.startTime),
			newStart: Math.round(afterSegment.startTime),
			oldEnd: Math.round(beforeSegment.endTime),
			newEnd: Math.round(afterSegment.endTime),
			fields,
		});
	});

	if (
		Math.round(operation.before.startTime) !==
			Math.round(operation.after.startTime) ||
		Math.round(operation.before.endTime) !== Math.round(operation.after.endTime)
	) {
		blocks.push({
			id: `line-timing-${operation.id}`,
			kind: "lineTiming",
			enabled: true,
			operationId: operation.id,
			lineId: operation.lineId,
			lineNumber,
			isBG,
			oldStart: Math.round(operation.before.startTime),
			newStart: Math.round(operation.after.startTime),
			oldEnd: Math.round(operation.before.endTime),
			newEnd: Math.round(operation.after.endTime),
		});
	}

	return blocks;
};

const buildOperationReport = (
	freeze: TTMLLyric,
	operations: ReviewOperationRecord[],
) =>
	createReviewReport(
		[
			...buildTimeShiftReportScopes(operations, freeze)
				.map<ReviewReportBlock | null>((scope) =>
					buildTimeShiftReportBlock(scope, freeze),
				)
				.filter((block): block is ReviewReportBlock => Boolean(block)),
			...operations.flatMap((operation) =>
				operation.kind === "lineTiming"
					? buildLineTimingOperationReportBlocks(operation, freeze)
					: [],
			),
		],
	);

export const getReviewReplayBase = (
	freeze: TTMLLyric,
	operations: ReviewOperationRecord[],
) => replayReviewOperations(freeze, operations);

export const buildReviewReportFromOperationReplay = (
	baseReports: ReviewReportInput[],
	freeze: TTMLLyric,
	staged: TTMLLyric,
	operations: ReviewOperationRecord[],
	syncReport?: ReviewReportInput,
) => {
	const replayedBase = getReviewReplayBase(freeze, operations);
	const operationReport = buildOperationReport(freeze, operations);
	const persistentBaseReports = baseReports.map(
		keepPersistentReviewReportBlocks,
	);
	const currentSyncReport = syncReport ?? createReviewReport();
	const currentReport = buildReviewReportFromDiffs(
		persistentBaseReports,
		replayedBase,
		staged,
		currentSyncReport,
	);

	return mergeReports([operationReport, currentReport]);
};
