import type { ReviewReport } from "$/modules/review/services/report-service/types";
import type { ReviewElementPath } from "$/modules/review/services/structured-snapshot";

export type StructuredReviewValue =
	| string
	| number
	| boolean
	| null
	| StructuredReviewValue[]
	| { [key: string]: StructuredReviewValue };

/**
 * 单条可独立接受的变更（云端 updates 协议最小单元）。
 * 定位只依赖 path（冻结原稿坐标系）；不携带会话随机 ID 或展示用相对字段。
 */
export type StructuredReviewChange = {
	path: ReviewElementPath;
	beforeExists: boolean;
	afterExists: boolean;
	before: StructuredReviewValue | null;
	after: StructuredReviewValue | null;
};

/**
 * 变更分组：仅用于打包展示；回放以 path 为准。
 * 行归属由 path 前缀 lyricLines/<index> 推导，不再冗余 lineIndex/lineNumber/isBG/lineId。
 */
export type StructuredReviewChangeBlock =
	| {
			kind: "line";
			changes: StructuredReviewChange[];
	  }
	| {
			kind: "document";
			changes: StructuredReviewChange[];
	  };

export type StructuredReviewChanges = {
	version: 1;
	/** 审阅文案报告（已剔除未启用 block）；与内容 diff 并列放在 updates 内。 */
	report: ReviewReport;
	blocks: StructuredReviewChangeBlock[];
};

/**
 * 云端约定：可回放变动只写在 updates 内。
 * contentHash 即文档身份（与派生 documentId 相同），不再单独存 documentId。
 */
export type StructuredReviewUpdates = {
	version: 1;
	contentHash: string;
	changes: StructuredReviewChanges;
};

export type StructuredReviewReportMetadata = {
	title: string;
	artist: string;
	submitter: string;
};

export type StructuredReviewReport = {
	original: string;
	modified: string;
	metadata: StructuredReviewReportMetadata;
	updates: StructuredReviewUpdates;
};
