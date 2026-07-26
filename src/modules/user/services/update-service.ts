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
	createAnnotationSession,
} from "$/modules/user/states/annotation-session";
import { type FileUpdateSession, ToolMode } from "$/states/main";
import type { AppNotification } from "$/states/notifications";
import type { RightSidebarPanelType } from "$/states/sidebar";
import type { TTMLLyric } from "$/types/ttml";
import { log } from "$/utils/logging";
import {
	readStructuredReviewReport,
	unwrapStructuredReviewReport,
} from "./structured-review-report-reader";

export const REPO_OWNER = "Steve-xmh";
export const REPO_NAME = "amll-ttml-db";
export const AMLLDB_DIFF_BASE_URL = "https://amlldb.bikonoo.com/diff/";

export type StructuredReviewDiffPlatform = "gcz" | "github";

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

export const buildStructuredReviewDiffUrl = (options: {
	platform: StructuredReviewDiffPlatform | string;
	id: string | number;
}): string => {
	const platform = String(options.platform).trim();
	const id = String(options.id).trim();
	if (!platform) throw new Error("缺少 platform");
	if (!id) throw new Error("缺少稿件 id");
	const url = new URL(AMLLDB_DIFF_BASE_URL);
	url.searchParams.set("platform", platform);
	url.searchParams.set("id", id);
	return url.toString();
};

const readDiffErrorDetail = async (response: Response): Promise<string> => {
	const raw = (await response.text().catch(() => "")).trim();
	if (!raw) return "";
	try {
		const json = JSON.parse(raw) as {
			message?: unknown;
			error?: unknown;
		};
		if (typeof json.message === "string" && json.message.trim()) {
			return json.message.trim();
		}
		if (typeof json.error === "string" && json.error.trim()) {
			return json.error.trim();
		}
	} catch {
		// plain text
	}
	return raw;
};

export const mapStructuredReviewDiffHttpError = (
	status: number,
	detail: string,
	action: "读取" | "上传",
) => {
	const mapped =
		status === 400
			? "参数无效（请检查 platform / id）"
			: status === 401
				? "未登录或 Token 无效/过期"
				: status === 403
					? "无审核员权限"
					: status === 404
						? "未找到对应结构化报告"
						: status === 500
							? "服务器内部错误"
							: `HTTP ${status}`;
	return detail
		? `${action}结构化报告失败：${mapped}（${detail}）`
		: `${action}结构化报告失败：${mapped}`;
};

/**
 * 读取云端结构化审阅报告（GET，无需鉴权）。
 * 成功时直接返回报告 JSON 对象。
 */
export const fetchStructuredReviewDiff = async (options: {
	platform: StructuredReviewDiffPlatform | string;
	id: string | number;
}): Promise<unknown> => {
	const response = await fetch(buildStructuredReviewDiffUrl(options), {
		method: "GET",
		headers: {
			Accept: "application/json",
		},
	});
	if (!response.ok) {
		const detail = await readDiffErrorDetail(response);
		throw new Error(
			mapStructuredReviewDiffHttpError(response.status, detail, "读取"),
		);
	}
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		return unwrapStructuredReviewReport(await response.json());
	}
	const textBody = await response.text();
	let payload: unknown;
	try {
		payload = JSON.parse(textBody);
	} catch {
		throw new Error("云端返回的结构化报告不是有效 JSON");
	}
	return unwrapStructuredReviewReport(payload);
};

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
		options.setNewLyrics(result.originalLyric);
		options.setSourceFileContent?.(result.report.original);
		options.setSaveFileName?.(fileResult.fileName);
		options.setAnnotationSession(
			createAnnotationSession({
				report: result.report,
				originalLyric: result.originalLyric,
			}),
		);
		options.setRightSidebarPanel("annotations");
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
