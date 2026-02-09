import type { LyricLine, TTMLLyric } from "$/types/ttml";
import { buildGithubProxyUrl } from "$/modules/github/api";
import { pushFileUpdateToGist } from "$/modules/github/services/gist-service";
import { fetchPullRequestStatus } from "$/modules/github/services/PR-service";
import type { AppNotification } from "$/states/notifications";
import type { FileUpdateSession } from "$/states/main";
import exportTTMLText from "$/modules/project/logic/ttml-writer";
import {
	stringifyEslrc,
	stringifyLrc,
	stringifyLys,
	stringifyQrc,
	stringifyYrc,
} from "@applemusic-like-lyrics/lyric";
import {
	pollFileUpdateStatus,
	pushFileUpdateComment,
	REPO_NAME,
	REPO_OWNER,
} from "../services/update-service";

type ConfirmDialogState = {
	open: boolean;
	title: string;
	description: string;
	onConfirm?: () => void;
};

type PushNotification = (
	input: Omit<AppNotification, "id" | "createdAt"> & {
		id?: string;
		createdAt?: string;
	},
) => void;

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

export const requestFileUpdatePush = (options: {
	token: string;
	session: FileUpdateSession;
	lyric: TTMLLyric;
	setConfirmDialog: (value: ConfirmDialogState) => void;
	confirmTitle?: string;
	confirmDescription?: string;
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
			source: "user-PR-update",
		});
		return;
	}
	options.setConfirmDialog({
		open: true,
		title: options.confirmTitle ?? "确认修改完成",
		description:
			options.confirmDescription ??
			`确认后将上传歌词并回复 PR #${options.session.prNumber}。`,
		onConfirm: () => {
			void (async () => {
				let baseHeadSha: string | null = null;
				let prUrl = buildGithubProxyUrl(
					`https://github.com/${REPO_OWNER}/${REPO_NAME}/pull/${options.session.prNumber}`,
				);
				try {
					const status = await fetchPullRequestStatus({
						token,
						prNumber: options.session.prNumber,
					});
					baseHeadSha = status.headSha;
					prUrl = buildGithubProxyUrl(status.prUrl);
				} catch {
				}
				try {
					const result = await pushFileUpdateToGist({
						token,
						prNumber: options.session.prNumber,
						prTitle: options.session.prTitle,
						fileName: options.session.fileName,
						content: buildLyricExportContent(
							options.lyric,
							options.session.fileName,
						),
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
						source: "user-PR-update",
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
