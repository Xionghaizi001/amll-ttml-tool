import {
	stringifyEslrc,
	stringifyLrc,
	stringifyLys,
	stringifyQrc,
	stringifyYrc,
} from "@applemusic-like-lyrics/lyric";
import type { Dispatch, SetStateAction } from "react";
import type { LyricLine, TTMLLyric } from "$/types/ttml";
import { createGithubGist, githubFetch } from "$/modules/github/api";
import type { AppNotification } from "$/states/notifications";
import exportTTMLText from "$/modules/project/logic/ttml-writer";
import { parseReviewMetadata } from "$/modules/review/services/review-card-service";
import { loadReviewFileFromPullRequest } from "$/modules/github/services/review-file-service";
import { loadNeteaseAudioForReview } from "$/modules/audio/netease-audio-service";
import { ToolMode, type ReviewSessionSource } from "$/states/main";

const REPO_OWNER = "Steve-xmh";
const REPO_NAME = "amll-ttml-db";

type OpenFile = (file: File, forceExt?: string) => void;
type PushNotification = (
	input: Omit<AppNotification, "id" | "createdAt"> & {
		id?: string;
		createdAt?: string;
	},
) => void;
type ConfirmDialogState = {
	open: boolean;
	title: string;
	description: string;
	onConfirm?: () => void;
};
type FileUpdateSession = {
	prNumber: number;
	prTitle: string;
	fileName: string;
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

const fetchPullRequestDetail = async (token: string, prNumber: number) => {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
	};
	const response = await githubFetch(
		`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`,
		{ init: { headers } },
	);
	if (!response.ok) {
		throw new Error("load-pr-detail-failed");
	}
	return (await response.json()) as {
		title: string;
		body?: string | null;
		html_url?: string;
		head?: { sha?: string };
	};
};

const createPullRequestComment = async (
	token: string,
	prNumber: number,
	body: string,
) => {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
	};
	const response = await githubFetch(
		`/repos/${REPO_OWNER}/${REPO_NAME}/issues/${prNumber}/comments`,
		{
			init: {
				method: "POST",
				headers,
				body: JSON.stringify({ body }),
			},
		},
	);
	if (!response.ok) {
		throw new Error("create-pr-comment-failed");
	}
	return (await response.json()) as { id?: number };
};

const fetchPullRequestComments = async (
	token: string,
	prNumber: number,
	since?: string,
) => {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
	};
	const response = await githubFetch(
		`/repos/${REPO_OWNER}/${REPO_NAME}/issues/${prNumber}/comments`,
		{
			params: { per_page: 100, since },
			init: { headers },
		},
	);
	if (!response.ok) {
		throw new Error("load-pr-comments-failed");
	}
	return (await response.json()) as Array<{
		body?: string | null;
		user?: { login?: string | null };
	}>;
};

export const fetchPullRequestStatus = async (options: {
	token: string;
	prNumber: number;
}) => {
	const detail = await fetchPullRequestDetail(options.token, options.prNumber);
	return {
		headSha: detail.head?.sha ?? null,
		prUrl:
			detail.html_url ??
			`https://github.com/${REPO_OWNER}/${REPO_NAME}/pull/${options.prNumber}`,
	};
};

export const openReviewUpdateFromNotification = async (options: {
	token: string;
	prNumber: number;
	prTitle: string;
	openFile: OpenFile;
	setToolMode: (mode: ToolMode) => void;
	setReviewSession: (value: {
		prNumber: number;
		prTitle: string;
		fileName: string;
		source: ReviewSessionSource;
	}) => void;
	pushNotification: PushNotification;
	neteaseCookie: string;
	pendingId: string | null;
	setPendingId: (value: string | null) => void;
	setLastNeteaseIdByPr: Dispatch<SetStateAction<Record<number, string>>>;
}) => {
	const detail = await fetchPullRequestDetail(options.token, options.prNumber);
	const prTitle = detail?.title || options.prTitle;
	const fileResult = await loadReviewFileFromPullRequest({
		token: options.token,
		prNumber: options.prNumber,
		prTitle,
		source: "update",
		openFile: options.openFile,
		setToolMode: options.setToolMode,
		setReviewSession: options.setReviewSession,
		pushNotification: options.pushNotification,
	});
	if (!fileResult) return;
	const ncmId = detail?.body ? parseReviewMetadata(detail.body).ncmId[0] : null;
	if (!options.neteaseCookie.trim() || !ncmId) return;
	await loadNeteaseAudioForReview({
		prNumber: options.prNumber,
		id: ncmId,
		pendingId: options.pendingId,
		setPendingId: options.setPendingId,
		setLastNeteaseIdByPr: options.setLastNeteaseIdByPr,
		openFile: options.openFile,
		pushNotification: options.pushNotification,
		cookie: options.neteaseCookie,
	});
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

export const pushFileUpdateComment = async (options: {
	token: string;
	prNumber: number;
	rawUrl: string;
}) => {
	await createPullRequestComment(
		options.token,
		options.prNumber,
		`/update ${options.rawUrl}`,
	);
};

export const pollFileUpdateStatus = (options: {
	token: string;
	prNumber: number;
	baseHeadSha: string | null;
	prUrl: string;
	startedAt: string;
	onSuccess: () => void;
	onFailure: (message: string, prUrl: string) => void;
}) => {
	let stopped = false;
	let timer: number | null = null;
	let lastHeadSha = options.baseHeadSha;
	const run = async () => {
		if (stopped) return;
		try {
			const comments = await fetchPullRequestComments(
				options.token,
				options.prNumber,
				options.startedAt,
			);
			const failure = comments.find(
				(comment) =>
					comment.user?.login?.toLowerCase() === "github-actions",
			);
			if (failure?.body) {
				const firstLine = failure.body.split(/\r?\n/)[0]?.trim();
				if (firstLine) {
					const message = firstLine.replace(/^[^，,]+[，,]\s*/, "");
					stopped = true;
					options.onFailure(message || firstLine, options.prUrl);
					return;
				}
			}
		} catch {
		}
		try {
			const detail = await fetchPullRequestDetail(
				options.token,
				options.prNumber,
			);
			const headSha = detail.head?.sha ?? null;
			if (headSha) {
				if (!lastHeadSha) {
					lastHeadSha = headSha;
				} else if (headSha !== lastHeadSha) {
					stopped = true;
					options.onSuccess();
					return;
				}
			}
		} catch {
		}
		timer = window.setTimeout(run, 20000);
	};
	timer = window.setTimeout(run, 20000);
	return () => {
		stopped = true;
		if (timer !== null) {
			window.clearTimeout(timer);
		}
	};
};

export const requestFileUpdatePush = (options: {
	token: string;
	session: FileUpdateSession;
	lyric: TTMLLyric;
	setConfirmDialog: (value: ConfirmDialogState) => void;
	pushNotification: PushNotification;
	onAfterPush: () => void;
	onSuccess: () => void;
	onFailure: (message: string, prUrl: string) => void;
	onError: () => void;
}) => {
	const token = options.token.trim();
	if (!token) {
		options.pushNotification({
			title: "请先在设置中登录以提交更新",
			level: "error",
			source: "review",
		});
		return;
	}
	options.setConfirmDialog({
		open: true,
		title: "确认修改完成",
		description: `确认后将上传歌词并回复 PR #${options.session.prNumber}。`,
		onConfirm: () => {
			void (async () => {
				let baseHeadSha: string | null = null;
				let prUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/pull/${options.session.prNumber}`;
				try {
					const status = await fetchPullRequestStatus({
						token,
						prNumber: options.session.prNumber,
					});
					baseHeadSha = status.headSha;
					prUrl = status.prUrl;
				} catch {
				}
				try {
					const result = await pushFileUpdateToGist({
						token,
						prNumber: options.session.prNumber,
						prTitle: options.session.prTitle,
						fileName: options.session.fileName,
						lyric: options.lyric,
					});
					await pushFileUpdateComment({
						token,
						prNumber: options.session.prNumber,
						rawUrl: result.rawUrl,
					});
					options.onAfterPush();
					options.pushNotification({
						title: "已推送更新",
						level: "info",
						source: "review",
					});
					const startedAt = new Date().toISOString();
					pollFileUpdateStatus({
						token,
						prNumber: options.session.prNumber,
						baseHeadSha,
						prUrl,
						startedAt,
						onSuccess: options.onSuccess,
						onFailure: options.onFailure,
					});
				} catch {
					options.onError();
				}
			})();
		},
	});
};
