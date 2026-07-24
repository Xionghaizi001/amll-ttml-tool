import type {
	StructuredReviewChange,
	StructuredReviewChangeBlock,
	StructuredReviewReport,
} from "$/types/structured-review-report";
import { pathKey } from "$/utils/content-addressed-id";

export type AnnotationDecision = "pending" | "accepted" | "rejected";

export type AnnotationItem = {
	key: string;
	path: Array<string | number>;
	/** 冻结原稿坐标系下行索引；文档级变更无行归属。 */
	lineIndex: number | null;
	change: StructuredReviewChange;
	summary: string;
	kind: "add" | "remove" | "update";
};

const previewValue = (value: unknown, max = 24): string => {
	if (value === null || value === undefined) return "（空）";
	if (typeof value === "string") {
		const trimmed = value.replace(/\s+/g, " ").trim();
		if (!trimmed) return "（空）";
		return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value)) return `[${value.length} 项]`;
	if (typeof value === "object") {
		const record = value as Record<string, unknown>;
		if (typeof record.word === "string") return previewValue(record.word, max);
		if (typeof record.text === "string") return previewValue(record.text, max);
		return "{…}";
	}
	return String(value);
};

const leafName = (path: Array<string | number>): string => {
	const last = path[path.length - 1];
	if (typeof last === "string") return last;
	if (path.includes("words")) return "词";
	if (path[0] === "lyricLines") return "行";
	return "内容";
};

export const getChangeKind = (
	change: StructuredReviewChange,
): AnnotationItem["kind"] => {
	if (!change.beforeExists && change.afterExists) return "add";
	if (change.beforeExists && !change.afterExists) return "remove";
	return "update";
};

export const summarizeStructuredChange = (
	change: StructuredReviewChange,
): string => {
	const kind = getChangeKind(change);
	const field = leafName(change.path);
	if (kind === "add") {
		return `添加了 \`${previewValue(change.after)}\``;
	}
	if (kind === "remove") {
		return `删除了 \`${previewValue(change.before)}\``;
	}
	if (field === "word" || field === "translatedLyric" || field === "romanLyric") {
		return `将 \`${previewValue(change.before)}\` 改为 \`${previewValue(change.after)}\``;
	}
	if (field === "startTime" || field === "endTime") {
		return `调整 ${field}：\`${previewValue(change.before)}\` → \`${previewValue(change.after)}\``;
	}
	return `修改 ${field}：\`${previewValue(change.before)}\` → \`${previewValue(change.after)}\``;
};

export const getLineIndexFromPath = (
	path: Array<string | number>,
): number | null =>
	path[0] === "lyricLines" && typeof path[1] === "number" ? path[1] : null;

export const flattenAnnotationItems = (
	blocks: StructuredReviewChangeBlock[],
): AnnotationItem[] => {
	const items: AnnotationItem[] = [];
	for (const block of blocks) {
		for (const change of block.changes) {
			items.push({
				key: pathKey(change.path),
				path: change.path,
				lineIndex: getLineIndexFromPath(change.path),
				change,
				summary: summarizeStructuredChange(change),
				kind: getChangeKind(change),
			});
		}
	}
	return items;
};

export const buildAnnotationItemsFromReport = (
	report: StructuredReviewReport,
): AnnotationItem[] => flattenAnnotationItems(report.updates.changes.blocks);
