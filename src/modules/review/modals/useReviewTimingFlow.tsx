import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { NeteaseIdSelectDialog } from "$/modules/ncm/modals/NeteaseIdSelectDialog";
import { requestFileUpdatePush } from "$/modules/user/services/request-file-update-push";
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
import {
	buildStashKey,
	buildTimingStashCards,
	buildTimingStashGroups,
} from "$/modules/review/services/stash-service";
import { useNcmAudioSwitch } from "$/modules/review/services/audio-switch";
import { StashDialog } from "./StashDialog";
import { AudioSourceSelectDialog } from "./AudioSourceSelectDialog";

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
	const [TimingStashSelected, setTimingStashSelected] = useState<
		Map<string, "startTime" | "endTime">
	>(new Map());
	const {
		neteaseIdDialog,
		closeNeteaseIdDialog,
		handleSelectNeteaseId,
		audioSourceDialog,
		closeAudioSourceDialog,
		handleSelectAudioSource,
		onSwitchAudio,
		switchAudioEnabled,
	} = useNcmAudioSwitch({
		pat,
		canReview,
		neteaseCookie,
		reviewSession,
		openFile,
		pushNotification: setPushNotification,
		setReviewSession,
	});

	const TimingCandidateMap = useMemo(() => {
		const map = new Map<string, SyncChangeCandidate>();
		TimingCandidates.forEach((item) => {
			map.set(item.wordId, item);
		});
		return map;
	}, [TimingCandidates]);

	const TimingStashGroups = useMemo(
		() => buildTimingStashGroups(TimingCandidateMap, TimingStashItems),
		[TimingCandidateMap, TimingStashItems],
	);

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

	const stashKey = useMemo(() => buildStashKey(reviewSession), [reviewSession]);

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

	const TimingStashCards = useMemo(
		() => buildTimingStashCards(displayItems),
		[displayItems],
	);

	useEffect(() => {
		if (!stashKey || !TimingStashOpen) return;
		const lastSelection = reviewStashLastSelection[stashKey] ?? [];
		if (lastSelection.length === 0) return;
		setTimingStashSelected((prev) => {
			if (
				prev.size === lastSelection.length &&
				lastSelection.every(([id, field]) => prev.get(id) === field)
			) {
				return prev;
			}
			return new Map(lastSelection);
		});
	}, [reviewStashLastSelection, stashKey, TimingStashOpen]);

	useEffect(() => {
		if (!reviewSession || !reviewFreeze) {
			setTimingCandidates([]);
			setTimingStashItems([]);
			setTimingStashSelected(new Map());
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
			[stashKey]: Array.from(TimingStashSelected.entries()),
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
			const next = new Map<string, "startTime" | "endTime">();
			prev.forEach((field, id) => {
				if (available.has(id)) {
					next.set(id, field);
					return;
				}
				changed = true;
			});
			if (!changed && next.size === prev.size) return prev;
			return next;
		});
	}, [TimingStashItems]);

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
					setTimingStashSelected(new Map());
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
					source: activeSession.source,
					submissionId: activeSession.source === "lyrics-site" ? String(activeSession.prNumber) : undefined,
				});
				setTimingStashItems([]);
				setTimingStashOpen(false);
				setTimingCandidates([]);
				setTimingStashSelected(new Map());
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
					source: activeSession.source,
					submissionId: activeSession.source === "lyrics-site" ? String(activeSession.prNumber) : undefined,
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
		(wordId: string, field: "startTime" | "endTime") => {
			setTimingStashSelected((prev) => {
				const next = new Map(prev);
				if (next.get(wordId) === field) next.delete(wordId);
				else next.set(wordId, field);
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
				TimingStashSelected.forEach((_field, wordId) => {
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
		setTimingStashSelected(new Map());
	}, [
		stashKey,
		setReviewStashRemovedOrder,
		TimingOrderMap,
		TimingStashItems,
	]);

	const onSelectAllStash = useCallback(
		(field: "startTime" | "endTime") => {
			setTimingStashSelected(() => {
				const next = new Map<string, "startTime" | "endTime">();
				displayItems.forEach((item) => {
					next.set(item.wordId, field);
				});
				return next;
			});
		},
		[displayItems],
	);

	const onConfirmStash = useCallback(() => {
		const selected: TimingStashItem[] = [];
		TimingStashSelected.forEach((field, wordId) => {
			selected.push({ wordId, field });
		});
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
				[stashKey]: Array.from(TimingStashSelected.entries()),
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
			source: reviewSession?.source,
			submissionId: reviewSession?.source === "lyrics-site" ? String(prNumber) : undefined,
		});
		setTimingStashItems([]);
		setTimingStashSelected(new Map());
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
				onSelectAll={onSelectAllStash}
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
			<AudioSourceSelectDialog
				open={audioSourceDialog.open}
				options={audioSourceDialog.options}
				currentSource={audioSourceDialog.currentSource}
				audioTitle={audioSourceDialog.audioTitle}
				onSelect={handleSelectAudioSource}
				onClose={closeAudioSourceDialog}
			/>
		</>
	);

	return {
		dialogs,
		openTimingStash,
		onReviewCancel,
		onReviewComplete,
		onSwitchAudio,
		switchAudioEnabled,
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
