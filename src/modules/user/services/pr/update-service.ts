import type { Dispatch, SetStateAction } from "react";
import type { TTMLLyric } from "$/types/ttml";
import { githubFetch } from "$/modules/github/api";
import { pushFileUpdateToGist } from "$/modules/github/services/gist-service";
import {
	fetchPullRequestComments,
	fetchPullRequestDetail,
	fetchPullRequestStatus,
} from "$/modules/github/services/PR-service";
import type { AppNotification } from "$/states/notifications";
import { parseReviewMetadata } from "$/modules/review/services/card-service";
import { loadFileFromPullRequest } from "$/modules/github/services/file-service";
import { loadNeteaseAudio } from "$/modules/ncm/services/audio-service";
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

const requirePullRequestDetail = async (token: string, prNumber: number) => {
	const detail = await fetchPullRequestDetail({ token, prNumber });
	if (!detail) {
		throw new Error("load-pr-detail-failed");
	}
	return detail;
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
	selectNeteaseId?: (ids: string[]) => Promise<string | null> | string | null;
}) => {
	const detail = await requirePullRequestDetail(
		options.token,
		options.prNumber,
	);
	const prTitle = detail.title || options.prTitle;
	const fileResult = await loadFileFromPullRequest({
		token: options.token,
		prNumber: options.prNumber,
	});
	if (!fileResult) {
		options.pushNotification({
			title: "未找到可打开的歌词文件",
			level: "warning",
			source: "github",
		});
		return;
	}
	options.setReviewSession({
		prNumber: options.prNumber,
		prTitle,
		fileName: fileResult.fileName,
		source: "update",
	});
	options.openFile(fileResult.file);
	options.setToolMode(ToolMode.Edit);
	const ncmIds = detail.body
		? parseReviewMetadata(detail.body).ncmId
		: [];
	const cleanedNcmIds = ncmIds.map((id) => id.trim()).filter(Boolean);
	const trimmedCookie = options.neteaseCookie.trim();
	if (!trimmedCookie || cleanedNcmIds.length === 0) return;
	let selectedId = cleanedNcmIds[0];
	if (options.selectNeteaseId) {
		const resolved = await options.selectNeteaseId(cleanedNcmIds);
		if (!resolved) return;
		selectedId = resolved;
	}
	await loadNeteaseAudio({
		prNumber: options.prNumber,
		id: selectedId,
		pendingId: options.pendingId,
		setPendingId: options.setPendingId,
		setLastNeteaseIdByPr: options.setLastNeteaseIdByPr,
		openFile: options.openFile,
		pushNotification: options.pushNotification,
		cookie: trimmedCookie,
	});
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
				{
					token: options.token,
					prNumber: options.prNumber,
					since: options.startedAt,
				},
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
				{ token: options.token, prNumber: options.prNumber },
			);
			const headSha = detail?.headSha ?? null;
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
						source: "github",
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
