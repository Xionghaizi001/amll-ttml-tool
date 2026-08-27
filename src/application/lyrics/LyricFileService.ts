import type { TTMLLyric, TTMLMetadata } from "../../types/ttml";
import {
	getSuggestedTtmlFileName,
	isProjectMatch,
} from "../project/ProjectFileService";
import type { ProjectInfo } from "../project/ProjectHistoryService";

/**
 * 统一文件流程的纯业务决策（阶段 7）：项目 ID 匹配、导入后文件名推导、
 * 音频元数据合并与导出前校验。文件选择、事务提交与 UI 提示由宿主流程负责。
 */

export const getFileExtension = (fileName: string): string =>
	fileName.split(".").pop()?.toLowerCase() || "";

export interface ResolveImportedProjectIdInput {
	lyric: TTMLLyric;
	listProjects: () => Promise<ProjectInfo[]>;
	generateProjectId: () => string;
	onLookupError?: (error: unknown) => void;
	onMatched?: (project: ProjectInfo) => void;
}

/**
 * 依据导入文档的元数据匹配既有自动保存项目；无元数据、无匹配或查询失败时
 * 生成新项目 ID。
 */
export const resolveImportedProjectId = async ({
	lyric,
	listProjects,
	generateProjectId,
	onLookupError,
	onMatched,
}: ResolveImportedProjectIdInput): Promise<string> => {
	if (lyric.metadata.length > 0) {
		try {
			const projects = await listProjects();
			const matched = projects.find((project) =>
				isProjectMatch(project, lyric),
			);
			if (matched) {
				onMatched?.(matched);
				return matched.id;
			}
		} catch (error) {
			onLookupError?.(error);
		}
	}
	return generateProjectId();
};

export interface ResolveImportedFileNameInput {
	metadata: TTMLMetadata[];
	/** 导入来源的原始文件名；来源无文件名（剪贴板、纯文本）时省略。 */
	importedFileName?: string;
	/** 宿主原生格式（TTML）保留原始文件名，不做推导。 */
	keepImportedFileName?: boolean;
}

/**
 * 推导导入后的保存文件名；返回 null 表示保持当前文件名不变。
 */
export const resolveImportedFileName = ({
	metadata,
	importedFileName,
	keepImportedFileName,
}: ResolveImportedFileNameInput): string | null => {
	if (keepImportedFileName && importedFileName) return importedFileName;
	const suggested = getSuggestedTtmlFileName(metadata);
	return suggested?.fileName ?? importedFileName ?? null;
};

/**
 * 将音频文件中提取的元数据合并进现有元数据（原地修改）：
 * 只补充缺失键或全空值的键，不覆盖用户已有内容。
 */
export const mergeExtractedLyricMetadata = (
	currentMetadata: TTMLMetadata[],
	extractedMetadata: TTMLMetadata[],
): boolean => {
	let changed = false;
	for (const extracted of extractedMetadata) {
		const values = extracted.value
			.map((value) => value.trim())
			.filter((value) => value !== "");
		if (values.length === 0) continue;

		const current = currentMetadata.find((item) => item.key === extracted.key);
		if (!current) {
			currentMetadata.push({ key: extracted.key, value: values });
			changed = true;
			continue;
		}

		if (current.value.some((value) => value.trim() !== "")) continue;
		current.value = values;
		changed = true;
	}
	return changed;
};

export type LyricExportIssue = "empty-document" | "empty-output";

/** 导出前校验：没有任何歌词行时阻止导出空文件。 */
export const getLyricExportIssues = (lyric: TTMLLyric): LyricExportIssue[] =>
	lyric.lyricLines.length === 0 ? ["empty-document"] : [];

/** 导出后校验：序列化结果必须是非空文本。 */
export const getExportedContentIssues = (
	content: unknown,
): LyricExportIssue[] =>
	typeof content === "string" && content.length > 0 ? [] : ["empty-output"];
