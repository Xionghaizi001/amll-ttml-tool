import { Delete20Regular } from "@fluentui/react-icons";
import {
	Box,
	Button,
	Checkbox,
	Dialog,
	Flex,
	Tabs,
	Text,
	TextArea,
} from "@radix-ui/themes";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { uid } from "uid";
import {
	type ReviewReportFormat,
	reviewReportFormatAtom,
} from "$/modules/review/services/report-format-service";
import {
	createManualReviewReport,
	createReviewReport,
	DEFAULT_REVIEW_REPORT_TEXT,
	getReviewReportBlockText,
	hasReviewReportContent,
	normalizeReviewReport,
	type ReviewReportBlock,
	renderReviewReport,
} from "$/modules/review/services/report-service";
import { ReviewTemplateSection } from "$/modules/review/services/review-template-service";
import { ReviewReportSubmissionBar } from "$/modules/review/services/submission-service";
import {
	type ReviewReportDialogState,
	reviewReportDialogAtom,
} from "$/states/dialogs";
import { type ReviewReportDraft, reviewReportDraftsAtom } from "$/states/main";
import {
	pushNotificationAtom,
	removeNotificationAtom,
	upsertNotificationAtom,
} from "$/states/notifications";
import styles from "./ReviewReportDialog.module.css";
import { ReviewReportFomatter } from "./ReviewReportFomatter";

const blockLineText = (block: ReviewReportBlock) => {
	switch (block.kind) {
		case "manual":
			return "手写";
		case "wordTextShared":
			return block.lineRefs
				.map((item) => `第 ${item.lineNumber} 行${item.isBG ? "（背景）" : ""}`)
				.join("、");
		case "wordTextGroup":
		case "wordText":
		case "wordRoman":
		case "wordAdded":
		case "wordRemoved":
		case "lineTranslation":
		case "lineRoman":
		case "lineAdded":
		case "lineRemoved":
		case "wordAndRoman":
		case "timing":
			return `第 ${block.lineNumber} 行${block.isBG ? "（背景）" : ""}`;
		case "timeShift":
			return block.targetCount === block.totalLineCount
				? "全部歌词行"
				: block.lineRefs
						.map(
							(item) =>
								`第 ${item.lineNumber} 行${item.isBG ? "（背景）" : ""}`,
						)
						.join("、");
	}
};

const renderBlockDetails = (
	block: ReviewReportBlock,
	onManualChange: (id: string, content: string) => void,
	reportFormat: ReviewReportFormat,
) => {
	if (block.kind === "manual") {
		return (
			<TextArea
				value={block.content}
				onChange={(event) =>
					onManualChange(block.id, event.currentTarget.value)
				}
				placeholder="手写报告内容"
				style={{ minHeight: "96px" }}
			/>
		);
	}
	const text = getReviewReportBlockText(block, reportFormat);
	return (
		<Text size="2" color={block.enabled ? undefined : "gray"}>
			{text}
		</Text>
	);
};

type ReportBlockCategory =
	| "timeShift"
	| "timing"
	| "text"
	| "translation"
	| "roman"
	| "wordRoman"
	| "manual";

const reportBlockCategories: Array<{
	value: ReportBlockCategory;
	label: string;
}> = [
	{ value: "text", label: "原文" },
	{ value: "translation", label: "翻译" },
	{ value: "roman", label: "音译" },
	{ value: "wordRoman", label: "逐字音译" },
	{ value: "timeShift", label: "平移" },
	{ value: "timing", label: "时轴" },
	{ value: "manual", label: "手写" },
];

const getReportBlockCategory = (
	block: ReviewReportBlock,
): ReportBlockCategory => {
	switch (block.kind) {
		case "timeShift":
			return "timeShift";
		case "timing":
			return "timing";
		case "wordTextShared":
		case "wordTextGroup":
		case "wordText":
		case "wordAdded":
		case "wordRemoved":
		case "lineAdded":
		case "lineRemoved":
			return "text";
		case "lineTranslation":
			return "translation";
		case "lineRoman":
			return "roman";
		case "wordRoman":
		case "wordAndRoman":
			return "wordRoman";
		case "manual":
			return "manual";
	}
};

type ReportBlockGroup = {
	key: string;
	label: string;
	priority: number;
	sortValue: number;
	blocks: ReviewReportBlock[];
};

const getReportBlockPriority = (block: ReviewReportBlock) => {
	if (block.kind === "manual") return 2;
	if (block.kind === "timeShift" || block.kind === "timing") return 1;
	return 0;
};

const getReportBlockSortValue = (block: ReviewReportBlock) => {
	if (block.kind === "manual") return Number.MAX_SAFE_INTEGER;
	if (block.kind === "wordTextShared") {
		return Math.min(...block.lineRefs.map((item) => item.lineNumber));
	}
	if (block.kind === "timeShift") {
		return Math.min(...block.lineRefs.map((item) => item.lineNumber));
	}
	return block.lineNumber;
};

const getReportBlockGroupKey = (block: ReviewReportBlock) => {
	if (block.kind === "manual") return "manual";
	if (block.kind === "wordTextShared") {
		return `shared:${block.id}`;
	}
	if (block.kind === "timeShift") {
		return `time-shift:${block.id}`;
	}
	return `${block.lineNumber}:${block.isBG ? "bg" : "main"}`;
};

const getReportBlockGroupLabel = (block: ReviewReportBlock) => {
	if (block.kind === "manual") return "手写条目";
	if (block.kind === "wordTextShared") return blockLineText(block);
	if (block.kind === "timeShift") return "平移时间";
	return blockLineText(block);
};

const createReportBlockGroups = (blocks: ReviewReportBlock[]) => {
	const groupMap = new Map<string, ReportBlockGroup>();
	blocks.forEach((block) => {
		const key = getReportBlockGroupKey(block);
		const group = groupMap.get(key) ?? {
			key,
			label: getReportBlockGroupLabel(block),
			priority: getReportBlockPriority(block),
			sortValue: getReportBlockSortValue(block),
			blocks: [],
		};
		group.blocks.push(block);
		group.priority = Math.min(group.priority, getReportBlockPriority(block));
		groupMap.set(key, group);
	});
	return Array.from(groupMap.values()).sort(
		(a, b) =>
			a.priority - b.priority ||
			a.sortValue - b.sortValue ||
			a.label.localeCompare(b.label),
	);
};

const renderReportValue = (
	value: string | number,
	tone: "old" | "new" | "neutral",
) => (
	<Text
		as="span"
		size="2"
		className={`${styles.reportValue} ${styles[`reportValue-${tone}`]}`}
	>
		{String(value) || "（空）"}
	</Text>
);

const renderReportChange = (
	oldValue: string | number,
	newValue: string | number,
	label?: string,
) => (
	<span className={styles.reportChange}>
		{label && (
			<Text
				as="span"
				size="1"
				color="gray"
				className={styles.reportChangeLabel}
			>
				{label}
			</Text>
		)}
		{renderReportValue(oldValue, "old")}
		<Text as="span" size="2" color="gray">
			&rarr;
		</Text>
		{renderReportValue(newValue, "new")}
	</span>
);

const renderReportBlockVisual = (block: ReviewReportBlock): ReactNode => {
	switch (block.kind) {
		case "wordTextShared":
		case "wordText":
			return renderReportChange(block.oldWord, block.newWord);
		case "wordTextGroup":
			return block.changes.map((change, index) => (
				<span key={`${change.oldWord}-${change.newWord}-${index}`}>
					{renderReportChange(change.oldWord, change.newWord)}
				</span>
			));
		case "wordRoman":
			return (
				<>
					{renderReportValue(block.word, "neutral")}
					{renderReportChange(block.oldRoman, block.newRoman)}
				</>
			);
		case "lineTranslation":
		case "lineRoman":
			return renderReportChange(block.oldText, block.newText);
		case "wordAndRoman":
			return (
				<>
					{renderReportChange(block.oldWord, block.newWord, "原文")}
					{renderReportChange(block.oldRoman, block.newRoman, "音译")}
				</>
			);
		case "wordAdded":
			return (
				<>
					<Text as="span" size="1" color="gray">
						新增
					</Text>
					{renderReportValue(block.word, "new")}
				</>
			);
		case "wordRemoved":
			return (
				<>
					<Text as="span" size="1" color="gray">
						删除
					</Text>
					{renderReportValue(block.word, "old")}
				</>
			);
		case "lineAdded":
			return (
				<>
					<Text as="span" size="1" color="gray">
						新增歌词
					</Text>
					{renderReportValue(block.text, "new")}
				</>
			);
		case "lineRemoved":
			return (
				<>
					<Text as="span" size="1" color="gray">
						删除歌词
					</Text>
					{renderReportValue(block.text, "old")}
				</>
			);
		case "timeShift":
			return (
				<>
					{renderReportValue(
						block.targetCount === block.totalLineCount
							? "全部"
							: `${block.targetCount} 行`,
						"neutral",
					)}
					{renderReportValue(
						`${block.offsetMs < 0 ? "提前" : "延后"} ${Math.abs(
							block.offsetMs,
						)}ms`,
						"new",
					)}
				</>
			);
		case "timing": {
			const fields = new Set(block.fields);
			const changes: ReactNode[] = [];
			if (fields.has("startTime") && block.oldStart !== block.newStart) {
				changes.push(
					<span key="start">
						{renderReportChange(
							`${block.oldStart}ms`,
							`${block.newStart}ms`,
							"起始",
						)}
					</span>,
				);
			}
			if (fields.has("endTime") && block.oldEnd !== block.newEnd) {
				changes.push(
					<span key="end">
						{renderReportChange(
							`${block.oldEnd}ms`,
							`${block.newEnd}ms`,
							"结束",
						)}
					</span>,
				);
			}
			return (
				<>
					{renderReportValue(block.word, "neutral")}
					{changes}
				</>
			);
		}
		case "manual":
			return null;
	}
};

const isWordTextGroupChangeEnabled = (
	block: Extract<ReviewReportBlock, { kind: "wordTextGroup" }>,
	index: number,
) => block.enabled && block.changes[index]?.enabled !== false;

const renderReportBlockChip = (
	block: ReviewReportBlock,
	onManualChange: (id: string, content: string) => void,
	onToggle: (id: string, enabled: boolean) => void,
	onToggleGroupChange: (id: string, index: number, enabled: boolean) => void,
	onDelete: (id: string) => void,
	reportFormat: ReviewReportFormat,
) => {
	if (block.kind === "manual") {
		return (
			<Box
				key={block.id}
				className={`${styles.reportManualBlock} ${
					block.enabled ? "" : styles.reportBlockChipDisabled
				}`}
			>
				<Flex align="center" justify="between" gap="2">
					<Flex align="center" gap="2">
						<Checkbox
							checked={block.enabled}
							onCheckedChange={(checked) =>
								onToggle(block.id, checked === true)
							}
						/>
						<Text size="2" weight="medium">
							手写内容
						</Text>
					</Flex>
					<Button
						size="1"
						variant="ghost"
						color="red"
						onClick={() => onDelete(block.id)}
						title="删除条目"
					>
						<Delete20Regular />
					</Button>
				</Flex>
				{renderBlockDetails(block, onManualChange, reportFormat)}
			</Box>
		);
	}
	return (
		<Box
			key={block.id}
			className={styles.reportBlockChip}
			title={getReviewReportBlockText(block, reportFormat)}
		>
			<span className={styles.reportChipContent}>
				{block.kind === "wordTextGroup" ? (
					block.changes.map((change, index) => {
						const enabled = isWordTextGroupChangeEnabled(block, index);
						return (
							<button
								key={`${change.oldWord}-${change.newWord}-${index}`}
								type="button"
								className={`${styles.reportResultButton} ${
									enabled ? "" : styles.reportResultButtonDisabled
								}`}
								aria-pressed={enabled}
								title={enabled ? "点击禁用该结果" : "点击启用该结果"}
								onClick={() => onToggleGroupChange(block.id, index, !enabled)}
							>
								{renderReportChange(change.oldWord, change.newWord)}
							</button>
						);
					})
				) : (
					<button
						type="button"
						className={`${styles.reportResultButton} ${
							block.enabled ? "" : styles.reportResultButtonDisabled
						}`}
						aria-pressed={block.enabled}
						title={block.enabled ? "点击禁用该结果" : "点击启用该结果"}
						onClick={() => onToggle(block.id, !block.enabled)}
					>
						{renderReportBlockVisual(block)}
					</button>
				)}
			</span>
			<Button
				size="1"
				variant="ghost"
				color="red"
				onClick={() => onDelete(block.id)}
				title="删除条目"
				className={styles.reportChipDelete}
			>
				<Delete20Regular />
			</Button>
		</Box>
	);
};

export const ReviewReportDialog = () => {
	const [dialog, setDialog] = useAtom(reviewReportDialogAtom);
	const reviewReportDrafts = useAtomValue(reviewReportDraftsAtom);
	const reportFormat = useAtomValue(reviewReportFormatAtom);
	const setReviewReportDrafts = useSetAtom(reviewReportDraftsAtom);
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const setUpsertNotification = useSetAtom(upsertNotificationAtom);
	const removeNotification = useSetAtom(removeNotificationAtom);
	const submittedRef = useRef(false);
	const [activeTab, setActiveTab] = useState("blocks");
	const [formatDirty, setFormatDirty] = useState(false);
	const renderedReport = useMemo(
		() => renderReviewReport(dialog.report, reportFormat),
		[dialog.report, reportFormat],
	);
	const reportBlocks = useMemo(
		() => normalizeReviewReport(dialog.report).blocks,
		[dialog.report],
	);
	const reportBlockGroups = useMemo(
		() => createReportBlockGroups(reportBlocks),
		[reportBlocks],
	);
	const titleText = useMemo(() => {
		if (!dialog.prNumber) return "对当前稿件做出的审阅结果如下：";
		const title = dialog.prTitle?.trim() ? ` ${dialog.prTitle}` : "";
		const prefix =
			dialog.source === "lyrics-site" ? "歌词站稿件" : `PR#${dialog.prNumber}`;
		return `对${prefix}${title} 做出的审阅结果如下：`;
	}, [dialog.prNumber, dialog.prTitle, dialog.source]);

	useEffect(() => {
		if (dialog.open) {
			submittedRef.current = false;
			setActiveTab("blocks");
			setFormatDirty(false);
		}
	}, [dialog.open]);

	const collectDraftIds = () => {
		const draftIds = new Set<string>();
		if (dialog.draftId) {
			draftIds.add(dialog.draftId);
		}
		reviewReportDrafts.forEach((draft) => {
			if (
				draft.prNumber === dialog.prNumber &&
				draft.prTitle === dialog.prTitle
			) {
				draftIds.add(draft.id);
			}
		});
		return draftIds;
	};

	const cleanupDrafts = (draftIds: Set<string>) => {
		if (draftIds.size === 0) return;
		setReviewReportDrafts((prev: ReviewReportDraft[]) =>
			prev.filter((draft) => !draftIds.has(draft.id)),
		);
		for (const id of draftIds) {
			removeNotification(`review-report-draft-${id}`);
		}
	};

	const closeDialog = () => {
		if (
			!submittedRef.current &&
			hasReviewReportContent(dialog.report, reportFormat)
		) {
			const existingDraft = dialog.draftId
				? reviewReportDrafts.find((item) => item.id === dialog.draftId)
				: reviewReportDrafts.find(
						(item) =>
							item.prNumber === dialog.prNumber &&
							item.prTitle === dialog.prTitle,
					);
			const draftId = existingDraft?.id ?? dialog.draftId ?? uid();
			const createdAt = new Date().toISOString();
			setReviewReportDrafts((prev: ReviewReportDraft[]) => {
				const existingIndex = prev.findIndex((item) => item.id === draftId);
				if (existingIndex >= 0) {
					const next = [...prev];
					const existing = next[existingIndex];
					next[existingIndex] = {
						...existing,
						prNumber: dialog.prNumber,
						prTitle: dialog.prTitle,
						report: normalizeReviewReport(dialog.report),
						createdAt: existing.createdAt ?? createdAt,
					};
					return next;
				}
				return [
					{
						id: draftId,
						prNumber: dialog.prNumber,
						prTitle: dialog.prTitle,
						report: normalizeReviewReport(dialog.report),
						createdAt,
					},
					...prev,
				];
			});
			const prLabel = dialog.prNumber
				? `PR#${dialog.prNumber}${dialog.prTitle ? ` ${dialog.prTitle}` : ""}`
				: "当前文件";
			setUpsertNotification({
				id: `review-report-draft-${draftId}`,
				title: "审阅报告已暂存",
				description: `点击打开 ${prLabel} 的审阅报告`,
				level: "info",
				source: "Review",
				pinned: true,
				dismissible: false,
				action: {
					type: "open-review-report",
					payload: { draftId },
				},
			});
		}
		if (formatDirty) {
			setPushNotification({
				title: "审阅报告格式已修改",
				description: "建议及时导出模板，避免自定义格式意外丢失。",
				level: "warning",
				source: "Review",
			});
		}
		setDialog((prev: ReviewReportDialogState) =>
			prev.open ? { ...prev, open: false } : prev,
		);
	};
	const discardDraft = () => {
		cleanupDrafts(collectDraftIds());
		submittedRef.current = true;
		setDialog((prev: ReviewReportDialogState) => ({
			...prev,
			report: createReviewReport(),
		}));
		closeDialog();
	};
	const submitAndClose = () => {
		cleanupDrafts(collectDraftIds());
		submittedRef.current = true;
		closeDialog();
	};
	const getCleanReport = () => {
		if (!hasReviewReportContent(dialog.report, reportFormat)) {
			return "";
		}
		const trimmed = renderReviewReport(dialog.report, reportFormat).trim();
		if (!trimmed || trimmed === DEFAULT_REVIEW_REPORT_TEXT) {
			return "";
		}
		return trimmed;
	};
	const updateReportBlocks = (
		updater: (blocks: ReviewReportBlock[]) => ReviewReportBlock[],
	) => {
		setDialog((prev: ReviewReportDialogState) => ({
			...prev,
			report: createReviewReport(
				updater(normalizeReviewReport(prev.report).blocks),
			),
		}));
	};
	const insertTemplate = (content: string) => {
		const trimmed = content.trim();
		if (!trimmed) return;
		setDialog((prev: ReviewReportDialogState) => {
			const manualBlocks = createManualReviewReport(trimmed).blocks;
			const current = normalizeReviewReport(prev.report);
			return {
				...prev,
				report: createReviewReport([...manualBlocks, ...current.blocks]),
			};
		});
	};
	const addManualBlock = () => {
		updateReportBlocks((blocks) => [
			...blocks,
			{
				id: uid(),
				kind: "manual",
				content: "",
				enabled: true,
			},
		]);
	};
	const updateManualBlock = (id: string, content: string) => {
		updateReportBlocks((blocks) =>
			blocks.map((block) =>
				block.id === id && block.kind === "manual"
					? { ...block, content }
					: block,
			),
		);
	};
	const toggleBlock = (id: string, enabled: boolean) => {
		updateReportBlocks((blocks) =>
			blocks.map((block) => {
				if (block.id !== id) return block;
				if (block.kind === "wordTextGroup") {
					return {
						...block,
						enabled,
						changes: block.changes.map((change) => ({ ...change, enabled })),
					};
				}
				return { ...block, enabled };
			}),
		);
	};
	const toggleWordTextGroupChange = (
		id: string,
		index: number,
		enabled: boolean,
	) => {
		updateReportBlocks((blocks) =>
			blocks.map((block) => {
				if (block.id !== id || block.kind !== "wordTextGroup") return block;
				const changes = block.changes.map((change, changeIndex) =>
					changeIndex === index ? { ...change, enabled } : change,
				);
				return {
					...block,
					enabled: changes.some((change) => change.enabled !== false),
					changes,
				};
			}),
		);
	};
	const toggleBlockCategory = (
		group: ReportBlockGroup,
		category: ReportBlockCategory,
		enabled: boolean,
	) => {
		const ids = new Set(
			group.blocks
				.filter((block) => getReportBlockCategory(block) === category)
				.map((block) => block.id),
		);
		updateReportBlocks((blocks) =>
			blocks.map((block) =>
				ids.has(block.id)
					? block.kind === "wordTextGroup"
						? {
								...block,
								enabled,
								changes: block.changes.map((change) => ({
									...change,
									enabled,
								})),
							}
						: { ...block, enabled }
					: block,
			),
		);
	};
	const deleteBlock = (id: string) => {
		updateReportBlocks((blocks) => blocks.filter((block) => block.id !== id));
	};
	const replaceReportWithText = (content: string) => {
		setDialog((prev: ReviewReportDialogState) => ({
			...prev,
			report: createManualReviewReport(content),
		}));
	};

	return (
		<Dialog.Root
			open={dialog.open}
			onOpenChange={(open) => !open && dialog.open && closeDialog()}
		>
			<Dialog.Content className={styles.reportDialogContent}>
				<Flex direction="column" gap="3" className={styles.reportDialogBody}>
					<Flex align="center" justify="between" gap="3">
						<Text size="3" weight="medium">
							{titleText}
						</Text>
					</Flex>
					<ReviewTemplateSection
						open={dialog.open}
						onInsertTemplate={insertTemplate}
					/>
					<Tabs.Root
						value={activeTab}
						onValueChange={setActiveTab}
						className={styles.reportTabs}
					>
						<Tabs.List>
							<Tabs.Trigger value="blocks">条目</Tabs.Trigger>
							<Tabs.Trigger value="format">格式</Tabs.Trigger>
							<Tabs.Trigger value="text">文本</Tabs.Trigger>
							<Tabs.Trigger value="preview">预览</Tabs.Trigger>
						</Tabs.List>
						<Tabs.Content value="blocks" className={styles.reportTabsContent}>
							<Box className={styles.reportBlocksPane}>
								{reportBlocks.length > 0 ? (
									reportBlockGroups.map((group) => (
										<Box key={group.key} className={styles.reportLineGroup}>
											<Flex
												align="center"
												justify="between"
												gap="3"
												className={styles.reportLineHeader}
											>
												<Text size="3" weight="medium">
													{group.label}
												</Text>
												<Flex
													align="center"
													gap="2"
													className={styles.reportCategoryNav}
												>
													{reportBlockCategories.map((category) => {
														const categoryBlocks = group.blocks.filter(
															(block) =>
																getReportBlockCategory(block) ===
																category.value,
														);
														if (categoryBlocks.length === 0) return null;
														const enabledCount = categoryBlocks.filter(
															(block) => block.enabled,
														).length;
														const isEnabled = enabledCount > 0;
														return (
															<button
																key={category.value}
																type="button"
																className={`${styles.reportCategoryPill} ${
																	isEnabled
																		? ""
																		: styles.reportCategoryPillDisabled
																}`}
																aria-pressed={isEnabled}
																title={
																	isEnabled
																		? `取消筛选${category.label}报告`
																		: `筛选${category.label}报告`
																}
																onClick={() =>
																	toggleBlockCategory(
																		group,
																		category.value,
																		!isEnabled,
																	)
																}
															>
																<Text as="span" size="1" weight="medium">
																	{category.label}
																</Text>
																<Text
																	as="span"
																	size="1"
																	className={styles.reportCategoryCount}
																>
																	{categoryBlocks.length}
																</Text>
															</button>
														);
													})}
												</Flex>
											</Flex>
											<Flex direction="column" gap="3">
												{reportBlockCategories.map((category) => {
													const blocks = group.blocks.filter(
														(block) =>
															getReportBlockCategory(block) === category.value,
													);
													if (blocks.length === 0) return null;
													return (
														<Box
															key={category.value}
															className={styles.reportCategorySection}
														>
															<Text
																size="2"
																weight="medium"
																className={styles.reportCategoryTitle}
															>
																{category.label}
															</Text>
															<Box className={styles.reportChipWrap}>
																{blocks.map((block) =>
																	renderReportBlockChip(
																		block,
																		updateManualBlock,
																		toggleBlock,
																		toggleWordTextGroupChange,
																		deleteBlock,
																		reportFormat,
																	),
																)}
															</Box>
														</Box>
													);
												})}
											</Flex>
										</Box>
									))
								) : (
									<Flex align="center" justify="center" height="100%">
										<Text color="gray" size="2">
											暂无报告条目
										</Text>
									</Flex>
								)}
							</Box>
							<Flex justify="end" mt="2">
								<Button size="1" variant="soft" onClick={addManualBlock}>
									新增手写条目
								</Button>
							</Flex>
						</Tabs.Content>
						<Tabs.Content value="format" className={styles.reportTabsContent}>
							<ReviewReportFomatter
								report={dialog.report}
								onDirtyChange={setFormatDirty}
							/>
						</Tabs.Content>
						<Tabs.Content value="text" className={styles.reportTabsContent}>
							<TextArea
								value={renderedReport}
								onChange={(event) =>
									replaceReportWithText(event.currentTarget.value)
								}
								className={styles.reportTextArea}
							/>
						</Tabs.Content>
						<Tabs.Content value="preview" className={styles.reportTabsContent}>
							<Box className={styles.reportPreviewPane}>
								{hasReviewReportContent(dialog.report, reportFormat) ? (
									<ReactMarkdown
										remarkPlugins={[remarkGfm]}
										rehypePlugins={[rehypeRaw]}
									>
										{renderedReport}
									</ReactMarkdown>
								) : (
									<Text color="gray" size="2">
										暂无内容
									</Text>
								)}
							</Box>
						</Tabs.Content>
					</Tabs.Root>
					{activeTab !== "format" && (
						<ReviewReportSubmissionBar
							dialog={dialog}
							getCleanReport={getCleanReport}
							onDiscard={discardDraft}
							onSubmitAndClose={submitAndClose}
						/>
					)}
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};

export default ReviewReportDialog;
