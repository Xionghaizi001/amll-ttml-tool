import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewSession, AudioSource } from "$/states/main";
import type { AppNotification } from "$/states/notifications";
import { fetchPullRequestDetail } from "$/modules/github/services/PR-service";
import { parseReviewMetadata } from "$/modules/review/services/card-service";
import { createAudioSelector, type AudioSelector } from "$/modules/audio/services/audio-selector";
import type { AudioSourceType, AudioSourceInfo } from "$/modules/audio/services/audio-provider";

type PushNotification = (
	payload: Omit<AppNotification, "id" | "createdAt">,
) => void;

export type AudioSourceOption = AudioSourceType;

export type AudioSourceDialogState = {
	open: boolean;
	options: AudioSourceOption[];
	currentSource?: AudioSource;
	audioSourceInfos?: AudioSourceInfo[];
};

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
		pat,
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
	const audioSelectorRef = useRef<AudioSelector | null>(null);

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

	const createAudioSelectorForSession = useCallback(() => {
		if (!reviewSession) return null;

		return createAudioSelector({
			lyricsSiteConfig: reviewSession.source === "lyrics-site" && reviewSession.audioFileName ? {
				audioFileName: reviewSession.audioFileName,
				audioTitle: reviewSession.audioTitle,
			} : undefined,
			neteaseConfig: reviewSession.ncmIds && reviewSession.ncmIds.length > 0 ? {
				ncmIds: reviewSession.ncmIds,
				prNumber: reviewSession.prNumber,
				onSelectId: requestNeteaseId,
			} : undefined,
		});
	}, [reviewSession, requestNeteaseId]);

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

		const selector = createAudioSelectorForSession();
		if (!selector) return;

		audioSelectorRef.current = selector;

		const audioSourceInfos = await selector.getAudioSourceInfos();
		const selectedSource = await requestAudioSource(audioSourceInfos, reviewSession.audioSource);

		if (!selectedSource) return;

		setAudioLoadPendingId(selectedSource);
		try {
			const result = await selector.loadFromSource(selectedSource, {
				pushNotification,
			});

			if (result.success) {
				setReviewSession({
					...reviewSession,
					audioSource: selectedSource === "lyrics-site" ? "user-upload" : selectedSource,
				});
			}
		} finally {
			setAudioLoadPendingId(null);
		}
	}, [
		audioLoadPendingId,
		canReview,
		createAudioSelectorForSession,
		pushNotification,
		requestAudioSource,
		reviewSession,
		setReviewSession,
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

export const useNcmAudioSwitch = useAudioSwitch;
