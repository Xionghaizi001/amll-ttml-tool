import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewSession, AudioSource } from "$/states/main";
import type { AppNotification } from "$/states/notifications";
import { fetchPullRequestDetail } from "$/modules/github/services/PR-service";
import { loadNeteaseAudio } from "$/modules/ncm/services/audio-service";
import { parseReviewMetadata } from "$/modules/review/services/card-service";
import { fetchAudioFileContent } from "./lyrics-site-service";
import { audioEngine } from "$/modules/audio/audio-engine";
import { lyricsSiteTokenAtom } from "$/modules/settings/states";
import { globalStore } from "$/states/store";

type PushNotification = (
	payload: Omit<AppNotification, "id" | "createdAt">,
) => void;

export type AudioSourceOption = "user-upload" | "netease";

export type AudioSourceDialogState = {
	open: boolean;
	options: AudioSourceOption[];
	currentSource?: AudioSource;
	audioTitle?: string;
};

export const useNcmAudioSwitch = (options: {
	pat: string;
	canReview: boolean;
	neteaseCookie: string;
	reviewSession: ReviewSession | null;
	openFile: (file: File) => void;
	pushNotification: PushNotification;
	setReviewSession: (session: ReviewSession | null) => void;
}) => {
	const {
		pat,
		canReview,
		neteaseCookie,
		reviewSession,
		openFile,
		pushNotification,
		setReviewSession,
	} = options;
	const [audioLoadPendingId, setAudioLoadPendingId] = useState<string | null>(
		null,
	);
	const [, setLastNeteaseIdByPr] = useState<Record<number, string>>({});
	const [neteaseIdDialog, setNeteaseIdDialog] = useState<{
		open: boolean;
		ids: string[];
	}>({ open: false, ids: [] });
	const [audioSourceDialog, setAudioSourceDialog] = useState<AudioSourceDialogState>({
		open: false,
		options: [],
	});
	const neteaseIdResolveRef = useRef<((id: string | null) => void) | null>(null);
	const audioSourceResolveRef = useRef<((source: AudioSourceOption | null) => void) | null>(null);

	const closeNeteaseIdDialog = useCallback(() => {
		if (neteaseIdResolveRef.current) {
			neteaseIdResolveRef.current(null);
			neteaseIdResolveRef.current = null;
		}
		setNeteaseIdDialog({ open: false, ids: [] });
	}, []);

	const handleSelectNeteaseId = useCallback((id: string) => {
		if (neteaseIdResolveRef.current) {
			neteaseIdResolveRef.current(id);
			neteaseIdResolveRef.current = null;
		}
		setNeteaseIdDialog({ open: false, ids: [] });
	}, []);

	const closeAudioSourceDialog = useCallback(() => {
		if (audioSourceResolveRef.current) {
			audioSourceResolveRef.current(null);
			audioSourceResolveRef.current = null;
		}
		setAudioSourceDialog({ open: false, options: [] });
	}, []);

	const handleSelectAudioSource = useCallback((source: AudioSourceOption) => {
		if (audioSourceResolveRef.current) {
			audioSourceResolveRef.current(source);
			audioSourceResolveRef.current = null;
		}
		setAudioSourceDialog({ open: false, options: [] });
	}, []);

	const requestNeteaseId = useCallback((ids: string[]) => {
		if (ids.length <= 1) {
			return ids[0] ?? null;
		}
		if (neteaseIdResolveRef.current) {
			neteaseIdResolveRef.current(null);
		}
		setNeteaseIdDialog({ open: true, ids });
		return new Promise<string | null>((resolve) => {
			neteaseIdResolveRef.current = resolve;
		});
	}, []);

	const requestAudioSource = useCallback((options: {
		availableSources: AudioSourceOption[];
		currentSource?: AudioSource;
		audioTitle?: string;
	}) => {
		if (options.availableSources.length <= 1) {
			return options.availableSources[0] ?? null;
		}
		if (audioSourceResolveRef.current) {
			audioSourceResolveRef.current(null);
		}
		setAudioSourceDialog({
			open: true,
			options: options.availableSources,
			currentSource: options.currentSource,
			audioTitle: options.audioTitle,
		});
		return new Promise<AudioSourceOption | null>((resolve) => {
			audioSourceResolveRef.current = resolve;
		});
	}, []);

	useEffect(() => {
		if (reviewSession || !neteaseIdDialog.open) return;
		closeNeteaseIdDialog();
	}, [closeNeteaseIdDialog, neteaseIdDialog.open, reviewSession]);

	useEffect(() => {
		if (reviewSession || !audioSourceDialog.open) return;
		closeAudioSourceDialog();
	}, [audioSourceDialog.open, closeAudioSourceDialog, reviewSession]);

	const loadUserUploadAudio = useCallback(async (
		audioFileName: string,
		prNumber: number,
	) => {
		const token = globalStore.get(lyricsSiteTokenAtom);
		if (!token) {
			pushNotification({
				title: "请先登录歌词站",
				level: "error",
				source: "review",
			});
			return false;
		}

		setAudioLoadPendingId(`user-${audioFileName}`);
		try {
			const audioBlob = await fetchAudioFileContent(token, audioFileName);
			if (audioBlob) {
				const audioFile = new File([audioBlob], audioFileName, {
					type: audioBlob.type || "audio/*",
				});
				await audioEngine.loadMusic(audioFile);
				setReviewSession({
					...reviewSession!,
					audioSource: "user-upload" as AudioSource,
				});
				pushNotification({
					title: "已加载用户上传音频",
					level: "success",
					source: "audio",
				});
				return true;
			} else {
				throw new Error("无法获取音频文件");
			}
		} catch (error) {
			pushNotification({
				title: `加载用户上传音频失败: ${error instanceof Error ? error.message : "未知错误"}`,
				level: "error",
				source: "audio",
			});
			return false;
		} finally {
			setAudioLoadPendingId(null);
		}
	}, [pushNotification, reviewSession, setReviewSession]);

	const loadNeteaseAudioById = useCallback(async (
		ncmId: string,
		prNumber: number,
	) => {
		const cookie = neteaseCookie.trim();
		if (!cookie) {
			pushNotification({
				title: "请先登录网易云音乐以切换音频",
				level: "error",
				source: "ncm",
			});
			return false;
		}

		setAudioLoadPendingId(ncmId);
		try {
			await loadNeteaseAudio({
				prNumber,
				id: ncmId,
				pendingId: null,
				setPendingId: setAudioLoadPendingId,
				setLastNeteaseIdByPr,
				openFile,
				pushNotification,
				cookie,
			});
			setReviewSession({
				...reviewSession!,
				audioSource: "netease" as AudioSource,
			});
			return true;
		} catch (error) {
			pushNotification({
				title: `加载网易云音频失败: ${error instanceof Error ? error.message : "未知错误"}`,
				level: "error",
				source: "audio",
			});
			return false;
		} finally {
			setAudioLoadPendingId(null);
		}
	}, [neteaseCookie, openFile, pushNotification, reviewSession, setReviewSession]);

	const onSwitchAudio = useCallback(async () => {
		if (!reviewSession?.prNumber) {
			pushNotification({
				title: "当前文件没有关联 PR，无法切换音频",
				level: "warning",
				source: "review",
			});
			return;
		}
		if (!canReview) {
			pushNotification({
				title: "当前账号无权限切换音频",
				level: "error",
				source: "review",
			});
			return;
		}
		if (audioLoadPendingId) return;

		if (reviewSession.source === "lyrics-site") {
			const availableSources: AudioSourceOption[] = [];
			if (reviewSession.audioFileName) {
				availableSources.push("user-upload");
			}
			if (reviewSession.ncmIds && reviewSession.ncmIds.length > 0) {
				availableSources.push("netease");
			}

			if (availableSources.length === 0) {
				pushNotification({
					title: "没有可切换的音频源",
					level: "warning",
					source: "review",
				});
				return;
			}

			const selectedSource = await requestAudioSource({
				availableSources,
				currentSource: reviewSession.audioSource,
			});

			if (!selectedSource) return;

			if (selectedSource === "user-upload" && reviewSession.audioFileName) {
				await loadUserUploadAudio(reviewSession.audioFileName, reviewSession.prNumber);
			} else if (selectedSource === "netease" && reviewSession.ncmIds && reviewSession.ncmIds.length > 0) {
				const selectedId = await requestNeteaseId(reviewSession.ncmIds);
				if (selectedId) {
					await loadNeteaseAudioById(selectedId, reviewSession.prNumber);
				}
			}
		} else {
			const token = pat.trim();
			if (!token) {
				pushNotification({
					title: "请先在设置中登录以切换音频",
					level: "error",
					source: "review",
				});
				return;
			}
			const cookie = neteaseCookie.trim();
			if (!cookie) {
				pushNotification({
					title: "请先登录网易云音乐以切换音频",
					level: "error",
					source: "ncm",
				});
				return;
			}
			const detail = await fetchPullRequestDetail({
				token,
				prNumber: reviewSession.prNumber,
			});
			const metadata = detail?.body ? parseReviewMetadata(detail.body) : null;
			const cleanedIds =
				metadata?.ncmId.map((id) => id.trim()).filter(Boolean) ?? [];
			if (cleanedIds.length === 0) {
				pushNotification({
					title: "未找到可切换的网易云音乐 ID",
					level: "warning",
					source: "review",
				});
				return;
			}
			const selectedId = await requestNeteaseId(cleanedIds);
			if (!selectedId) return;
			await loadNeteaseAudio({
				prNumber: reviewSession.prNumber,
				id: selectedId,
				pendingId: audioLoadPendingId,
				setPendingId: setAudioLoadPendingId,
				setLastNeteaseIdByPr,
				openFile,
				pushNotification,
				cookie,
			});
		}
	}, [
		audioLoadPendingId,
		canReview,
		loadNeteaseAudioById,
		loadUserUploadAudio,
		neteaseCookie,
		openFile,
		pat,
		requestAudioSource,
		requestNeteaseId,
		reviewSession,
		pushNotification,
	]);

	const switchAudioEnabled =
		Boolean(reviewSession?.prNumber) && !audioLoadPendingId;

	return {
		neteaseIdDialog,
		closeNeteaseIdDialog,
		handleSelectNeteaseId,
		audioSourceDialog,
		closeAudioSourceDialog,
		handleSelectAudioSource,
		onSwitchAudio,
		switchAudioEnabled,
	};
};
