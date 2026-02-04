import {
	AddCircle20Regular,
	Checkmark20Regular,
	Dismiss20Regular,
} from "@fluentui/react-icons";
import { Box, Button, Dialog, Flex, Text } from "@radix-ui/themes";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { reviewReportDialogAtom } from "$/states/dialogs";
import {
	lyricLinesAtom,
	reviewFreezeAtom,
	reviewSessionAtom,
	reviewStagedAtom,
	selectedWordsAtom,
	ToolMode,
	toolModeAtom,
} from "$/states/main";
import type { LyricLine, LyricWord, TTMLLyric } from "$/types/ttml";

type WordChange = {
	lineNumber: number;
	oldWord: string;
	newWord: string;
	oldRoman: string;
	newRoman: string;
};

type LineChange = {
	lineNumber: number;
	oldTrans: string;
	newTrans: string;
	oldRoman: string;
	newRoman: string;
};

type SyncChangeCandidate = {
	wordId: string;
	lineNumber: number;
	word: string;
	oldStart: number;
	newStart: number;
	oldEnd: number;
	newEnd: number;
};

type TimeAxisStashItem = {
	wordId: string;
	field: "startTime" | "endTime";
};

const computeDisplayNumbers = (lines: LyricLine[]) => {
	let current = 0;
	const map = new Map<string, number>();
	lines.forEach((line, index) => {
		if (index === 0 || !line.isBG) {
			current += 1;
		}
		map.set(line.id, current);
	});
	return map;
};

const buildLineMap = (lines: LyricLine[]) => {
	const map = new Map<string, LyricLine>();
	lines.forEach((line) => {
		map.set(line.id, line);
	});
	return map;
};

const buildWordMap = (words: LyricWord[]) => {
	const map = new Map<string, LyricWord>();
	words.forEach((word) => {
		map.set(word.id, word);
	});
	return map;
};

const getLineNumber = (
	line: LyricLine,
	index: number,
	primary: Map<string, number>,
	fallback?: Map<string, number>,
) => {
	return primary.get(line.id) ?? fallback?.get(line.id) ?? index + 1;
};

const formatReport = (items: string[]) => {
	if (items.length === 0) return "未检测到差异。";
	return items.map((line) => `- ${line}`).join("\n");
};

const wrap = (value: string | number) => `\`${value}\``;

const normalizeReport = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed || trimmed === "未检测到差异。") return "";
	return trimmed;
};

const mergeReports = (reports: string[]) => {
	const parts = reports.map(normalizeReport).filter(Boolean);
	if (parts.length === 0) return "未检测到差异。";
	return parts.join("\n\n");
};

const buildEditReport = (freeze: TTMLLyric, staged: TTMLLyric) => {
	const stagedLineMap = buildLineMap(staged.lyricLines);
	const freezeDisplayMap = computeDisplayNumbers(freeze.lyricLines);
	const stagedDisplayMap = computeDisplayNumbers(staged.lyricLines);
	const wordTextChanges: WordChange[] = [];
	const wordAndRomanChanges: WordChange[] = [];
	const romanOnlyChanges: WordChange[] = [];
	const lineChanges: LineChange[] = [];

	freeze.lyricLines.forEach((freezeLine, index) => {
		const stagedLine = stagedLineMap.get(freezeLine.id) ?? staged.lyricLines[index];
		if (!stagedLine) return;
		const lineNumber = getLineNumber(
			freezeLine,
			index,
			freezeDisplayMap,
			stagedDisplayMap,
		);
		const oldTrans = freezeLine.translatedLyric ?? "";
		const newTrans = stagedLine.translatedLyric ?? "";
		const oldLineRoman = freezeLine.romanLyric ?? "";
		const newLineRoman = stagedLine.romanLyric ?? "";
		if (oldTrans !== newTrans || oldLineRoman !== newLineRoman) {
			lineChanges.push({
				lineNumber,
				oldTrans,
				newTrans,
				oldRoman: oldLineRoman,
				newRoman: newLineRoman,
			});
		}
		const stagedWordMap = buildWordMap(stagedLine.words);
		freezeLine.words.forEach((freezeWord, wordIndex) => {
			const stagedWord =
				stagedWordMap.get(freezeWord.id) ?? stagedLine.words[wordIndex];
			if (!stagedWord) return;
			const oldWord = freezeWord.word ?? "";
			const newWord = stagedWord.word ?? "";
			const oldRoman = freezeWord.romanWord ?? "";
			const newRoman = stagedWord.romanWord ?? "";
			if (oldWord !== newWord && oldRoman !== newRoman) {
				wordAndRomanChanges.push({
					lineNumber,
					oldWord,
					newWord,
					oldRoman,
					newRoman,
				});
			} else if (oldWord !== newWord) {
				wordTextChanges.push({
					lineNumber,
					oldWord,
					newWord,
					oldRoman,
					newRoman,
				});
			} else if (oldRoman !== newRoman) {
				romanOnlyChanges.push({
					lineNumber,
					oldWord,
					newWord,
					oldRoman,
					newRoman,
				});
			}
		});
	});

	const reportLines: string[] = [];
	const groupedByWord = new Map<string, WordChange[]>();
	wordTextChanges.forEach((change) => {
		const key = `${change.oldWord}=>${change.newWord}`;
		const list = groupedByWord.get(key) ?? [];
		list.push(change);
		groupedByWord.set(key, list);
	});
	const consumed = new Set<WordChange>();
	for (const group of groupedByWord.values()) {
		const lineNumbers = Array.from(new Set(group.map((item) => item.lineNumber)));
		if (lineNumbers.length <= 1) continue;
		lineNumbers.sort((a, b) => a - b);
		const sample = group[0];
		reportLines.push(
			`第 ${lineNumbers.join("、")} 行：${wrap(sample.oldWord)} 存在错误，应为 ${wrap(
				sample.newWord,
			)}`,
		);
		group.forEach((item) => {
			consumed.add(item);
		});
	}

	const remainingWordChanges = wordTextChanges.filter((item) => !consumed.has(item));
	const groupByLine = new Map<number, WordChange[]>();
	remainingWordChanges.forEach((item) => {
		const list = groupByLine.get(item.lineNumber) ?? [];
		list.push(item);
		groupByLine.set(item.lineNumber, list);
	});
	const lineNumbers = Array.from(groupByLine.keys()).sort((a, b) => a - b);
	lineNumbers.forEach((lineNumber) => {
		const list = groupByLine.get(lineNumber) ?? [];
		if (list.length <= 1) return;
		const oldWords = list.map((item) => item.oldWord);
		const newWords = list.map((item) => item.newWord);
		reportLines.push(
			`第 ${lineNumber} 行：${oldWords.map(wrap).join("、")} 分别存在错误，应为 ${newWords
				.map(wrap)
				.join("、")}`,
		);
		list.forEach((item) => {
			consumed.add(item);
		});
	});

	const singleWordChanges = remainingWordChanges.filter((item) => !consumed.has(item));
	singleWordChanges
		.sort((a, b) => a.lineNumber - b.lineNumber)
		.forEach((item) => {
			reportLines.push(
				`第 ${item.lineNumber} 行：${wrap(item.oldWord)} 存在错误，应为 ${wrap(
					item.newWord,
				)}`,
			);
		});

	romanOnlyChanges
		.sort((a, b) => a.lineNumber - b.lineNumber)
		.forEach((item) => {
			reportLines.push(
				`第 ${item.lineNumber} 行：${wrap(item.oldWord)} 音译 ${wrap(
					item.oldRoman,
				)} 存在错误，应为 ${wrap(item.newRoman)}`,
			);
		});

	lineChanges
		.sort((a, b) => a.lineNumber - b.lineNumber)
		.forEach((item) => {
			const parts: string[] = [];
			if (item.oldTrans !== item.newTrans) {
				parts.push(
					`翻译 ${wrap(item.oldTrans)} 存在错误，应为 ${wrap(item.newTrans)}`,
				);
			}
			if (item.oldRoman !== item.newRoman) {
				parts.push(
					`音译 ${wrap(item.oldRoman)} 存在错误，应为 ${wrap(item.newRoman)}`,
				);
			}
			if (parts.length > 0) {
				reportLines.push(`第 ${item.lineNumber} 行：${parts.join("，")}`);
			}
		});

	wordAndRomanChanges
		.sort((a, b) => a.lineNumber - b.lineNumber)
		.forEach((item) => {
			const parts = [
				`${wrap(item.oldWord)} 存在错误，应为 ${wrap(item.newWord)}`,
				`音译 ${wrap(item.oldRoman)} 存在错误，应为 ${wrap(item.newRoman)}`,
			];
			reportLines.push(`第 ${item.lineNumber} 行：${parts.join("，")}`);
		});

	return formatReport(reportLines);
};

const buildSyncChanges = (freeze: TTMLLyric, staged: TTMLLyric) => {
	const stagedLineMap = buildLineMap(staged.lyricLines);
	const freezeDisplayMap = computeDisplayNumbers(freeze.lyricLines);
	const stagedDisplayMap = computeDisplayNumbers(staged.lyricLines);
	const reportLines: SyncChangeCandidate[] = [];

	freeze.lyricLines.forEach((freezeLine, index) => {
		const stagedLine = stagedLineMap.get(freezeLine.id) ?? staged.lyricLines[index];
		if (!stagedLine) return;
		const lineNumber = getLineNumber(
			freezeLine,
			index,
			freezeDisplayMap,
			stagedDisplayMap,
		);
		const stagedWordMap = buildWordMap(stagedLine.words);
		freezeLine.words.forEach((freezeWord, wordIndex) => {
			const stagedWord =
				stagedWordMap.get(freezeWord.id) ?? stagedLine.words[wordIndex];
			if (!stagedWord) return;
			const oldStart = Math.round(freezeWord.startTime);
			const newStart = Math.round(stagedWord.startTime);
			const oldEnd = Math.round(freezeWord.endTime);
			const newEnd = Math.round(stagedWord.endTime);
			if (oldStart === newStart && oldEnd === newEnd) return;
			reportLines.push({
				wordId: freezeWord.id,
				lineNumber,
				word: freezeWord.word || "（空白）",
				oldStart,
				newStart,
				oldEnd,
				newEnd,
			});
		});
	});

	return reportLines;
};

const buildSyncReport = (reportLines: SyncChangeCandidate[]) => {
	const sentences = reportLines
		.sort((a, b) => a.lineNumber - b.lineNumber)
		.map((item) => {
			const startDelta = item.newStart - item.oldStart;
			const endDelta = item.newEnd - item.oldEnd;
			const delta = startDelta !== 0 ? startDelta : endDelta;
			const speed = delta < 0 ? "快" : "慢";
			return `第 ${item.lineNumber} 行：${wrap(item.word)} 偏${speed}了 ${wrap(
				Math.abs(delta),
			)} 毫秒`;
		})
		.filter((item): item is string => Boolean(item));

	return formatReport(sentences);
};

const buildSyncReportFromStash = (
	candidates: SyncChangeCandidate[],
	stash: TimeAxisStashItem[],
) => {
	const candidateMap = new Map<string, SyncChangeCandidate>();
	for (const item of candidates) {
		candidateMap.set(item.wordId, item);
	}
	const items = stash
		.map((stashItem) => {
			const candidate = candidateMap.get(stashItem.wordId);
			if (!candidate) return null;
			const delta =
				stashItem.field === "startTime"
					? candidate.newStart - candidate.oldStart
					: candidate.newEnd - candidate.oldEnd;
			if (delta === 0) return null;
			const speed = delta < 0 ? "快" : "慢";
			return {
				lineNumber: candidate.lineNumber,
				text: `第 ${candidate.lineNumber} 行：${wrap(candidate.word)} 偏${speed}了 ${wrap(
					Math.abs(delta),
				)} 毫秒`,
			};
		})
		.filter(
			(
				item,
			): item is {
				lineNumber: number;
				text: string;
			} => Boolean(item),
		)
		.sort((a, b) => a.lineNumber - b.lineNumber);
	return formatReport(items.map((item) => item.text));
};

export const useReviewTimeAxisFlow = () => {
	const [toolMode, setToolMode] = useAtom(toolModeAtom);
	const reviewSession = useAtomValue(reviewSessionAtom);
	const setReviewSession = useSetAtom(reviewSessionAtom);
	const lyricLines = useAtomValue(lyricLinesAtom);
	const reviewFreeze = useAtomValue(reviewFreezeAtom);
	const reviewStaged = useAtomValue(reviewStagedAtom);
	const setReviewReportDialog = useSetAtom(reviewReportDialogAtom);
	const setSelectedWords = useSetImmerAtom(selectedWordsAtom);
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
		if (!timeAxisStashOpen) return;
		setTimeAxisStashSelected(new Set());
	}, [timeAxisStashOpen]);

	useEffect(() => {
		if (!reviewSession || toolMode !== ToolMode.Sync || !reviewFreeze) {
			setTimeAxisCandidates([]);
			setTimeAxisStashItems([]);
			return;
		}
		const freezeData = reviewFreeze.data;
		const stagedData = reviewStaged ?? lyricLines;
		const candidates = buildSyncChanges(freezeData, stagedData);
		setTimeAxisCandidates(candidates);
		const nextStash: TimeAxisStashItem[] = [];
		for (const candidate of candidates) {
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
	}, [lyricLines, reviewFreeze, reviewSession, reviewStaged, toolMode]);

	const onReviewComplete = useCallback(() => {
		if (reviewSession) {
			const freezeData = reviewFreeze?.data ?? lyricLines;
			const stagedData = reviewStaged ?? lyricLines;
			const editReport = buildEditReport(freezeData, stagedData);
			if (toolMode === ToolMode.Sync) {
				const candidates = buildSyncChanges(freezeData, stagedData);
				const syncReport =
					timeAxisStashItems.length > 0
						? buildSyncReportFromStash(candidates, timeAxisStashItems)
						: buildSyncReport(candidates);
				const report = mergeReports([editReport, syncReport]);
				setReviewReportDialog({
					open: true,
					prNumber: reviewSession.prNumber,
					prTitle: reviewSession.prTitle,
					report,
					draftId: null,
				});
				setTimeAxisStashItems([]);
				setTimeAxisStashOpen(false);
				setTimeAxisCandidates([]);
				setTimeAxisStashSelected(new Set());
			} else {
				const report = editReport;
				setReviewReportDialog({
					open: true,
					prNumber: reviewSession.prNumber,
					prTitle: reviewSession.prTitle,
					report,
					draftId: null,
				});
			}
		}
		setReviewSession(null);
		setToolMode(ToolMode.Review);
	}, [
		lyricLines,
		reviewFreeze,
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
								setReviewReportDialog({
									open: true,
									prNumber: reviewSession?.prNumber ?? null,
									prTitle: reviewSession?.prTitle ?? "",
									report,
									draftId: null,
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

	const actionGroup = reviewSession ? (
		<Flex align="center" gap="1" className={options?.actionGroupClassName}>
			<Button size="1" variant="solid" color="orange" onClick={openTimeAxisStash}>
				<Flex align="center" gap="1">
					<AddCircle20Regular />
					<Text size="1">暂存</Text>
				</Flex>
			</Button>
			<Button size="1" variant="soft" color="green" onClick={onReviewComplete}>
				<Flex align="center" gap="1">
					<Checkmark20Regular />
					<Text size="1">完成</Text>
				</Flex>
			</Button>
			<Button size="1" variant="soft" color="red" onClick={onReviewCancel}>
				<Flex align="center" gap="1">
					<Dismiss20Regular />
					<Text size="1">取消</Text>
				</Flex>
			</Button>
		</Flex>
	) : null;

	return {
		dialogs,
		actionGroup,
		reviewSession,
	};
};
