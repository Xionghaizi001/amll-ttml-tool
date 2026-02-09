import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { confirmDialogAtom, reviewReportDialogAtom } from "$/states/dialogs";
import {
	lyricLinesAtom,
	reviewReportDraftsAtom,
	reviewFreezeAtom,
	reviewSessionAtom,
	reviewStagedAtom,
	reviewStashLastSelectionAtom,
	reviewStashRemovedOrderAtom,
	reviewStashSubmittedAtom,
	selectedWordsAtom,
	ToolMode,
	toolModeAtom,
} from "$/states/main";
import {
	githubAmlldbAccessAtom,
	githubPatAtom,
	neteaseCookieAtom,
} from "$/modules/settings/states";
import { pushNotificationAtom } from "$/states/notifications";
import type { TTMLLyric } from "$/types/ttml";
import { useFileOpener } from "$/hooks/useFileOpener";
import { loadNeteaseAudio } from "$/modules/ncm/services/audio-service";
import { NeteaseIdSelectDialog } from "$/modules/ncm/modals/NeteaseIdSelectDialog";
import { requestFileUpdatePush } from "$/modules/user/modals/request-file-update-push";
import { ReviewActionGroup } from "$/components/TitleBar/modals/ReviewActionGroup";
import {
	buildEditReport,
	buildSyncChanges,
	buildSyncReport,
	buildSyncReportFromStash,
	mergeReports,
	type SyncChangeCandidate,
	type TimingStashItem,
} from "$/modules/review/services/report-service";
import { fetchPullRequestDetail } from "$/modules/github/services/PR-service";
import { parseReviewMetadata } from "$/modules/review/services/card-service";
import { StashDialog } from "./StashDialog";

export const useReviewTimingFlow = () => {
	const [toolMode, setToolMode] = useAtom(toolModeAtom);
	const reviewSession = useAtomValue(reviewSessionAtom);
	const setReviewSession = useSetAtom(reviewSessionAtom);
	const lyricLines = useAtomValue(lyricLinesAtom);
	const reviewFreeze = useAtomValue(reviewFreezeAtom);
	const reviewStaged = useAtomValue(reviewStagedAtom);
	const reviewReportDialog = useAtomValue(reviewReportDialogAtom);
	const reviewReportDrafts = useAtomValue(reviewReportDraftsAtom);
	const [reviewStashSubmitted, setReviewStashSubmitted] = useAtom(
		reviewStashSubmittedAtom,
	);
	const [reviewStashLastSelection, setReviewStashLastSelection] = useAtom(
		reviewStashLastSelectionAtom,
	);
	const [reviewStashRemovedOrder, setReviewStashRemovedOrder] = useAtom(
		reviewStashRemovedOrderAtom,
	);
	const setReviewReportDialog = useSetAtom(reviewReportDialogAtom);
	const setSelectedWords = useSetImmerAtom(selectedWordsAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const pat = useAtomValue(githubPatAtom);
	const canReview = useAtomValue(githubAmlldbAccessAtom);
	const neteaseCookie = useAtomValue(neteaseCookieAtom);
	const { openFile } = useFileOpener();
	const { t } = useTranslation();
	const [TimingCandidates, setTimingCandidates] = useState<SyncChangeCandidate[]>(
		[],
	);
	const [TimingStashOpen, setTimingStashOpen] = useState(false);
	const [TimingStashItems, setTimingStashItems] = useState<TimingStashItem[]>(
		[],
	);
	const [TimingStashSelected, setTimingStashSelected] = useState<Set<string>>(
		new Set(),
	);
	const [audioLoadPendingId, setAudioLoadPendingId] = useState<string | null>(
		null,
	);
	const [, setLastNeteaseIdByPr] = useState<Record<number, string>>({});
	const [neteaseIdDialog, setNeteaseIdDialog] = useState<{
		open: boolean;
		ids: string[];
	}>({ open: false, ids: [] });
	const neteaseIdResolveRef = useRef<((id: string | null) => void) | null>(
		null,
	);

	const TimingCandidateMap = useMemo(() => {
		const map = new Map<string, SyncChangeCandidate>();
		TimingCandidates.forEach((item) => {
			map.set(item.wordId, item);
		});
		return map;
	}, [TimingCandidates]);

	const TimingStashGroups = useMemo(() => {
		const grouped = new Map<
			number,
			Array<{ label: string; field: string; wordId: string }>
		>();
		TimingStashItems.forEach((stashItem) => {
			const candidate = TimingCandidateMap.get(stashItem.wordId);
			if (!candidate) return;
			const list = grouped.get(candidate.lineNumber) ?? [];
			list.push({
				label: `${candidate.word || "（空白）"}`,
				field: stashItem.field,
				wordId: stashItem.wordId,
			});
			grouped.set(candidate.lineNumber, list);
		});
		return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
	}, [TimingCandidateMap, TimingStashItems]);

	const TimingOrderMap = useMemo(() => {
		const source = reviewFreeze?.data ?? lyricLines;
		const map = new Map<string, number>();
		let orderIndex = 0;
		for (const line of source.lyricLines) {
			for (const word of line.words) {
				map.set(word.id, orderIndex);
				orderIndex += 1;
			}
		}
		return map;
	}, [lyricLines, reviewFreeze]);

	const stashKey = useMemo(() => {
		if (!reviewSession) return "";
		return `${reviewSession.prNumber}:${reviewSession.fileName}`;
	}, [reviewSession]);

	const displayItems = useMemo(() => {
		const items: Array<{
			lineNumber: number;
			wordId: string;
			label: string;
			orderIndex: number;
		}> = [];
		for (const [lineNumber, groupItems] of TimingStashGroups) {
			for (const gi of groupItems) {
				items.push({
					lineNumber,
					wordId: gi.wordId,
					label: gi.label,
					orderIndex: TimingOrderMap.get(gi.wordId) ?? Number.MAX_SAFE_INTEGER,
				});
			}
		}
		const seen = new Set<string>();
		return items
			.filter((it) => {
				if (seen.has(it.wordId)) return false;
				seen.add(it.wordId);
				return true;
			})
			.sort((a, b) => a.orderIndex - b.orderIndex);
	}, [TimingOrderMap, TimingStashGroups]);

	const TimingStashCards = useMemo(() => {
		const cards: Array<{
			lines: number[];
			items: Array<{ label: string; wordId: string }>;
		}> = [];
		let index = 0;
		while (index < displayItems.length) {
			const a = displayItems[index];
			const b = displayItems[index + 1];
			const adjacent = Boolean(a && b) && b.orderIndex === a.orderIndex + 1;
			if (a && b && adjacent) {
				const lines =
					a.lineNumber === b.lineNumber
						? [a.lineNumber]
						: [a.lineNumber, b.lineNumber];
				cards.push({
					lines,
					items: [
						{ label: a.label, wordId: a.wordId },
						{ label: b.label, wordId: b.wordId },
					],
				});
				index += 2;
				continue;
			}
			if (a) {
				cards.push({
					lines: [a.lineNumber],
					items: [{ label: a.label, wordId: a.wordId }],
				});
			}
			index += 1;
		}
		return cards;
	}, [displayItems]);

	useEffect(() => {
		if (!stashKey || !TimingStashOpen) return;
		const lastSelection = reviewStashLastSelection[stashKey] ?? [];
		if (lastSelection.length === 0) return;
		setTimingStashSelected((prev) => {
			if (
				prev.size === lastSelection.length &&
				lastSelection.every((id) => prev.has(id))
			) {
				return prev;
			}
			return new Set(lastSelection);
		});
	}, [reviewStashLastSelection, stashKey, TimingStashOpen]);

	useEffect(() => {
		if (!reviewSession || !reviewFreeze) {
			setTimingCandidates([]);
			setTimingStashItems([]);
			setTimingStashSelected(new Set());
			return;
		}
		const freezeData = reviewFreeze.data;
		const stagedData = reviewStaged ?? lyricLines;
		const candidates = buildSyncChanges(freezeData, stagedData);
		setTimingCandidates(candidates);
		const submittedSet = new Set(
			stashKey ? reviewStashSubmitted[stashKey] ?? [] : [],
		);
		const removedOrderSet = new Set(
			stashKey ? reviewStashRemovedOrder[stashKey] ?? [] : [],
		);
		const nextStash: TimingStashItem[] = [];
		for (const candidate of candidates) {
			if (submittedSet.has(candidate.wordId)) continue;
			const orderIndex = TimingOrderMap.get(candidate.wordId);
			if (orderIndex !== undefined && removedOrderSet.has(orderIndex)) continue;
			const startDelta = candidate.newStart - candidate.oldStart;
			const endDelta = candidate.newEnd - candidate.oldEnd;
			if (startDelta !== 0) {
				nextStash.push({ wordId: candidate.wordId, field: "startTime" });
			}
			if (endDelta !== 0) {
				nextStash.push({ wordId: candidate.wordId, field: "endTime" });
			}
		}
		setTimingStashItems(nextStash);
	}, [
		lyricLines,
		reviewFreeze,
		reviewSession,
		reviewStaged,
		reviewStashRemovedOrder,
		reviewStashSubmitted,
		stashKey,
		TimingOrderMap,
	]);

	useEffect(() => {
		if (!stashKey || !TimingStashOpen) return;
		if (!TimingStashSelected.size) return;
		setReviewStashLastSelection((prev) => ({
			...prev,
			[stashKey]: Array.from(TimingStashSelected),
		}));
	}, [
		setReviewStashLastSelection,
		stashKey,
		TimingStashOpen,
		TimingStashSelected,
	]);

	useEffect(() => {
		const available = new Set(TimingStashItems.map((item) => item.wordId));
		setTimingStashSelected((prev) => {
			if (prev.size === 0) return prev;
			let changed = false;
			const next = new Set<string>();
			prev.forEach((id) => {
				if (available.has(id)) {
					next.add(id);
					return;
				}
				changed = true;
			});
			if (!changed && next.size === prev.size) return prev;
			return next;
		});
	}, [TimingStashItems]);

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
			setPushNotification({
				title: "当前文件没有关联 PR，无法切换音频",
				level: "warning",
				source: "review",
			});
			return;
		}
		if (!canReview) {
			setPushNotification({
				title: "当前账号无权限切换音频",
				level: "error",
				source: "review",
			});
			return;
		}
		const token = pat.trim();
		if (!token) {
			setPushNotification({
				title: "请先在设置中登录以切换音频",
				level: "error",
				source: "review",
			});
			return;
		}
		const cookie = neteaseCookie.trim();
		if (!cookie) {
			setPushNotification({
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
			setPushNotification({
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
			pushNotification: setPushNotification,
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
		setPushNotification,
	]);

	const requestUpdatePush = useCallback(
		(session: NonNullable<typeof reviewSession>, lyric: TTMLLyric) => {
			requestFileUpdatePush({
				token: pat,
				session,
				lyric,
				setConfirmDialog,
				pushNotification: setPushNotification,
				onAfterPush: () => {
					setReviewReportDialog((prev) => ({
						...prev,
						open: false,
					}));
					setTimingStashItems([]);
					setTimingStashOpen(false);
					setTimingCandidates([]);
					setTimingStashSelected(new Set());
					setReviewSession(null);
					setToolMode(canReview ? ToolMode.Review : ToolMode.Edit);
				},
				onSuccess: () => {
					setPushNotification({
						title: "更新推送成功",
						level: "success",
						source: "review",
					});
				},
				onFailure: (message, url) => {
					setPushNotification({
						title: message || "更新推送失败",
						level: "error",
						source: "review",
						action: {
							type: "open-url",
							payload: { url },
						},
					});
				},
				onError: () => {
					setPushNotification({
						title: "推送更新失败",
						level: "error",
						source: "review",
					});
				},
			});
		},
		[
			canReview,
			pat,
			setConfirmDialog,
			setPushNotification,
			setReviewReportDialog,
			setReviewSession,
			setToolMode,
		],
	);

	const onReviewComplete = useCallback(() => {
		const activeSession = reviewSession;
		if (activeSession) {
			const draftMatch = reviewReportDrafts.find((item) => {
				if (activeSession.prNumber) {
					return item.prNumber === activeSession.prNumber;
				}
				return item.prTitle === activeSession.prTitle;
			});
			const baseReports: string[] = [];
			if (
				reviewReportDialog.open &&
				reviewReportDialog.prNumber === activeSession.prNumber
			) {
				baseReports.push(reviewReportDialog.report);
			} else if (draftMatch?.report) {
				baseReports.push(draftMatch.report);
			}
			const freezeData = reviewFreeze?.data ?? lyricLines;
			const stagedData = reviewStaged ?? lyricLines;
			const editReport = buildEditReport(freezeData, stagedData);
			if (activeSession.source === "update") {
				requestUpdatePush(activeSession, stagedData);
				return;
			}
			if (toolMode === ToolMode.Sync) {
				const candidates = buildSyncChanges(freezeData, stagedData);
				const syncReport =
					TimingStashItems.length > 0
						? buildSyncReportFromStash(candidates, TimingStashItems)
						: buildSyncReport(candidates);
				const report = mergeReports([editReport, syncReport]);
				const mergedReport = mergeReports([...baseReports, report]);
				setReviewReportDialog({
					open: true,
					prNumber: activeSession.prNumber,
					prTitle: activeSession.prTitle,
					report: mergedReport,
					draftId:
						(reviewReportDialog.open &&
							reviewReportDialog.prNumber === activeSession.prNumber &&
							reviewReportDialog.draftId) ||
						draftMatch?.id ||
						null,
				});
				setTimingStashItems([]);
				setTimingStashOpen(false);
				setTimingCandidates([]);
				setTimingStashSelected(new Set());
			} else {
				const report = editReport;
				const mergedReport = mergeReports([...baseReports, report]);
				setReviewReportDialog({
					open: true,
					prNumber: activeSession.prNumber,
					prTitle: activeSession.prTitle,
					report: mergedReport,
					draftId:
						(reviewReportDialog.open &&
							reviewReportDialog.prNumber === activeSession.prNumber &&
							reviewReportDialog.draftId) ||
						draftMatch?.id ||
						null,
				});
			}
		}
		setReviewSession(null);
		setToolMode(canReview ? ToolMode.Review : ToolMode.Edit);
	}, [
		canReview,
		lyricLines,
		requestUpdatePush,
		reviewFreeze,
		reviewReportDialog,
		reviewReportDrafts,
		reviewSession,
		reviewStaged,
		setReviewReportDialog,
		setReviewSession,
		setToolMode,
		TimingStashItems,
		toolMode,
	]);

	const onReviewCancel = useCallback(() => {
		setReviewSession(null);
		setTimingStashItems([]);
		setTimingStashOpen(false);
		setTimingCandidates([]);
	}, [setReviewSession]);

	const openTimingStash = useCallback(() => {
		setTimingStashOpen(true);
	}, []);

	const onToggleStashItem = useCallback(
		(wordId: string) => {
			setTimingStashSelected((prev) => {
				const next = new Set(prev);
				if (next.has(wordId)) next.delete(wordId);
				else next.add(wordId);
				return next;
			});
			setSelectedWords((o) => {
				o.clear();
				o.add(wordId);
			});
		},
		[setSelectedWords],
	);

	const onRemoveStashSelected = useCallback(() => {
		if (stashKey) {
			setReviewStashRemovedOrder((prev) => {
				const existing = new Set(prev[stashKey] ?? []);
				TimingStashSelected.forEach((wordId) => {
					const orderIndex = TimingOrderMap.get(wordId);
					if (orderIndex !== undefined) existing.add(orderIndex);
				});
				return { ...prev, [stashKey]: Array.from(existing) };
			});
		}
		setTimingStashItems((prev) =>
			prev.filter((item) => !TimingStashSelected.has(item.wordId)),
		);
	}, [
		stashKey,
		setReviewStashRemovedOrder,
		TimingStashSelected,
		TimingOrderMap,
	]);

	const onClearStash = useCallback(() => {
		if (stashKey) {
			setReviewStashRemovedOrder((prev) => {
				const existing = new Set(prev[stashKey] ?? []);
				TimingStashItems.forEach((item) => {
					const orderIndex = TimingOrderMap.get(item.wordId);
					if (orderIndex !== undefined) existing.add(orderIndex);
				});
				return { ...prev, [stashKey]: Array.from(existing) };
			});
		}
		setTimingStashItems([]);
		setTimingStashSelected(new Set());
	}, [
		stashKey,
		setReviewStashRemovedOrder,
		TimingOrderMap,
		TimingStashItems,
	]);

	const onConfirmStash = useCallback(() => {
		const selected = TimingStashItems.filter((item) =>
			TimingStashSelected.has(item.wordId),
		);
		if (selected.length === 0) return;
		const report = buildSyncReportFromStash(TimingCandidates, selected);
		const prNumber = reviewSession?.prNumber ?? null;
		const prTitle = reviewSession?.prTitle ?? "";
		const draftMatch = reviewReportDrafts.find((item) => {
			if (prNumber) return item.prNumber === prNumber;
			return item.prTitle === prTitle;
		});
		const baseReports: string[] = [];
		if (reviewReportDialog.open && reviewReportDialog.prNumber === prNumber) {
			baseReports.push(reviewReportDialog.report);
		} else if (draftMatch?.report) {
			baseReports.push(draftMatch.report);
		}
		const mergedReport = mergeReports([...baseReports, report]);
		if (stashKey) {
			const committed = new Set(reviewStashSubmitted[stashKey] ?? []);
			for (const it of selected) {
				committed.add(it.wordId);
			}
			setReviewStashSubmitted((prev) => ({
				...prev,
				[stashKey]: Array.from(committed),
			}));
			setReviewStashLastSelection((prev) => ({
				...prev,
				[stashKey]: Array.from(TimingStashSelected),
			}));
		}
		setReviewReportDialog({
			open: true,
			prNumber,
			prTitle,
			report: mergedReport,
			draftId:
				(reviewReportDialog.open &&
					reviewReportDialog.prNumber === prNumber &&
					reviewReportDialog.draftId) ||
				draftMatch?.id ||
				null,
		});
		setTimingStashItems([]);
		setTimingStashSelected(new Set());
		setTimingStashOpen(false);
	}, [
		reviewReportDialog,
		reviewReportDrafts,
		reviewSession,
		reviewStashSubmitted,
		setReviewReportDialog,
		setReviewStashLastSelection,
		setReviewStashSubmitted,
		stashKey,
		TimingCandidates,
		TimingStashItems,
		TimingStashSelected,
	]);

	const dialogs = (
		<>
			<StashDialog
				open={TimingStashOpen}
				onOpenChange={setTimingStashOpen}
				stashCards={TimingStashCards}
				selectedIds={TimingStashSelected}
				stashItemsCount={TimingStashItems.length}
				onToggleItem={onToggleStashItem}
				onClose={() => setTimingStashOpen(false)}
				onRemoveSelected={onRemoveStashSelected}
				onClear={onClearStash}
				onConfirm={onConfirmStash}
				t={t}
			/>
			<NeteaseIdSelectDialog
				open={neteaseIdDialog.open}
				ids={neteaseIdDialog.ids}
				onSelect={handleSelectNeteaseId}
				onClose={closeNeteaseIdDialog}
			/>
		</>
	);

	return {
		dialogs,
		openTimingStash,
		onReviewCancel,
		onReviewComplete,
		onSwitchAudio,
		switchAudioEnabled: Boolean(reviewSession?.prNumber) && !audioLoadPendingId,
		canReview,
	};
};

export const useReviewTitleBar = (options?: {
	actionGroupClassName?: string;
}) => {
	const reviewSession = useAtomValue(reviewSessionAtom);
	const {
		dialogs,
		openTimingStash,
		onReviewComplete,
		onReviewCancel,
		onSwitchAudio,
		switchAudioEnabled,
		canReview,
	} = useReviewTimingFlow();

	const showStash = reviewSession?.source !== "update";
	const actionGroup = reviewSession ? (
		<ReviewActionGroup
			className={options?.actionGroupClassName}
			showStash={showStash}
			stashEnabled={Boolean(showStash)}
			onOpenStash={openTimingStash}
			showSwitchAudio={canReview}
			switchAudioEnabled={switchAudioEnabled}
			onSwitchAudio={onSwitchAudio}
			onComplete={onReviewComplete}
			onCancel={onReviewCancel}
		/>
	) : null;

	return {
		dialogs,
		actionGroup,
		reviewSession,
	};
};
