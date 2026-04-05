import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { lyricsSiteTokenAtom, neteaseCookieAtom } from "$/modules/settings/states";
import {
	pushNotificationAtom,
	removeNotificationAtom,
} from "$/states/notifications";
import { ToolMode, reviewSessionAtom, toolModeAtom, type AudioSource } from "$/states/main";
import {
	fetchPendingSubmissions,
	fetchLyricFileContent,
	submitReview,
	type LyricsSiteSubmission,
	type ReviewAction,
} from "./lyrics-site-service";
import { useFileOpener } from "$/hooks/useFileOpener";
import { createAudioSelector } from "$/modules/audio/services/audio-selector";
import type { NotificationLevel } from "$/states/notifications";

export const useLyricsSiteReviewService = () => {
	const token = useAtomValue(lyricsSiteTokenAtom);
	const neteaseCookie = useAtomValue(neteaseCookieAtom);
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const setRemoveNotification = useSetAtom(removeNotificationAtom);
	const { openFile } = useFileOpener();
	const setReviewSession = useSetAtom(reviewSessionAtom);
	const setToolMode = useSetAtom(toolModeAtom);
	const [audioLoadPendingId, setAudioLoadPendingId] = useState<string | null>(null);

	const notify = useCallback(
		(type: NotificationLevel, content: string, id?: string) => {
			setPushNotification({
				id,
				type,
				level: type,
				title: content,
			});
		},
		[setPushNotification],
	);

	const approveSubmission = useCallback(
		async (submissionId: string, comment?: string) => {
			if (!token) {
				setPushNotification({
					id: "lyrics-site-review-error",
					type: "error",
					content: "未登录歌词站",
				});
				return false;
			}

			const notificationId = `lyrics-site-approve-${submissionId}`;
			setPushNotification({
				id: notificationId,
				type: "loading",
				content: "正在通过审核...",
			});

			try {
				await submitReview(token, submissionId, "approve", comment);
				setRemoveNotification(notificationId);
				setPushNotification({
					id: `lyrics-site-approve-success-${submissionId}`,
					type: "success",
					content: "审核通过",
				});
				return true;
			} catch (error) {
				setRemoveNotification(notificationId);
				setPushNotification({
					id: `lyrics-site-approve-error-${submissionId}`,
					type: "error",
					content: `审核失败: ${error instanceof Error ? error.message : "未知错误"}`,
				});
				return false;
			}
		},
		[token, setPushNotification, setRemoveNotification],
	);

	const requestRevision = useCallback(
		async (submissionId: string, comment?: string) => {
			if (!token) {
				setPushNotification({
					id: "lyrics-site-review-error",
					type: "error",
					content: "未登录歌词站",
				});
				return false;
			}

			const notificationId = `lyrics-site-revision-${submissionId}`;
			setPushNotification({
				id: notificationId,
				type: "loading",
				content: "正在请求修改...",
			});

			try {
				await submitReview(token, submissionId, "revision", comment);
				setRemoveNotification(notificationId);
				setPushNotification({
					id: `lyrics-site-revision-success-${submissionId}`,
					type: "success",
					content: "已请求修改",
				});
				return true;
			} catch (error) {
				setRemoveNotification(notificationId);
				setPushNotification({
					id: `lyrics-site-revision-error-${submissionId}`,
					type: "error",
					content: `请求修改失败: ${error instanceof Error ? error.message : "未知错误"}`,
				});
				return false;
			}
		},
		[token, setPushNotification, setRemoveNotification],
	);

	const markMissingAudio = useCallback(
		async (submissionId: string, comment?: string) => {
			if (!token) {
				setPushNotification({
					id: "lyrics-site-review-error",
					type: "error",
					content: "未登录歌词站",
				});
				return false;
			}

			const notificationId = `lyrics-site-missing-audio-${submissionId}`;
			setPushNotification({
				id: notificationId,
				type: "loading",
				content: "正在标记缺少音源...",
			});

			try {
				await submitReview(token, submissionId, "missing_audio", comment);
				setRemoveNotification(notificationId);
				setPushNotification({
					id: `lyrics-site-missing-audio-success-${submissionId}`,
					type: "success",
					content: "已标记缺少音源",
				});
				return true;
			} catch (error) {
				setRemoveNotification(notificationId);
				setPushNotification({
					id: `lyrics-site-missing-audio-error-${submissionId}`,
					type: "error",
					content: `标记失败: ${error instanceof Error ? error.message : "未知错误"}`,
				});
				return false;
			}
		},
		[token, setPushNotification, setRemoveNotification],
	);

	const openSubmissionFile = useCallback(
		async (submission: LyricsSiteSubmission) => {
			if (!token) {
				setPushNotification({
					id: "lyrics-site-open-error",
					type: "error",
					content: "未登录歌词站",
				});
				return;
			}

			const notificationId = `lyrics-site-open-${submission.id}`;
			setPushNotification({
				id: notificationId,
				type: "loading",
				content: "正在打开文件...",
			});

			try {
				const content = await fetchLyricFileContent(token, submission.fileName);
				if (content) {
					const file = new File([content], submission.fileName, {
						type: "application/ttml+xml",
					});
					const prNumber = parseInt(submission.id, 10) || 0;
					const ncmIds = [
						submission.ids?.ncmId,
						...(submission.metadata?.ncmMusicId || []),
					].filter(Boolean);
					
					setReviewSession({
						prNumber,
						prTitle: submission.title,
						fileName: submission.fileName,
						source: "lyrics-site",
						audioFileName: submission.audio?.fileName,
						ncmIds,
					});
					openFile(file);
					setToolMode(ToolMode.Edit);
					setRemoveNotification(notificationId);

					if (audioLoadPendingId) return;

					const selector = createAudioSelector({
						lyricsSiteConfig: submission.audio?.fileName ? {
							audioFileName: submission.audio.fileName,
							audioTitle: submission.audio.title,
						} : undefined,
						neteaseConfig: ncmIds.length > 0 ? {
							ncmIds,
							prNumber,
						} : undefined,
					});

					setAudioLoadPendingId("loading");
					try {
						const result = await selector.loadFirstAvailable({
							pushNotification: (payload) => {
								setPushNotification({
									id: `audio-load-${submission.id}`,
									level: payload.level,
									title: payload.title,
									source: payload.source,
								});
							},
						});

						if (result.success && result.selectedSource) {
							const audioSource: AudioSource = 
								result.selectedSource === "lyrics-site" ? "user-upload" : "netease";
							setReviewSession((prev) => prev ? { ...prev, audioSource } : prev);
						}
					} catch (error) {
						console.error("加载音频失败:", error);
					} finally {
						setAudioLoadPendingId(null);
					}
				} else {
					throw new Error("无法获取文件内容");
				}
			} catch (error) {
				setRemoveNotification(notificationId);
				setPushNotification({
					id: `lyrics-site-open-error-${submission.id}`,
					type: "error",
					content: `打开文件失败: ${error instanceof Error ? error.message : "未知错误"}`,
				});
			}
		},
		[
			token,
			openFile,
			setPushNotification,
			setRemoveNotification,
			setReviewSession,
			setToolMode,
			audioLoadPendingId,
		],
	);

	const refreshSubmissions = useCallback(async () => {
		if (!token) return [];
		return fetchPendingSubmissions(token);
	}, [token]);

	return {
		approveSubmission,
		requestRevision,
		markMissingAudio,
		openSubmissionFile,
		refreshSubmissions,
	};
};
