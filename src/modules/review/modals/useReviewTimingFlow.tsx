import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { uid } from "uid";
import { ReviewActionGroup } from "$/components/TitleBar/modals/ReviewActionGroup";
import { useFileOpener } from "$/hooks/useFileOpener";
import { NeteaseIdSelectDialog } from "$/modules/ncm/modals/NeteaseIdSelectDialog";
import { useNcmAudioSwitch } from "$/modules/review/services/audio-switch";
import {
	buildReviewReportFromDiffs,
	buildSyncChanges,
	buildSyncReport,
	buildSyncReportFromStash,
	hasReviewReportContent,
	type ReviewReportInput,
	renderReviewReport,
	type SyncChangeCandidate,
	type TimingStashItem,
} from "$/modules/review/services/report-service";
import {
	buildStashKey,
	buildTimingStashCards,
	buildTimingStashGroups,
	buildTimingStashItemKey,
} from "$/modules/review/services/stash-service";
import {
	githubAmlldbAccessAtom,
	githubPatAtom,
	neteaseCookieAtom,
} from "$/modules/settings/states";
import { requestFileUpdatePush } from "$/modules/user/services/request-file-update-push";
import {
	confirmDialogAtom,
	type ReviewReportDialogState,
	reviewReportDialogAtom,
} from "$/states/dialogs";
import {
	lyricLinesAtom,
	type ReviewReportDraft,
	reviewFreezeAtom,
	reviewReportDraftsAtom,
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
	pushNotificationAtom,
	upsertNotificationAtom,
} from "$/states/notifications";
import type { TTMLLyric } from "$/types/ttml";
import { AudioSourceSelectDialog } from "./AudioSourceSelectDialog";
import { StashDialog } from "./StashDialog";

type TimingStashSelectionEntry = [string, TimingStashItem["field"]];

export const useReviewTimingFlow = () => {
	const [toolMode, setToolMode] = useAtom(toolModeAtom);
	const reviewSession = useAtomValue(reviewSessionAtom);
	const setReviewSession = useSetAtom(reviewSessionAtom);
	const lyricLines = useAtomValue(lyricLinesAtom);
	const reviewFreeze = useAtomValue(reviewFreezeAtom);
	const reviewStaged = useAtomValue(reviewStagedAtom);
	const reviewReportDialog = useAtomValue(reviewReportDialogAtom);
	const reviewReportDrafts = useAtomValue(reviewReportDraftsAtom);
	const setReviewReportDrafts = useSetAtom(reviewReportDraftsAtom);
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
	const setUpsertNotification = useSetAtom(upsertNotificationAtom);
	const pat = useAtomValue(githubPatAtom);
	const canReview = useAtomValue(githubAmlldbAccessAtom);
	const neteaseCookie = useAtomValue(neteaseCookieAtom);
	const { openFile } = useFileOpener();
	const { t } = useTranslation();
	const autoReportDraftIdsRef = useRef<Record<string, string>>({});
	const [TimingCandidates, setTimingCandidates] = useState<
		SyncChangeCandidate[]
	>([]);
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
			field: TimingStashItem["field"];
			key: string;
			label: string;
			orderIndex: number;
		}> = [];
		for (const [lineNumber, groupItems] of TimingStashGroups) {
			for (const gi of groupItems) {
				const key = buildTimingStashItemKey(gi.wordId, gi.field);
				items.push({
					lineNumber,
					wordId: gi.wordId,
					field: gi.field,
					key,
					label: gi.label,
					orderIndex:
						(TimingOrderMap.get(gi.wordId) ?? Number.MAX_SAFE_INTEGER) * 2 +
						(gi.field === "startTime" ? 0 : 1),
				});
			}
		}
		const seen = new Set<string>();
		return items
			.filter((it) => {
				if (seen.has(it.key)) return false;
				seen.add(it.key);
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
		const lastSelection: TimingStashSelectionEntry[] =
			reviewStashLastSelection[stashKey] ?? [];
		if (lastSelection.length === 0) return;
		setTimingStashSelected((prev) => {
			if (
				prev.size === lastSelection.length &&
				lastSelection.every(
					([id, field]: TimingStashSelectionEntry) => prev.get(id) === field,
				)
			) {
				return prev;
			}
			return new Map(
				lastSelection.map(([id, field]: TimingStashSelectionEntry) => [
					id.includes(":") ? id : buildTimingStashItemKey(id, field),
					field,
				]),
			);
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
			stashKey ? (reviewStashSubmitted[stashKey] ?? []) : [],
		);
		const removedItems: Array<string | number> = stashKey
			? (reviewStashRemovedOrder[stashKey] ?? [])
			: [];
		const removedLegacyOrderSet = new Set(
			removedItems.filter((item): item is number => typeof item === "number"),
		);
		const removedItemKeySet = new Set(
			removedItems.filter((item): item is string => typeof item === "string"),
		);
		const nextStash: TimingStashItem[] = [];
		for (const candidate of candidates) {
			if (submittedSet.has(candidate.wordId)) continue;
			const orderIndex = TimingOrderMap.get(candidate.wordId);
			const legacyRemoved =
				orderIndex !== undefined && removedLegacyOrderSet.has(orderIndex);
			const startDelta = candidate.newStart - candidate.oldStart;
			const endDelta = candidate.newEnd - candidate.oldEnd;
			if (startDelta !== 0) {
				const field = "startTime";
				const itemKey = buildTimingStashItemKey(candidate.wordId, field);
				if (
					!legacyRemoved &&
					!submittedSet.has(itemKey) &&
					!removedItemKeySet.has(itemKey)
				) {
					nextStash.push({ wordId: candidate.wordId, field });
				}
			}
			if (endDelta !== 0) {
				const field = "endTime";
				const itemKey = buildTimingStashItemKey(candidate.wordId, field);
				if (
					!legacyRemoved &&
					!submittedSet.has(itemKey) &&
					!removedItemKeySet.has(itemKey)
				) {
					nextStash.push({ wordId: candidate.wordId, field });
				}
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
		setReviewStashLastSelection(
			(prev: Record<string, Array<[string, "startTime" | "endTime"]>>) => ({
				...prev,
				[stashKey]: Array.from(TimingStashSelected.entries()),
			}),
		);
	}, [
		setReviewStashLastSelection,
		stashKey,
		TimingStashOpen,
		TimingStashSelected,
	]);

	useEffect(() => {
		const available = new Set(
			TimingStashItems.map((item) =>
				buildTimingStashItemKey(item.wordId, item.field),
			),
		);
		setTimingStashSelected((prev) => {
			if (prev.size === 0) return prev;
			let changed = false;
			const next = new Map<string, "startTime" | "endTime">();
			prev.forEach((field, key) => {
				if (available.has(key)) {
					next.set(key, field);
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
					setReviewReportDialog((prev: ReviewReportDialogState) => ({
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

	useEffect(() => {
		// 自动编辑差异不依赖“暂存”：审阅会话中的 staged 一变化，就刷新当前报告或已有草稿。
		if (!reviewSession || !reviewFreeze) return;
		if (reviewSession.source === "update") return;
		const freezeData = reviewFreeze.data;
		const stagedData = reviewStaged ?? lyricLines;
		const draftMatch = reviewReportDrafts.find((item) => {
			if (reviewSession.prNumber) {
				return item.prNumber === reviewSession.prNumber;
			}
			return item.prTitle === reviewSession.prTitle;
		});
		const dialogSource =
			reviewSession.source === "lyrics-site" ? "lyrics-site" : "github";
		const submissionId =
			reviewSession.source === "lyrics-site"
				? String(reviewSession.prNumber)
				: undefined;
		const autoReport = buildReviewReportFromDiffs(
			draftMatch?.report ? [draftMatch.report] : [],
			freezeData,
			stagedData,
		);
		const targetKey = reviewSession.prNumber
			? `pr:${reviewSession.prNumber}`
			: `title:${reviewSession.prTitle}`;
		const shouldCreateAutoDraft =
			!draftMatch && hasReviewReportContent(autoReport);
		const autoDraftId = shouldCreateAutoDraft
			? (autoReportDraftIdsRef.current[targetKey] ?? uid())
			: null;
		if (autoDraftId) {
			autoReportDraftIdsRef.current[targetKey] = autoDraftId;
		}

		setReviewReportDialog((prev: ReviewReportDialogState) => {
			const sameReportTarget =
				prev.prNumber === reviewSession.prNumber &&
				prev.prTitle === reviewSession.prTitle;
			// 用户可能正在处理另一份报告；此时不抢占已打开的对话框。
			if (prev.open && !sameReportTarget) return prev;

			const baseReports: ReviewReportInput[] = [];
			if (sameReportTarget) {
				baseReports.push(prev.report);
			} else if (draftMatch?.report) {
				baseReports.push(draftMatch.report);
			}
			const report = buildReviewReportFromDiffs(
				baseReports,
				freezeData,
				stagedData,
			);
			// 没有草稿、没有打开目标报告、也没有差异时，不创建一个空报告状态。
			if (!sameReportTarget && !draftMatch && !hasReviewReportContent(report)) {
				return prev;
			}

			const next: ReviewReportDialogState = {
				...prev,
				prNumber: reviewSession.prNumber,
				prTitle: reviewSession.prTitle,
				report,
				draftId: sameReportTarget
					? (prev.draftId ?? autoDraftId)
					: (draftMatch?.id ?? autoDraftId),
				source: dialogSource,
				submissionId,
			};
			if (
				prev.prNumber === next.prNumber &&
				prev.prTitle === next.prTitle &&
				prev.draftId === next.draftId &&
				prev.source === next.source &&
				prev.submissionId === next.submissionId &&
				renderReviewReport(prev.report) === renderReviewReport(next.report)
			) {
				return prev;
			}
			return next;
		});

		if (autoDraftId) {
			const createdAt = new Date().toISOString();
			setReviewReportDrafts((prev: ReviewReportDraft[]) => {
				const existingIndex = prev.findIndex(
					(item) =>
						item.id === autoDraftId ||
						(reviewSession.prNumber
							? item.prNumber === reviewSession.prNumber
							: item.prTitle === reviewSession.prTitle),
				);
				const nextDraft: ReviewReportDraft = {
					id: autoDraftId,
					prNumber: reviewSession.prNumber,
					prTitle: reviewSession.prTitle,
					report: autoReport,
					createdAt,
					source: dialogSource,
				};
				if (existingIndex >= 0) {
					const next = [...prev];
					next[existingIndex] = {
						...next[existingIndex],
						...nextDraft,
						createdAt: next[existingIndex].createdAt ?? createdAt,
					};
					return next;
				}
				return [nextDraft, ...prev];
			});
			const prLabel = reviewSession.prNumber
				? `PR#${reviewSession.prNumber}${
						reviewSession.prTitle ? ` ${reviewSession.prTitle}` : ""
					}`
				: "当前文件";
			setUpsertNotification({
				id: `review-report-draft-${autoDraftId}`,
				title: "审阅报告已自动生成",
				description: `点击打开 ${prLabel} 的审阅报告`,
				level: "info",
				source: "Review",
				pinned: true,
				dismissible: false,
				action: {
					type: "open-review-report",
					payload: { draftId: autoDraftId },
				},
			});
		}

		if (draftMatch) {
			setReviewReportDrafts((prev) => {
				let changed = false;
				const next = prev.map((draft) => {
					if (draft.id !== draftMatch.id) return draft;
					// 草稿里可能已有手写/时轴条目；报告服务会保留它们并替换旧的自动编辑差异。
					const report = buildReviewReportFromDiffs(
						[draft.report],
						freezeData,
						stagedData,
					);
					if (renderReviewReport(draft.report) === renderReviewReport(report)) {
						return draft;
					}
					changed = true;
					return { ...draft, report };
				});
				return changed ? next : prev;
			});
		}
	}, [
		lyricLines,
		reviewFreeze,
		reviewReportDrafts,
		reviewSession,
		reviewStaged,
		setReviewReportDialog,
		setReviewReportDrafts,
		setUpsertNotification,
	]);

	const onReviewComplete = useCallback(() => {
		const activeSession = reviewSession;
		if (activeSession) {
			const draftMatch = reviewReportDrafts.find((item) => {
				if (activeSession.prNumber) {
					return item.prNumber === activeSession.prNumber;
				}
				return item.prTitle === activeSession.prTitle;
			});
			const baseReports: ReviewReportInput[] = [];
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
				const mergedReport = buildReviewReportFromDiffs(
					baseReports,
					freezeData,
					stagedData,
					syncReport,
				);
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
					source:
						activeSession.source === "lyrics-site" ? "lyrics-site" : "github",
					submissionId:
						activeSession.source === "lyrics-site"
							? String(activeSession.prNumber)
							: undefined,
				});
				setTimingStashItems([]);
				setTimingStashOpen(false);
				setTimingCandidates([]);
				setTimingStashSelected(new Map());
			} else {
				const mergedReport = buildReviewReportFromDiffs(
					baseReports,
					freezeData,
					stagedData,
				);
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
					source:
						activeSession.source === "lyrics-site" ? "lyrics-site" : "github",
					submissionId:
						activeSession.source === "lyrics-site"
							? String(activeSession.prNumber)
							: undefined,
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
			const key = buildTimingStashItemKey(wordId, field);
			setTimingStashSelected((prev) => {
				const next = new Map(prev);
				if (next.get(key) === field) next.delete(key);
				else next.set(key, field);
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
			setReviewStashRemovedOrder(
				(prev: Record<string, Array<string | number>>) => {
					const existing = new Set(prev[stashKey] ?? []);
					TimingStashSelected.forEach((_field, key) => {
						existing.add(key);
					});
					return { ...prev, [stashKey]: Array.from(existing) };
				},
			);
		}
		setTimingStashItems((prev) =>
			prev.filter(
				(item) =>
					!TimingStashSelected.has(
						buildTimingStashItemKey(item.wordId, item.field),
					),
			),
		);
	}, [stashKey, setReviewStashRemovedOrder, TimingStashSelected]);

	const onClearStash = useCallback(() => {
		if (stashKey) {
			setReviewStashRemovedOrder(
				(prev: Record<string, Array<string | number>>) => {
					const existing = new Set(prev[stashKey] ?? []);
					TimingStashItems.forEach((item) => {
						existing.add(buildTimingStashItemKey(item.wordId, item.field));
					});
					return { ...prev, [stashKey]: Array.from(existing) };
				},
			);
		}
		setTimingStashItems([]);
		setTimingStashSelected(new Map());
	}, [stashKey, setReviewStashRemovedOrder, TimingStashItems]);

	const onSelectAllStash = useCallback(
		(field: "startTime" | "endTime") => {
			setTimingStashSelected(() => {
				const next = new Map<string, "startTime" | "endTime">();
				displayItems.forEach((item) => {
					if (item.field === field) {
						next.set(item.key, field);
					}
				});
				return next;
			});
		},
		[displayItems],
	);

	const onConfirmStash = useCallback(() => {
		const selected: TimingStashItem[] = [];
		TimingStashSelected.forEach((field, key) => {
			const [wordId] = key.split(":");
			selected.push({ wordId, field });
		});
		if (selected.length === 0) return;
		const freezeData = reviewFreeze?.data ?? lyricLines;
		const stagedData = reviewStaged ?? lyricLines;
		// 暂存对话框只决定哪些时轴项进入报告；编辑差异仍由统一报告构建器自动补齐。
		const syncReport = buildSyncReportFromStash(TimingCandidates, selected);
		const prNumber = reviewSession?.prNumber ?? null;
		const prTitle = reviewSession?.prTitle ?? "";
		const draftMatch = reviewReportDrafts.find((item) => {
			if (prNumber) return item.prNumber === prNumber;
			return item.prTitle === prTitle;
		});
		const baseReports: ReviewReportInput[] = [];
		if (reviewReportDialog.open && reviewReportDialog.prNumber === prNumber) {
			baseReports.push(reviewReportDialog.report);
		} else if (draftMatch?.report) {
			baseReports.push(draftMatch.report);
		}
		const mergedReport = buildReviewReportFromDiffs(
			baseReports,
			freezeData,
			stagedData,
			syncReport,
		);
		if (stashKey) {
			const committed = new Set(reviewStashSubmitted[stashKey] ?? []);
			for (const it of selected) {
				committed.add(buildTimingStashItemKey(it.wordId, it.field));
			}
			setReviewStashSubmitted((prev: Record<string, string[]>) => ({
				...prev,
				[stashKey]: Array.from(committed),
			}));
			setReviewStashLastSelection(
				(prev: Record<string, Array<[string, "startTime" | "endTime"]>>) => ({
					...prev,
					[stashKey]: Array.from(TimingStashSelected.entries()),
				}),
			);
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
			source:
				reviewSession?.source === "lyrics-site"
					? "lyrics-site"
					: reviewSession?.source
						? "github"
						: undefined,
			submissionId:
				reviewSession?.source === "lyrics-site" ? String(prNumber) : undefined,
		});
		setTimingStashItems([]);
		setTimingStashSelected(new Map());
		setTimingStashOpen(false);
	}, [
		reviewReportDialog,
		reviewReportDrafts,
		reviewFreeze,
		reviewSession,
		reviewStashSubmitted,
		reviewStaged,
		lyricLines,
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
