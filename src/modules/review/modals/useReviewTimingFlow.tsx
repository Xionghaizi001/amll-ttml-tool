import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { uid } from "uid";
import { ReviewActionGroup } from "$/components/TitleBar/modals/ReviewActionGroup";
import { useFileOpener } from "$/hooks/useFileOpener";
import { NeteaseIdSelectDialog } from "$/modules/ncm/modals/NeteaseIdSelectDialog";
import { useNcmAudioSwitch } from "$/modules/review/services/audio-switch";
import {
	buildReviewReportFromOperationReplay,
	getReviewReplayBase,
} from "$/modules/review/services/report-service/flow-service";
import {
	hasReviewReportContent,
	renderReviewReport,
} from "$/modules/review/services/report-service/render-service";
import type { ReviewReportInput } from "$/modules/review/services/report-service/types";
import {
	buildLineTimingChanges,
	buildSyncChanges,
	buildSyncReport,
} from "$/modules/review/services/report-service/sync-report-builder";
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
	reviewOperationLogAtom,
	reviewReportDraftsAtom,
	reviewSessionAtom,
	ToolMode,
	toolModeAtom,
} from "$/states/main";
import {
	pushNotificationAtom,
	upsertNotificationAtom,
} from "$/states/notifications";
import type { TTMLLyric } from "$/types/ttml";
import { AudioSourceSelectDialog } from "./AudioSourceSelectDialog";

const openReviewReportDialogAfterFocusRelease = (
	setReviewReportDialog: (value: ReviewReportDialogState) => void,
	state: ReviewReportDialogState,
) => {
	// 从一个 Radix modal 切到另一个 modal 时先让当前 FocusScope 完成卸载和焦点归还。
	// 否则两个焦点管理器在同一批更新里交接，偶发触发 compose-refs 的嵌套更新循环。
	window.setTimeout(() => {
		setReviewReportDialog(state);
	}, 0);
};

export const useReviewTimingFlow = () => {
	const [toolMode, setToolMode] = useAtom(toolModeAtom);
	const reviewSession = useAtomValue(reviewSessionAtom);
	const setReviewSession = useSetAtom(reviewSessionAtom);
	const lyricLines = useAtomValue(lyricLinesAtom);
	const reviewFreeze = useAtomValue(reviewFreezeAtom);
	const reviewOperationLog = useAtomValue(reviewOperationLogAtom);
	const reviewReportDialog = useAtomValue(reviewReportDialogAtom);
	const reviewReportDrafts = useAtomValue(reviewReportDraftsAtom);
	const setReviewReportDrafts = useSetAtom(reviewReportDraftsAtom);
	const setReviewReportDialog = useSetAtom(reviewReportDialogAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const setUpsertNotification = useSetAtom(upsertNotificationAtom);
	const pat = useAtomValue(githubPatAtom);
	const canReview = useAtomValue(githubAmlldbAccessAtom);
	const neteaseCookie = useAtomValue(neteaseCookieAtom);
	const { openFile } = useFileOpener();
	const autoReportDraftIdsRef = useRef<Record<string, string>>({});
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
		if (!reviewSession || !reviewFreeze) return;
		if (reviewSession.source === "update") return;

		const freezeData = reviewFreeze.data;
		const stagedData = lyricLines;
		const draftMatch = reviewReportDrafts.find((item) => {
			if (reviewSession.prNumber)
				return item.prNumber === reviewSession.prNumber;
			return item.prTitle === reviewSession.prTitle;
		});
		const sameReportTarget =
			reviewReportDialog.prNumber === reviewSession.prNumber &&
			reviewReportDialog.prTitle === reviewSession.prTitle;
		const openSameReportTarget = reviewReportDialog.open && sameReportTarget;
		const baseReports: ReviewReportInput[] = [];
		if (openSameReportTarget) {
			baseReports.push(reviewReportDialog.report);
		} else if (draftMatch?.report) {
			baseReports.push(draftMatch.report);
		}
		const report = buildReviewReportFromOperationReplay(
			baseReports,
			freezeData,
			stagedData,
			reviewOperationLog,
		);
		const hasContent = hasReviewReportContent(report);
		if (!hasContent && !draftMatch && !openSameReportTarget) return;

		const targetKey = reviewSession.prNumber
			? `pr:${reviewSession.prNumber}`
			: `title:${reviewSession.prTitle}`;
		const autoDraftId =
			draftMatch?.id ??
			(openSameReportTarget ? reviewReportDialog.draftId : null) ??
			autoReportDraftIdsRef.current[targetKey] ??
			uid();
		autoReportDraftIdsRef.current[targetKey] = autoDraftId;
		const dialogSource =
			reviewSession.source === "lyrics-site" ? "lyrics-site" : "github";
		const submissionId =
			reviewSession.source === "lyrics-site"
				? String(reviewSession.prNumber)
				: undefined;

		if (openSameReportTarget) {
			setReviewReportDialog((prev: ReviewReportDialogState) => {
				const prevSameTarget =
					prev.prNumber === reviewSession.prNumber &&
					prev.prTitle === reviewSession.prTitle;
				if (!prev.open || !prevSameTarget) return prev;
				const next: ReviewReportDialogState = {
					...prev,
					prNumber: reviewSession.prNumber,
					prTitle: reviewSession.prTitle,
					report,
					draftId: autoDraftId,
					source: dialogSource,
					submissionId,
				};
				if (
					prev.draftId === next.draftId &&
					prev.source === next.source &&
					prev.submissionId === next.submissionId &&
					renderReviewReport(prev.report) === renderReviewReport(next.report)
				) {
					return prev;
				}
				return next;
			});
		}

		if (!hasContent) return;
		const shouldNotifyDraft = !reviewReportDrafts.some(
			(item) =>
				item.id === autoDraftId ||
				(reviewSession.prNumber
					? item.prNumber === reviewSession.prNumber
					: item.prTitle === reviewSession.prTitle),
		);
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
				report,
				createdAt,
				source: dialogSource,
			};
			if (existingIndex >= 0) {
				const prevDraft = prev[existingIndex];
				if (
					prevDraft.id === nextDraft.id &&
					prevDraft.prNumber === nextDraft.prNumber &&
					prevDraft.prTitle === nextDraft.prTitle &&
					prevDraft.source === nextDraft.source &&
					renderReviewReport(prevDraft.report) ===
						renderReviewReport(nextDraft.report)
				) {
					return prev;
				}

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
		if (!shouldNotifyDraft) return;
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
	}, [
		lyricLines,
		reviewFreeze,
		reviewOperationLog,
		reviewReportDialog,
		reviewReportDrafts,
		reviewSession,
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
			const stagedData = lyricLines;
			if (activeSession.source === "update") {
				requestUpdatePush(activeSession, stagedData);
				return;
			}
			if (toolMode === ToolMode.Sync) {
				const replayBase = getReviewReplayBase(freezeData, reviewOperationLog);
				const candidates = buildSyncChanges(replayBase, stagedData);
				const lineTimingCandidates = buildLineTimingChanges(
					replayBase,
					stagedData,
				);
				const syncReport = buildSyncReport(candidates, lineTimingCandidates);
				const mergedReport = buildReviewReportFromOperationReplay(
					baseReports,
					freezeData,
					stagedData,
					reviewOperationLog,
					syncReport,
				);
				openReviewReportDialogAfterFocusRelease(setReviewReportDialog, {
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
			} else {
				const mergedReport = buildReviewReportFromOperationReplay(
					baseReports,
					freezeData,
					stagedData,
					reviewOperationLog,
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
		reviewOperationLog,
		reviewReportDialog,
		reviewReportDrafts,
		reviewSession,
		setReviewReportDialog,
		setReviewSession,
		setToolMode,
		toolMode,
	]);

	const onReviewCancel = useCallback(() => {
		setReviewSession(null);
	}, [setReviewSession]);

	const dialogs = (
		<>
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
		onReviewComplete,
		onReviewCancel,
		onSwitchAudio,
		switchAudioEnabled,
		canReview,
	} = useReviewTimingFlow();

	const actionGroup = reviewSession ? (
		<ReviewActionGroup
			className={options?.actionGroupClassName}
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
