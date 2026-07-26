import { parseTTMLLyric } from "$/modules/ttml-processor";
import { unwrapStructuredReviewReport } from "$/services/structured-review-diff-api";
import type { StructuredReviewReport } from "$/types/structured-review-report";
import type { TTMLLyric } from "$/types/ttml";
import { isStructuredValue } from "$/utils/structured-review-value";
import { verifyTtmlContentHash } from "$/utils/ttml-content-hash";

export type StructuredReviewReportReadResult = {
	report: StructuredReviewReport;
	originalLyric: TTMLLyric;
	modifiedLyric: TTMLLyric;
	hashMatches: boolean;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isStructuredChange = (value: unknown) =>
	isObject(value) &&
	Array.isArray(value.path) &&
	value.path.every(
		(segment) => typeof segment === "string" || typeof segment === "number",
	) &&
	typeof value.beforeExists === "boolean" &&
	typeof value.afterExists === "boolean" &&
	isStructuredValue(value.before) &&
	isStructuredValue(value.after);

const isStructuredChangeBlock = (value: unknown) =>
	isObject(value) &&
	(value.kind === "line" || value.kind === "document") &&
	Array.isArray(value.changes) &&
	value.changes.every(isStructuredChange);

function assertReportShape(
	value: unknown,
): asserts value is StructuredReviewReport {
	if (!isObject(value)) throw new Error("结构化报告必须是 JSON 对象");
	if (
		typeof value.original !== "string" ||
		typeof value.modified !== "string"
	) {
		throw new Error("结构化报告缺少 original 或 modified 字段");
	}
	if (!isObject(value.metadata) || !isObject(value.updates)) {
		throw new Error("结构化报告缺少 metadata 或 updates 字段");
	}
	if (
		typeof value.metadata.title !== "string" ||
		typeof value.metadata.artist !== "string" ||
		typeof value.metadata.submitter !== "string"
	) {
		throw new Error("结构化报告 metadata 字段格式无效");
	}
	if (
		value.updates.version !== 1 ||
		typeof value.updates.contentHash !== "string" ||
		!isObject(value.updates.changes) ||
		value.updates.changes.version !== 1 ||
		!isObject(value.updates.changes.report) ||
		value.updates.changes.report.version !== 1 ||
		!Array.isArray(value.updates.changes.report.blocks) ||
		!Array.isArray(value.updates.changes.blocks) ||
		!value.updates.changes.blocks.every(isStructuredChangeBlock)
	) {
		throw new Error("结构化报告 updates 字段格式无效");
	}
}

const parseLyric = (content: string, label: string): TTMLLyric => {
	const result = parseTTMLLyric(content);
	if (!result.success) {
		throw new Error(`${label} TTML 无法解析：${result.error.message}`);
	}
	return result.data;
};

export const readStructuredReviewReport = async (
	input: string | unknown,
): Promise<StructuredReviewReportReadResult> => {
	// 既可能拿到裸报告（本地历史/导入文件），也可能拿到云端信封，统一先剥一层。
	const value = unwrapStructuredReviewReport(input);
	assertReportShape(value);
	const originalLyric = parseLyric(value.original, "original");
	const modifiedLyric = parseLyric(value.modified, "modified");
	const hashMatches = await verifyTtmlContentHash(
		originalLyric,
		value.updates.contentHash,
	);
	return { report: value, originalLyric, modifiedLyric, hashMatches };
};
