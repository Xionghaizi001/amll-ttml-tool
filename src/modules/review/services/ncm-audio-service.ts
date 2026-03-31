import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewSession } from "$/states/main";
import type { AppNotification } from "$/states/notifications";
import { fetchPullRequestDetail } from "$/modules/github/services/PR-service";
import { loadNeteaseAudio } from "$/modules/ncm/services/audio-service";
import { parseReviewMetadata } from "$/modules/review/services/card-service";

type PushNotification = (
	payload: Omit<AppNotification, "id" | "createdAt">,
) => void;

export const useNcmAudioSwitch = (options: {
	pat: string;
	canReview: boolean;
	neteaseCookie: string;
	reviewSession: ReviewSession | null;
	openFile: (file: File) => void;
	pushNotification: PushNotification;
}) => {
	const {
		pat,
		canReview,
		neteaseCookie,
		reviewSession,
		openFile,
		pushNotification,
	} = options;
	const [audioLoadPendingId, setAudioLoadPendingId] = useState<string | null>(
		null,
	);
	const [, setLastNeteaseIdByPr] = useState<Record<number, string>>({});
	const [neteaseIdDialog, setNeteaseIdDialog] = useState<{
		open: boolean;
		ids: string[];
	}>({ open: false, ids: [] });
	const neteaseIdResolveRef = useRef<((id: string | null) => void) | null>(null);

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

	useEffect(() => {
		if (reviewSession || !neteaseIdDialog.open) return;
		closeNeteaseIdDialog();
	}, [closeNeteaseIdDialog, neteaseIdDialog.open, reviewSession]);

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
		if (audioLoadPendingId) return;
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
	}, [
		audioLoadPendingId,
		canReview,
		neteaseCookie,
		openFile,
		pat,
		reviewSession,
		requestNeteaseId,
		pushNotification,
	]);

	const switchAudioEnabled =
		Boolean(reviewSession?.prNumber) && !audioLoadPendingId;

	return {
		neteaseIdDialog,
		closeNeteaseIdDialog,
		handleSelectNeteaseId,
		onSwitchAudio,
		switchAudioEnabled,
	};
};
