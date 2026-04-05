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
	fetchSubmissionDetail,
	fetchLyricFileContent,
	fetchAudioFileContent,
	getLyricFileUrl,
	submitReview,
	type LyricsSiteSubmission,
	type ReviewAction,
} from "./lyrics-site-service";
import { useFileOpener } from "$/hooks/useFileOpener";
import { loadNeteaseAudio } from "$/modules/ncm/services/audio-service";
import { audioEngine } from "$/modules/audio/audio-engine";
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

					if (audioLoadPendingId) return;

					if (submission.audio?.fileName) {
						setAudioLoadPendingId(`user-${submission.audio.fileName}`);
						try {
							const audioBlob = await fetchAudioFileContent(token, submission.audio.fileName);
							if (audioBlob) {
								const audioFile = new File([audioBlob], submission.audio.fileName, {
									type: audioBlob.type || "audio/*",
								});
								await audioEngine.loadMusic(audioFile);
								setReviewSession((prev) => prev ? { ...prev, audioSource: "user-upload" as AudioSource } : prev);
								setPushNotification({
									id: `user-audio-loaded-${submission.id}`,
									level: "success",
									title: `已加载用户上传音频：${submission.audio.title || submission.audio.fileName}`,
									source: "audio",
								});
							} else {
								throw new Error("无法获取音频文件");
							}
						} catch (error) {
							console.error("加载用户上传音频失败:", error);
							setPushNotification({
								id: `user-audio-error-${submission.id}`,
								level: "warning",
								title: "加载用户上传音频失败，尝试加载网易云音频",
								source: "audio",
							});
							if (ncmIds.length > 0) {
								const ncmId = ncmIds[0];
								setAudioLoadPendingId(ncmId);
								try {
									await loadNeteaseAudio({
										prNumber,
										id: ncmId,
										pendingId: null,
										setPendingId: setAudioLoadPendingId,
										setLastNeteaseIdByPr: () => {},
										openFile,
										pushNotification: (payload) => {
											setPushNotification({
												id: `ncm-audio-${ncmId}`,
												level: payload.level,
												title: payload.title,
												source: payload.source,
											});
										},
										cookie: neteaseCookie,
									});
									setReviewSession((prev) => prev ? { ...prev, audioSource: "netease" as AudioSource } : prev);
								} catch (ncmError) {
									console.error("加载网易云音频失败:", ncmError);
								}
							}
						} finally {
							setAudioLoadPendingId(null);
						}
					} else if (ncmIds.length > 0) {
						const ncmId = ncmIds[0];
						setAudioLoadPendingId(ncmId);
						try {
							await loadNeteaseAudio({
								prNumber,
								id: ncmId,
								pendingId: null,
								setPendingId: setAudioLoadPendingId,
								setLastNeteaseIdByPr: () => {},
								openFile,
								pushNotification: (payload) => {
									setPushNotification({
										id: `ncm-audio-${ncmId}`,
										level: payload.level,
										title: payload.title,
										source: payload.source,
									});
								},
								cookie: neteaseCookie,
							});
							setReviewSession((prev) => prev ? { ...prev, audioSource: "netease" as AudioSource } : prev);
						} catch (error) {
							console.error("加载音频失败:", error);
						}
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
			neteaseCookie,
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
