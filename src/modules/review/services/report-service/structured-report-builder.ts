import type {
	ReviewElementPath,
	StructuredReviewChange,
	StructuredReviewChangeBlock,
	StructuredReviewUpdates,
} from "$/types/structured-review-report";
import type { TTMLLyric } from "$/types/ttml";
import {
	toStructuredValue,
	valuesEqual,
} from "$/utils/structured-review-value";
import type { ReviewReport, ReviewReportBlock } from "./types";

/** 导出结构化 JSON 时去掉未启用/无实质改动的报告 block，避免冗余。 */
const pruneReportForExport = (report: ReviewReport): ReviewReport => {
	const blocks: ReviewReportBlock[] = [];
	for (const block of report.blocks) {
		if (!block.enabled) continue;
		if (block.kind === "wordTextGroup") {
			const changes = block.changes.filter(
				(change) => change.enabled !== false,
			);
			if (changes.length === 0) continue;
			blocks.push({ ...block, changes });
			continue;
		}
		blocks.push(block);
	}
	return {
		version: 1,
		blocks,
	};
};

const isContainer = (value: unknown): value is object =>
	typeof value === "object" && value !== null;

const buildElementChanges = (
	freeze: TTMLLyric,
	staged: TTMLLyric,
): StructuredReviewChange[] => {
	const changes: StructuredReviewChange[] = [];

	const addChange = (
		path: ReviewElementPath,
		before: unknown,
		after: unknown,
		beforeExists: boolean,
		afterExists: boolean,
	) => {
		const beforeValue = beforeExists ? toStructuredValue(before) : null;
		const afterValue = afterExists ? toStructuredValue(after) : null;
		const hasBefore = beforeExists && beforeValue !== null;
		const hasAfter = afterExists && afterValue !== null;
		if (!hasBefore && !hasAfter) return;
		changes.push({
			path,
			beforeExists: hasBefore,
			afterExists: hasAfter,
			before: hasBefore ? beforeValue : null,
			after: hasAfter ? afterValue : null,
		});
	};

	const visit = (
		before: unknown,
		after: unknown,
		path: ReviewElementPath,
		beforeExists = true,
		afterExists = true,
	) => {
		if (beforeExists && afterExists && valuesEqual(before, after)) return;

		// 单侧存在：整棵子树作为一条原子变更（便于按行/按词选择接受）
		if (beforeExists !== afterExists) {
			addChange(path, before, after, beforeExists, afterExists);
			return;
		}

		const beforeArray = Array.isArray(before);
		const afterArray = Array.isArray(after);
		if (beforeArray && afterArray) {
			const length = Math.max(before.length, after.length);
			if (length === 0) {
				addChange(path, before, after, beforeExists, afterExists);
				return;
			}
			for (let index = 0; index < length; index += 1) {
				visit(
					before[index],
					after[index],
					[...path, index],
					index < before.length,
					index < after.length,
				);
			}
			return;
		}

		const beforeObject = isContainer(before) && !beforeArray;
		const afterObject = isContainer(after) && !afterArray;
		if (beforeObject && afterObject) {
			const beforeRecord = before as Record<string, unknown>;
			const afterRecord = after as Record<string, unknown>;
			const keys = new Set([
				...Object.keys(beforeRecord),
				...Object.keys(afterRecord),
			]);
			keys.delete("id");
			if (keys.size === 0) {
				addChange(path, before, after, beforeExists, afterExists);
				return;
			}
			for (const key of keys) {
				visit(
					beforeRecord[key],
					afterRecord[key],
					[...path, key],
					Object.hasOwn(beforeRecord, key),
					Object.hasOwn(afterRecord, key),
				);
			}
			return;
		}

		addChange(path, before, after, beforeExists, afterExists);
	};

	for (const key of new Set([...Object.keys(freeze), ...Object.keys(staged)])) {
		visit(
			freeze[key as keyof TTMLLyric],
			staged[key as keyof TTMLLyric],
			[key],
			Object.hasOwn(freeze, key),
			Object.hasOwn(staged, key),
		);
	}
	return changes;
};

const buildChangeBlocks = (
	elementChanges: StructuredReviewChange[],
): StructuredReviewChangeBlock[] => {
	const lineChanges = new Map<number, StructuredReviewChange[]>();
	const documentChanges: StructuredReviewChange[] = [];
	for (const change of elementChanges) {
		const lineIndex =
			change.path[0] === "lyricLines" && typeof change.path[1] === "number"
				? change.path[1]
				: null;
		if (lineIndex === null) {
			documentChanges.push(change);
			continue;
		}
		const changes = lineChanges.get(lineIndex) ?? [];
		changes.push(change);
		lineChanges.set(lineIndex, changes);
	}

	const blocks: StructuredReviewChangeBlock[] = Array.from(lineChanges)
		.sort(([left], [right]) => left - right)
		.map(([, changes]) => ({
			kind: "line" as const,
			changes,
		}));
	if (documentChanges.length > 0) {
		blocks.push({
			kind: "document",
			changes: documentChanges,
		});
	}
	return blocks;
};

export const buildStructuredReviewUpdates = (options: {
	freeze: TTMLLyric;
	staged: TTMLLyric;
	contentHash: string;
	report: ReviewReport;
}): StructuredReviewUpdates => {
	const elementChanges = buildElementChanges(options.freeze, options.staged);
	return {
		version: 1,
		contentHash: options.contentHash,
		changes: {
			version: 1,
			report: pruneReportForExport(options.report),
			blocks: buildChangeBlocks(elementChanges),
		},
	};
};
