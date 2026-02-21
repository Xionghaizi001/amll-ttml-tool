import { githubFetch } from "$/modules/github/api";
import {
	fetchPullRequestComments,
	fetchPullRequestDetail,
} from "$/modules/github/services/PR-service";
import type { AppNotification } from "$/states/notifications";
import { loadFileFromPullRequest } from "$/modules/github/services/file-service";
import { ToolMode, type FileUpdateSession } from "$/states/main";
import { parseLyric } from "$/modules/project/logic/ttml-parser";
import { loadNeteaseAudio } from "$/modules/ncm/services/audio-service";
import type { Dispatch, SetStateAction } from "react";
import { log } from "$/utils/logging";

export const REPO_OWNER = "Steve-xmh";
export const REPO_NAME = "amll-ttml-db";

type OpenFile = (file: File, forceExt?: string) => void;
type PushNotification = (
	input: Omit<AppNotification, "id" | "createdAt"> & {
		id?: string;
		createdAt?: string;
	},
) => void;
type ReviewUpdateAction = Extract<
	NonNullable<AppNotification["action"]>,
	{ type: "open-review-update" }
>;

const requirePullRequestDetail = async (token: string, prNumber: number) => {
	const detail = await fetchPullRequestDetail({ token, prNumber });
	if (!detail) {
		throw new Error("load-pr-detail-failed");
	}
	return detail;
};

const readNeteaseIdsFromFile = async (file: File) => {
	try {
		const text = await file.text();
		const lyric = parseLyric(text);
		const idValues = lyric.metadata
			.filter((entry) => entry.key.toLowerCase() === "ncmmusicid")
			.flatMap((entry) => entry.value)
			.map((value) => value.trim())
			.filter(Boolean);
		return Array.from(new Set(idValues));
	} catch {
		return [];
	}
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
	setFileUpdateSession: (value: FileUpdateSession | null) => void;
	setToolMode: (mode: ToolMode) => void;
	pushNotification: PushNotification;
	neteaseCookie: string;
	pendingId: string | null;
	setPendingId: (value: string | null) => void;
	setLastNeteaseIdByPr: Dispatch<SetStateAction<Record<number, string>>>;
	selectNeteaseId?: (ids: string[]) => Promise<string | null> | string | null;
}) => {
	await requirePullRequestDetail(options.token, options.prNumber);
	const fileResult = await loadFileFromPullRequest({
		token: options.token,
		prNumber: options.prNumber,
	});
	if (!fileResult) {
		options.pushNotification({
			title: "未找到可打开的歌词文件",
			level: "warning",
			source: "user-PR-update",
		});
		return;
	}
	options.setFileUpdateSession({
		prNumber: options.prNumber,
		prTitle: options.prTitle,
		fileName: fileResult.fileName,
	});
	log(`已创建更新会话 PR #${options.prNumber}`);
	options.openFile(fileResult.file);
	options.setToolMode(ToolMode.Edit);
	const cleanedIds = await readNeteaseIdsFromFile(fileResult.file);
	const trimmedCookie = options.neteaseCookie.trim();
	if (cleanedIds.length === 0) return;
	let selectedId = cleanedIds[0];
	if (options.selectNeteaseId) {
		const resolved = await options.selectNeteaseId(cleanedIds);
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

export const getReviewUpdateAction = (item: AppNotification) =>
	item.action?.type === "open-review-update" ? item.action : null;

export const createReviewUpdateActionHandler =
	(options: { onOpenUpdate: (payload: ReviewUpdateAction["payload"]) => void }) =>
	(action: ReviewUpdateAction | null) => {
		if (!action) return;
		options.onOpenUpdate(action.payload);
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
