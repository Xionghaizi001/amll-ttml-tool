import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewSession, AudioSource } from "$/states/main";
import type { AppNotification } from "$/states/notifications";
import { loadLyricsSiteAudio, getLyricsSiteAudioSourceInfo } from "$/modules/lyrics-site/services/audio-provider";
import { loadNeteaseAudio, getNeteaseAudioSourceInfo } from "$/modules/ncm/services/audio-provider";

export type AudioSourceType = "netease" | "lyrics-site";
export type AudioSourceOption = AudioSourceType;

export type AudioSourceInfo = {
	type: AudioSourceType;
	name: string;
	available: boolean;
	description?: string;
};

export type AudioSourceDialogState = {
	open: boolean;
	options: AudioSourceOption[];
	currentSource?: AudioSource;
	audioSourceInfos?: AudioSourceInfo[];
};

type PushNotification = (
	payload: Omit<AppNotification, "id" | "createdAt">,
) => void;

export const useAudioSwitch = (options: {
	pat: string;
	canReview: boolean;
	neteaseCookie: string;
	reviewSession: ReviewSession | null;
	openFile: (file: File) => void;
	pushNotification: PushNotification;
	setReviewSession: (session: ReviewSession | null) => void;
}) => {
	const {
		canReview,
		reviewSession,
		pushNotification,
		setReviewSession,
	} = options;
	const [audioLoadPendingId, setAudioLoadPendingId] = useState<string | null>(null);
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
			return Promise.resolve(ids[0] ?? null);
		}
		if (neteaseIdResolveRef.current) {
			neteaseIdResolveRef.current(null);
		}
		setNeteaseIdDialog({ open: true, ids });
		return new Promise<string | null>((resolve) => {
			neteaseIdResolveRef.current = resolve;
		});
	}, []);

	const requestAudioSource = useCallback(async (audioSourceInfos: AudioSourceInfo[], currentSource?: AudioSource) => {
		const availableSources = audioSourceInfos.filter(info => info.available).map(info => info.type);
		
		if (availableSources.length === 0) {
			return null;
		}
		
		if (availableSources.length === 1) {
			return availableSources[0];
		}

		if (audioSourceResolveRef.current) {
			audioSourceResolveRef.current(null);
		}
		setAudioSourceDialog({
			open: true,
			options: availableSources,
			currentSource,
			audioSourceInfos,
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

	const onSwitchAudio = useCallback(async () => {
		if (!reviewSession?.prNumber && reviewSession?.source !== "lyrics-site") {
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

		const audioSourceInfos: AudioSourceInfo[] = [];

		if (reviewSession.source === "lyrics-site" && reviewSession.audioFileName) {
			audioSourceInfos.push(await getLyricsSiteAudioSourceInfo(reviewSession.audioFileName, reviewSession.audioTitle));
		}

		if (reviewSession.ncmIds && reviewSession.ncmIds.length > 0) {
			audioSourceInfos.push(await getNeteaseAudioSourceInfo(reviewSession.ncmIds));
		}

		if (audioSourceInfos.length === 0) {
			pushNotification({
				title: "没有可用的音源",
				level: "warning",
				source: "review",
			});
			return;
		}

		const selectedSource = await requestAudioSource(audioSourceInfos, reviewSession.audioSource);

		if (!selectedSource) return;

		setAudioLoadPendingId(selectedSource);
		try {
			if (selectedSource === "lyrics-site") {
				const result = await loadLyricsSiteAudio({
					audioFileName: reviewSession.audioFileName,
					audioTitle: reviewSession.audioTitle,
					openFile: options.openFile,
					pushNotification,
				});
				if (result.success) {
					setReviewSession({
						...reviewSession,
						audioSource: "user-upload",
					});
				}
			} else if (selectedSource === "netease") {
				const ncmIds = reviewSession.ncmIds || [];
				let selectedId = ncmIds[0];
				if (ncmIds.length > 1) {
					const id = await requestNeteaseId(ncmIds);
					if (!id) return;
					selectedId = id;
				}

				if (selectedId) {
					await loadNeteaseAudio({
						prNumber: reviewSession.prNumber || 0,
						id: selectedId,
						pendingId: null,
						setPendingId: () => {},
						setLastNeteaseIdByPr: () => {},
						openFile: options.openFile,
						pushNotification,
						cookie: options.neteaseCookie,
					});
					setReviewSession({
						...reviewSession,
						audioSource: "netease",
					});
				}
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : "未知错误";
			pushNotification({
				title: `切换音频失败：${errorMsg}`,
				level: "error",
				source: "review",
			});
		} finally {
			setAudioLoadPendingId(null);
		}
	}, [
		audioLoadPendingId,
		canReview,
		options.openFile,
		options.neteaseCookie,
		pushNotification,
		requestAudioSource,
		requestNeteaseId,
		reviewSession,
		setReviewSession,
	]);

	const switchAudioEnabled =
		Boolean(reviewSession?.prNumber || reviewSession?.source === "lyrics-site") && !audioLoadPendingId;

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

export const useNcmAudioSwitch = useAudioSwitch;
