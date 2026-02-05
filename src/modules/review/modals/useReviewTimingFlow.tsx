import { Box, Button, Dialog, Flex, Text } from "@radix-ui/themes";
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
	reviewStashSubmittedAtom,
	selectedWordsAtom,
	ToolMode,
	toolModeAtom,
} from "$/states/main";
import { githubAmlldbAccessAtom, githubPatAtom } from "$/modules/settings/states";
import { pushNotificationAtom } from "$/states/notifications";
import type { TTMLLyric } from "$/types/ttml";
import { requestFileUpdatePush } from "$/modules/github/services/update-service";
import { ReviewActionGroup } from "$/modules/review/modals/ReviewActionGroup";
import {
	buildEditReport,
	buildSyncChanges,
	buildSyncReport,
	buildSyncReportFromStash,
	mergeReports,
	type SyncChangeCandidate,
	type TimeAxisStashItem,
} from "$/modules/review/services/report-service";

export const useReviewTimeAxisFlow = () => {
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
	const setReviewReportDialog = useSetAtom(reviewReportDialogAtom);
	const setSelectedWords = useSetImmerAtom(selectedWordsAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const pat = useAtomValue(githubPatAtom);
	const canReview = useAtomValue(githubAmlldbAccessAtom);
	const { t } = useTranslation();
	const [timeAxisCandidates, setTimeAxisCandidates] = useState<SyncChangeCandidate[]>(
		[],
	);
	const [timeAxisStashOpen, setTimeAxisStashOpen] = useState(false);
	const [timeAxisStashItems, setTimeAxisStashItems] = useState<TimeAxisStashItem[]>(
		[],
	);
	const [timeAxisStashSelected, setTimeAxisStashSelected] = useState<Set<string>>(
		new Set(),
	);

	const timeAxisCandidateMap = useMemo(() => {
		const map = new Map<string, SyncChangeCandidate>();
		timeAxisCandidates.forEach((item) => {
			map.set(item.wordId, item);
		});
		return map;
	}, [timeAxisCandidates]);

	const timeAxisStashGroups = useMemo(() => {
		const grouped = new Map<
			number,
			Array<{ label: string; field: string; wordId: string }>
		>();
		timeAxisStashItems.forEach((stashItem) => {
			const candidate = timeAxisCandidateMap.get(stashItem.wordId);
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
	}, [timeAxisCandidateMap, timeAxisStashItems]);

	const timeAxisOrderMap = useMemo(() => {
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
		for (const [lineNumber, groupItems] of timeAxisStashGroups) {
			for (const gi of groupItems) {
				items.push({
					lineNumber,
					wordId: gi.wordId,
					label: gi.label,
					orderIndex: timeAxisOrderMap.get(gi.wordId) ?? Number.MAX_SAFE_INTEGER,
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
	}, [timeAxisOrderMap, timeAxisStashGroups]);

	const timeAxisStashCards = useMemo(() => {
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
		if (!stashKey || !timeAxisStashOpen) return;
		const lastSelection = reviewStashLastSelection[stashKey] ?? [];
		if (lastSelection.length === 0) return;
		setTimeAxisStashSelected((prev) => {
			if (
				prev.size === lastSelection.length &&
				lastSelection.every((id) => prev.has(id))
			) {
				return prev;
			}
			return new Set(lastSelection);
		});
	}, [reviewStashLastSelection, stashKey, timeAxisStashOpen]);

	useEffect(() => {
		if (!reviewSession || !reviewFreeze) {
			setTimeAxisCandidates([]);
			setTimeAxisStashItems([]);
			setTimeAxisStashSelected(new Set());
			return;
		}
		const freezeData = reviewFreeze.data;
		const stagedData = reviewStaged ?? lyricLines;
		const candidates = buildSyncChanges(freezeData, stagedData);
		setTimeAxisCandidates(candidates);
		const submittedSet = new Set(
			stashKey ? reviewStashSubmitted[stashKey] ?? [] : [],
		);
		const nextStash: TimeAxisStashItem[] = [];
		for (const candidate of candidates) {
			if (submittedSet.has(candidate.wordId)) continue;
			const startDelta = candidate.newStart - candidate.oldStart;
			const endDelta = candidate.newEnd - candidate.oldEnd;
			if (startDelta !== 0) {
				nextStash.push({ wordId: candidate.wordId, field: "startTime" });
			}
			if (endDelta !== 0) {
				nextStash.push({ wordId: candidate.wordId, field: "endTime" });
			}
		}
		setTimeAxisStashItems(nextStash);
	}, [
		lyricLines,
		reviewFreeze,
		reviewSession,
		reviewStaged,
		reviewStashSubmitted,
		stashKey,
	]);

	useEffect(() => {
		if (!stashKey || !timeAxisStashOpen) return;
		if (!timeAxisStashSelected.size) return;
		setReviewStashLastSelection((prev) => ({
			...prev,
			[stashKey]: Array.from(timeAxisStashSelected),
		}));
	}, [
		setReviewStashLastSelection,
		stashKey,
		timeAxisStashOpen,
		timeAxisStashSelected,
	]);

	useEffect(() => {
		const available = new Set(timeAxisStashItems.map((item) => item.wordId));
		setTimeAxisStashSelected((prev) => {
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
	}, [timeAxisStashItems]);

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
					setTimeAxisStashItems([]);
					setTimeAxisStashOpen(false);
					setTimeAxisCandidates([]);
					setTimeAxisStashSelected(new Set());
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
					timeAxisStashItems.length > 0
						? buildSyncReportFromStash(candidates, timeAxisStashItems)
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
				setTimeAxisStashItems([]);
				setTimeAxisStashOpen(false);
				setTimeAxisCandidates([]);
				setTimeAxisStashSelected(new Set());
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
		timeAxisStashItems,
		toolMode,
	]);

	const onReviewCancel = useCallback(() => {
		setReviewSession(null);
		setTimeAxisStashItems([]);
		setTimeAxisStashOpen(false);
		setTimeAxisCandidates([]);
	}, [setReviewSession]);

	const openTimeAxisStash = useCallback(() => {
		setTimeAxisStashOpen(true);
	}, []);

	const dialogs = (
		<>
			<Dialog.Root open={timeAxisStashOpen} onOpenChange={setTimeAxisStashOpen}>
				<Dialog.Content maxWidth="520px">
					<Dialog.Title>
						{t("review.timeAxisStash.title", "暂存时间轴结果")}
					</Dialog.Title>
					<Flex direction="row" gap="3" align="start" wrap="wrap">
						{timeAxisStashGroups.length === 0 ? (
							<Text size="2" color="gray">
								{t("review.timeAxisStash.empty", "暂无暂存结果")}
							</Text>
						) : (
							timeAxisStashCards.map((card) => {
								const key = card.items.map((item) => item.wordId).join("-");
								const hasCrossLine = Boolean(card.lines[1]);
								return (
									<Box
										key={key}
										style={{
											display: "inline-grid",
											gridTemplateColumns: hasCrossLine
												? "max-content max-content max-content"
												: "max-content",
											rowGap: "6px",
											columnGap: "6px",
											borderRadius: "12px",
											border: "1px solid var(--gray-a6)",
											padding: "10px 12px",
											backgroundColor: "var(--gray-a2)",
										}}
									>
										{hasCrossLine ? (
											<>
												<Text
													size="2"
													weight="bold"
													style={{ gridColumn: "1 / 2", justifySelf: "center" }}
												>
													{`第 ${card.lines[0]} 行`}
												</Text>
												<Text
													size="2"
													color="gray"
													style={{ gridColumn: "2 / 3", justifySelf: "center" }}
												>
													|
												</Text>
												<Text
													size="2"
													color="gray"
													style={{ gridColumn: "3 / 4", justifySelf: "center" }}
												>
													{`第 ${card.lines[1]} 行`}
												</Text>
											</>
										) : (
											<Text
												size="2"
												weight="bold"
												style={{ gridColumn: "1 / -1", justifySelf: "center" }}
											>
												{`第 ${card.lines[0]} 行`}
											</Text>
										)}
										<Flex
											align="center"
											wrap="wrap"
											gap="1"
											style={{
												gridColumn: hasCrossLine ? "1 / 2" : "1 / -1",
												justifySelf: "center",
											}}
										>
											{card.items.map((item, index) => {
												const checked = timeAxisStashSelected.has(item.wordId);
												return (
													<Flex key={`${item.wordId}-${index}`} align="center" gap="1">
														<Button
															size="1"
															variant={checked ? "solid" : "soft"}
															color={checked ? "orange" : "gray"}
															onClick={() => {
																setTimeAxisStashSelected((prev) => {
																	const next = new Set(prev);
																	if (next.has(item.wordId)) next.delete(item.wordId);
																	else next.add(item.wordId);
																	return next;
																});
																setSelectedWords((o) => {
																	o.clear();
																	o.add(item.wordId);
																});
															}}
															asChild
														>
															<span>{item.label}</span>
														</Button>
														{index < card.items.length - 1 ? (
															<Text size="2" color="gray" asChild>
																<span
																	style={{
																		display: "inline-flex",
																		alignItems: "center",
																	}}
																>
																	|
																</span>
															</Text>
														) : null}
													</Flex>
												);
											})}
										</Flex>
									</Box>
								);
							})
						)}
					</Flex>
					<Flex gap="3" mt="4" justify="end">
						<Button
							variant="soft"
							color="gray"
							onClick={() => setTimeAxisStashOpen(false)}
						>
							{t("common.close", "关闭")}
						</Button>
						<Button
							variant="soft"
							color="red"
							onClick={() => {
								setTimeAxisStashItems((prev) =>
									prev.filter(
										(item) => !timeAxisStashSelected.has(item.wordId),
									),
								);
							}}
							disabled={timeAxisStashSelected.size === 0}
						>
							{t("review.timeAxisStash.removeSelected", "删除选中")}
						</Button>
						<Button
							variant="soft"
							color="orange"
							onClick={() => {
								setTimeAxisStashItems([]);
								setTimeAxisStashSelected(new Set());
							}}
							disabled={timeAxisStashItems.length === 0}
						>
							{t("review.timeAxisStash.clear", "清空")}
						</Button>
						<Button
							onClick={() => {
								const selected = timeAxisStashItems.filter((item) =>
									timeAxisStashSelected.has(item.wordId),
								);
								if (selected.length === 0) return;
								const report = buildSyncReportFromStash(
									timeAxisCandidates,
									selected,
								);
								const prNumber = reviewSession?.prNumber ?? null;
								const prTitle = reviewSession?.prTitle ?? "";
								const draftMatch = reviewReportDrafts.find((item) => {
									if (prNumber) return item.prNumber === prNumber;
									return item.prTitle === prTitle;
								});
								const baseReports: string[] = [];
								if (
									reviewReportDialog.open &&
									reviewReportDialog.prNumber === prNumber
								) {
									baseReports.push(reviewReportDialog.report);
								} else if (draftMatch?.report) {
									baseReports.push(draftMatch.report);
								}
								const mergedReport = mergeReports([...baseReports, report]);
								if (stashKey) {
									const committed = new Set(
										reviewStashSubmitted[stashKey] ?? [],
									);
									for (const it of selected) {
										committed.add(it.wordId);
									}
									setReviewStashSubmitted((prev) => ({
										...prev,
										[stashKey]: Array.from(committed),
									}));
									setReviewStashLastSelection((prev) => ({
										...prev,
										[stashKey]: Array.from(timeAxisStashSelected),
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
								setTimeAxisStashItems([]);
								setTimeAxisStashSelected(new Set());
								setTimeAxisStashOpen(false);
							}}
							disabled={timeAxisStashSelected.size === 0}
						>
							{t("common.confirm", "确认")}
						</Button>
					</Flex>
				</Dialog.Content>
			</Dialog.Root>
		</>
	);

	return {
		dialogs,
		openTimeAxisStash,
		onReviewCancel,
		onReviewComplete,
	};
};

export const useReviewTitleBar = (options?: {
	actionGroupClassName?: string;
}) => {
	const reviewSession = useAtomValue(reviewSessionAtom);
	const { dialogs, openTimeAxisStash, onReviewComplete, onReviewCancel } =
		useReviewTimeAxisFlow();

	const showStash = reviewSession?.source !== "update";
	const actionGroup = reviewSession ? (
		<ReviewActionGroup
			className={options?.actionGroupClassName}
			showStash={showStash}
			onOpenStash={openTimeAxisStash}
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
