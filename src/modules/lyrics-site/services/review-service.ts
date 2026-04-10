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
} from "../index";
import { useFileOpener } from "$/hooks/useFileOpener";
import { loadLyricsSiteAudio } from "$/modules/lyrics-site/services/audio-provider";
import { loadNeteaseAudio } from "$/modules/ncm/services/audio-provider";

export const useLyricsSiteReviewService = () => {
	const token = useAtomValue(lyricsSiteTokenAtom);
	const _neteaseCookie = useAtomValue(neteaseCookieAtom);
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const setRemoveNotification = useSetAtom(removeNotificationAtom);
	const { openFile } = useFileOpener();
	const setReviewSession = useSetAtom(reviewSessionAtom);
	const setToolMode = useSetAtom(toolModeAtom);
	const [audioLoadPendingId, setAudioLoadPendingId] = useState<string | null>(null);

	const approveSubmission = useCallback(
		async (submissionId: string, comment?: string) => {
			if (!token) {
				setPushNotification({
					id: "lyrics-site-review-error",
					level: "error",
					title: "未登录歌词站",
				});
				return false;
			}

			const notificationId = `lyrics-site-approve-${submissionId}`;
			setPushNotification({
				id: notificationId,
				level: "info",
				title: "正在通过审核...",
			});

			try {
				await submitReview(token, submissionId, "approve", comment);
				setRemoveNotification(notificationId);
				setPushNotification({
					id: `lyrics-site-approve-success-${submissionId}`,
					level: "success",
					title: "审核通过",
				});
				return true;
			} catch (error) {
				setRemoveNotification(notificationId);
				setPushNotification({
					id: `lyrics-site-approve-error-${submissionId}`,
					level: "error",
					title: `审核失败: ${error instanceof Error ? error.message : "未知错误"}`,
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
					level: "error",
					title: "未登录歌词站",
				});
				return false;
			}

			const notificationId = `lyrics-site-revision-${submissionId}`;
			setPushNotification({
				id: notificationId,
				level: "info",
				title: "正在请求修改...",
			});

			try {
				await submitReview(token, submissionId, "revision", comment);
				setRemoveNotification(notificationId);
				setPushNotification({
					id: `lyrics-site-revision-success-${submissionId}`,
					level: "success",
					title: "已请求修改",
				});
				return true;
			} catch (error) {
				setRemoveNotification(notificationId);
				setPushNotification({
					id: `lyrics-site-revision-error-${submissionId}`,
					level: "error",
					title: `请求修改失败: ${error instanceof Error ? error.message : "未知错误"}`,
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
					level: "error",
					title: "未登录歌词站",
				});
				return false;
			}

			const notificationId = `lyrics-site-missing-audio-${submissionId}`;
			setPushNotification({
				id: notificationId,
				level: "info",
				title: "正在标记缺少音源...",
			});

			try {
				await submitReview(token, submissionId, "missing_audio", comment);
				setRemoveNotification(notificationId);
				setPushNotification({
					id: `lyrics-site-missing-audio-success-${submissionId}`,
					level: "success",
					title: "已标记缺少音源",
				});
				return true;
			} catch (error) {
				setRemoveNotification(notificationId);
				setPushNotification({
					id: `lyrics-site-missing-audio-error-${submissionId}`,
					level: "error",
					title: `标记失败: ${error instanceof Error ? error.message : "未知错误"}`,
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
					level: "error",
					title: "未登录歌词站",
				});
				return;
			}

			const notificationId = `lyrics-site-open-${submission.id}`;
			setPushNotification({
				id: notificationId,
				level: "info",
				title: "正在打开文件...",
			});

			try {
				const content = await fetchLyricFileContent(token, submission.fileName);
				if (content) {
					const file = new File([content], submission.fileName, {
						type: "application/ttml+xml",
					});
					const prNumber = parseInt(submission.id, 10) || 0;
					const rawNcmMusicId = submission.metadata?.ncmMusicId;
					const ncmMusicIdArray = Array.isArray(rawNcmMusicId)
						? rawNcmMusicId
						: rawNcmMusicId
							? [rawNcmMusicId]
							: [];
					
					const ncmIds = Array.from(
						new Set(
							[
								submission.ids?.ncmId,
								...ncmMusicIdArray,
							].filter(Boolean) as string[]
						)
					);
					
					setReviewSession({
						prNumber,
						prTitle: submission.title,
						fileName: submission.fileName,
						source: "lyrics-site",
						audioFileName: submission.audio?.fileName,
						audioTitle: submission.audio?.title,
						ncmIds,
					});
					openFile(file);
					setToolMode(ToolMode.Edit);
					setRemoveNotification(notificationId);

					if (audioLoadPendingId) return;
					setAudioLoadPendingId("loading");

					try {
						let success = false;
						let selectedSource: string | null = null;

						if (submission.audio?.fileName) {
							const result = await loadLyricsSiteAudio({
								audioFileName: submission.audio.fileName,
								audioTitle: submission.audio.title,
								openFile,
								pushNotification: (payload) => {
									setPushNotification({
										id: `audio-load-${submission.id}`,
										level: payload.level,
										title: payload.title,
										source: payload.source,
									});
								},
							});
							if (result.success) {
								success = true;
								selectedSource = "lyrics-site";
							}
						}

						if (!success && ncmIds.length > 0) {
							try {
								await loadNeteaseAudio({
									prNumber,
									id: ncmIds[0],
									pendingId: null,
									setPendingId: () => {},
									setLastNeteaseIdByPr: () => {},
									openFile: openFile,
									pushNotification: (payload) => {
										setPushNotification({
											id: `audio-load-${submission.id}`,
											level: payload.level,
											title: payload.title,
											source: payload.source,
										});
									},
									cookie: _neteaseCookie || "",
								});
								success = true;
								selectedSource = "netease";
							} catch (e) {
								console.error("网易云加载失败:", e);
							}
						}

						if (success && selectedSource) {
							const audioSource: AudioSource =
								selectedSource === "lyrics-site" ? "user-upload" : "netease";
							setReviewSession((prev) => prev ? { ...prev, audioSource } : prev);
						} else {
							setPushNotification({
								id: `audio-load-${submission.id}-fail`,
								level: "warning",
								title: "没有可用的音源",
								source: "review",
							});
						}
					} catch (error) {
						console.error("加载音频异常:", error);
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
					level: "error",
					title: `打开文件失败: ${error instanceof Error ? error.message : "未知错误"}`,
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
			_neteaseCookie,
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
