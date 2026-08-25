import type { TTMLLyric, TTMLMetadata } from "../../types/ttml";
import type { ProjectInfo } from "./ProjectHistoryService";

export interface DefaultTtmlAuthorMetadata {
	githubId: string;
	githubLogin: string;
}

export interface SuggestedTtmlFileName {
	baseName: string;
	fileName: string;
}

const setDefaultValueIfEmpty = (
	metadata: TTMLMetadata[],
	key: string,
	value: string,
) => {
	const trimmed = value.trim();
	if (!trimmed) return false;
	const current = metadata.find((item) => item.key === key);
	if (!current) {
		metadata.push({ key, value: [trimmed] });
		return true;
	}
	if (current.value.some((item) => item.trim() !== "")) return false;
	current.value = [trimmed];
	return true;
};

export const applyDefaultTtmlAuthorMetadata = (
	metadata: TTMLMetadata[],
	defaults: DefaultTtmlAuthorMetadata,
) => {
	const githubIdChanged = setDefaultValueIfEmpty(
		metadata,
		"ttmlAuthorGithub",
		defaults.githubId,
	);
	const githubLoginChanged = setDefaultValueIfEmpty(
		metadata,
		"ttmlAuthorGithubLogin",
		defaults.githubLogin,
	);
	return githubIdChanged || githubLoginChanged;
};

const getFirstNonEmptyValue = (values?: string[]): string | null => {
	if (!values) return null;
	for (const value of values) {
		const trimmed = value.trim();
		if (trimmed) return trimmed;
	}
	return null;
};

export const getSuggestedTtmlFileName = (
	metadata: TTMLMetadata[],
): SuggestedTtmlFileName | null => {
	const musicName = getFirstNonEmptyValue(
		metadata.find((entry) => entry.key === "musicName")?.value,
	);
	const artists = getFirstNonEmptyValue(
		metadata.find((entry) => entry.key === "artists")?.value,
	);
	if (!musicName || !artists) return null;
	const baseName = `${artists} - ${musicName}`;
	return { baseName, fileName: `${baseName}.ttml` };
};

/**
 * 判断数据库中的项目是否匹配当前的歌词文件
 * @param dbProject - 数据库中存储的历史项目信息
 * @param fileLyric - 当前打开或编辑的歌词数据
 * @returns 如果匹配则返回 true，否则返回 false
 */
export function isProjectMatch(
	dbProject: ProjectInfo,
	fileLyric: TTMLLyric,
): boolean {
	const dbMeta = dbProject.latestState.metadata;
	if (!dbMeta.length) return false;
	for (const dbItem of dbMeta) {
		const key = dbItem.key.trim().toLowerCase();
		const values = dbItem.value.map((value) => value.trim()).filter(Boolean);
		if (!values.length) continue;
		const fileItem = fileLyric.metadata.find(
			(item) => item.key.trim().toLowerCase() === key,
		);
		if (!fileItem) return false;
		const fileValues = fileItem.value
			.map((value) => value.trim())
			.filter(Boolean);
		if (!values.every((value) => fileValues.includes(value))) return false;
	}
	return true;
}
