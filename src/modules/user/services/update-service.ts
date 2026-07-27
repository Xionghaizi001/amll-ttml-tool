import type { Dispatch, SetStateAction } from "react";
import { githubFetch } from "$/modules/github/api";
import { loadFileFromPullRequest } from "$/modules/github/services/file-service";
import {
	fetchPullRequestComments,
	fetchPullRequestDetail,
} from "$/modules/github/services/PR-service";
import { loadNeteaseAudio } from "$/modules/ncm/services/audio-provider";
import { parseTTML } from "$/modules/ttml-processor";
import {
	type AnnotationSession,
	enterAnnotationReview,
} from "$/modules/user/states/annotation-session";
import { fetchStructuredReviewDiff } from "$/services/structured-review-diff-api";
import { type FileUpdateSession, ToolMode } from "$/states/main";
import type { AppNotification } from "$/states/notifications";
import type { RightSidebarPanelType } from "$/states/sidebar";
import type { TTMLLyric } from "$/types/ttml";
import { log } from "$/utils/logging";
import { readStructuredReviewReport } from "./structured-review-report-reader";

export const REPO_OWNER = "amll-dev";
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
		const result = parseTTML(text);
		if (!result.success) return [];
		const idValues = [
			...readMetadataValues(result.data.metadata.platformIds, ["ncmMusicId"]),
			...readMetadataValues(result.data.metadata.rawProperties, [
				"ncmMusicId",
				"ncmmusicid",
			]),
		]
			.map((value) => value.trim())
			.filter(Boolean);
		return Array.from(new Set(idValues));
	} catch {
		return [];
	}
};

const readMetadataValues = (source: unknown, keys: string[]) => {
	const values: string[] = [];
	if (!source) return values;

	if (source instanceof Map) {
		for (const key of keys) {
			values.push(...normalizeMetadataValue(source.get(key)));
		}
		return values;
	}

	if (typeof source !== "object") return values;
	const entries = Object.entries(source as Record<string, unknown>);
	for (const key of keys) {
		const matched = entries.find(
			([entryKey]) => entryKey.toLowerCase() === key.toLowerCase(),
		);
		if (matched) {
			values.push(...normalizeMetadataValue(matched[1]));
		}
	}
	return values;
};

const normalizeMetadataValue = (value: unknown): string[] => {
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === "string");
	}
	return typeof value === "string" ? [value] : [];
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
	setNewLyrics?: (value: TTMLLyric) => void;
	setSaveFileName?: (value: string) => void;
	setSourceFileContent?: (value: string | null) => void;
	setFileUpdateSession: (value: FileUpdateSession | null) => void;
	setToolMode: (mode: ToolMode) => void;
	setAnnotationSession?: (value: AnnotationSession | null) => void;
	setRightSidebarPanel?: (value: RightSidebarPanelType) => void;
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
	const loadRemoteDiff = async () => {
		if (
			!options.setNewLyrics ||
			!options.setAnnotationSession ||
			!options.setRightSidebarPanel
		) {
			return false;
		}
		const remoteReport = await fetchStructuredReviewDiff({
			platform: "github",
			id: options.prNumber,
		});
		const result = await readStructuredReviewReport(remoteReport);
		if (!result.hashMatches) {
			throw new Error("云端结构化报告原稿 hash 不匹配");
		}
		enterAnnotationReview({
			report: result.report,
			originalLyric: result.originalLyric,
			sourceTtml: result.report.original,
			fileName: fileResult.fileName,
			setNewLyrics: options.setNewLyrics,
			setSourceFileContent: options.setSourceFileContent,
			setSaveFileName: options.setSaveFileName,
			setAnnotationSession: options.setAnnotationSession,
			setRightSidebarPanel: options.setRightSidebarPanel,
			setToolMode: options.setToolMode,
		});
		options.pushNotification({
			title: "已载入结构化审阅批注",
			level: "success",
			source: "user-PR-update",
		});
		return true;
	};
	options.setFileUpdateSession({
		prNumber: options.prNumber,
		prTitle: options.prTitle,
		fileName: fileResult.fileName,
	});
	log(`已创建更新会话 PR #${options.prNumber}`);
	let loadedRemoteDiff = false;
	try {
		loadedRemoteDiff = await loadRemoteDiff();
	} catch (error) {
		options.pushNotification({
			title: "读取结构化审阅批注失败，已改为打开 PR 文件",
			description: error instanceof Error ? error.message : undefined,
			level: "warning",
			source: "user-PR-update",
		});
	}
	if (!loadedRemoteDiff) {
		options.setAnnotationSession?.(null);
		options.setRightSidebarPanel?.("none");
		options.openFile(fileResult.file);
	}
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
	(options: {
		onOpenUpdate: (payload: ReviewUpdateAction["payload"]) => void;
	}) =>
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
			const comments = await fetchPullRequestComments({
				token: options.token,
				prNumber: options.prNumber,
				since: options.startedAt,
			});
			const failure = comments.find(
				(comment) => comment.user?.login?.toLowerCase() === "github-actions",
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
		} catch {}
		try {
			const detail = await fetchPullRequestDetail({
				token: options.token,
				prNumber: options.prNumber,
			});
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
		} catch {}
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
