import {
	stringifyEslrc,
	stringifyLrc,
	stringifyLys,
	stringifyQrc,
	stringifyYrc,
} from "@applemusic-like-lyrics/lyric";
import type { LyricLine, TTMLLyric } from "$/types/ttml";
import exportTTMLText from "$/modules/project/logic/ttml-writer";
import { githubFetch } from "../api";


export type GithubGistResponse = {
	id: string;
	html_url: string;
	files?: Record<string, { raw_url?: string | null; }>;
};

export const createGithubGist = async (
	token: string,
	payload: {
		description: string;
		isPublic: boolean;
		files: Record<string, { content: string; }>;
	}
): Promise<GithubGistResponse> => {
	const headers = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
	};
	const response = await githubFetch("/gists", {
		init: {
			method: "POST",
			headers,
			body: JSON.stringify({
				description: payload.description,
				public: payload.isPublic,
				files: payload.files,
			}),
		},
	});
	if (!response.ok) {
		throw new Error("create-gist-failed");
	}
	return (await response.json()) as GithubGistResponse;
};

const buildLyricForExport = (lines: LyricLine[]) =>
	lines.map((line) => ({
		...line,
		startTime: Math.round(line.startTime),
		endTime: Math.round(line.endTime),
		words: line.words.map((word) => ({
			...word,
			startTime: Math.round(word.startTime),
			endTime: Math.round(word.endTime),
		})),
	}));

const buildLyricExportContent = (lyric: TTMLLyric, fileName: string) => {
	const ext = fileName.split(".").pop()?.toLowerCase() ?? "ttml";
	const lyricForExport = buildLyricForExport(lyric.lyricLines);
	if (ext === "lrc") return stringifyLrc(lyricForExport);
	if (ext === "eslrc") return stringifyEslrc(lyricForExport);
	if (ext === "qrc") return stringifyQrc(lyricForExport);
	if (ext === "yrc") return stringifyYrc(lyricForExport);
	if (ext === "lys") return stringifyLys(lyricForExport);
	return exportTTMLText(lyric);
};

export const pushFileUpdateToGist = async (options: {
	token: string;
	prNumber: number;
	prTitle: string;
	fileName: string;
	lyric: TTMLLyric;
}) => {
	const trimmedFileName = options.fileName.trim() || "lyric.ttml";
	const content = buildLyricExportContent(options.lyric, trimmedFileName);
	const result = await createGithubGist(options.token, {
		description: `AMLL TTML Tool update for PR #${options.prNumber} ${options.prTitle}`,
		isPublic: false,
		files: {
			[trimmedFileName]: {
				content,
			},
		},
	});
	const rawUrl =
		result.files?.[trimmedFileName]?.raw_url ??
		Object.values(result.files ?? {})[0]?.raw_url;
	if (!rawUrl) {
		throw new Error("gist-raw-url-missing");
	}
	return {
		gistId: result.id,
		rawUrl,
		fileName: trimmedFileName,
	};
};
