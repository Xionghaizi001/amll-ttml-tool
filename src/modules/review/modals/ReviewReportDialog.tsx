import { Delete20Regular } from "@fluentui/react-icons";
import {
	Box,
	Button,
	Checkbox,
	Dialog,
	Flex,
	Switch,
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
} from "$/modules/review/services/report-service/format-service";
import {
	createManualReviewReport,
	createReviewReport,
	DEFAULT_REVIEW_REPORT_TEXT,
	normalizeReviewReport,
} from "$/modules/review/services/report-service/normalize-service";
import { captureManualReviewReportPlacements } from "$/modules/review/services/report-service/ordering-service";
import {
	getReviewReportBlockText,
	hasReviewReportContent,
	renderReviewReport,
} from "$/modules/review/services/report-service/render-service";
import type {
	ReviewReport,
	ReviewReportBlock,
} from "$/modules/review/services/report-service/types";
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
			return block.changes.map((change) => (
				<span
					key={`${change.wordId ?? `${change.oldWord}->${change.newWord}`}`}
				>
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
		case "lineTiming": {
			const changes: ReactNode[] = [];
			if (block.oldStart !== block.newStart) {
				changes.push(
					<span key="line-start">
						{renderReportChange(
							`${block.oldStart}ms`,
							`${block.newStart}ms`,
							"行起始",
						)}
					</span>,
				);
			}
			if (block.oldEnd !== block.newEnd) {
				changes.push(
					<span key="line-end">
						{renderReportChange(
							`${block.oldEnd}ms`,
							`${block.newEnd}ms`,
							"行结束",
						)}
					</span>,
				);
			}
			return (
				<>
					{renderReportValue("行时轴修正", "neutral")}
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

const getReportBlockScopeLabel = (block: ReviewReportBlock) => {
	if (block.kind === "manual") return null;
	if (block.kind === "timeShift") {
		return block.targetCount === block.totalLineCount
			? "全部歌词行"
			: block.lineRefs
					.map(
						(item) => `第 ${item.lineNumber} 行${item.isBG ? "（背景）" : ""}`,
					)
					.join("、");
	}
	if (block.kind === "wordTextShared") {
		return block.lineRefs
			.map((item) => `第 ${item.lineNumber} 行${item.isBG ? "（背景）" : ""}`)
			.join("、");
	}
	return `第 ${block.lineNumber} 行${block.isBG ? "（背景）" : ""}`;
};

const getReportBlockScopeKey = (block: ReviewReportBlock) => {
	if (block.kind === "manual") return null;
	if (block.kind === "timeShift" || block.kind === "wordTextShared") {
		return `${block.kind}:${block.id}`;
	}
	return `line:${block.lineNumber}:${block.isBG ? "bg" : "main"}`;
};

type ReportBlockSequenceGroup = {
	key: string;
	scopeKey: string | null;
	scopeLabel: string | null;
	blocks: ReviewReportBlock[];
};

const createReportBlockSequenceGroups = (
	blocks: ReviewReportBlock[],
): ReportBlockSequenceGroup[] => {
	const groups: ReportBlockSequenceGroup[] = [];
	const groupsByScope = new Map<string, ReportBlockSequenceGroup>();
	for (const block of blocks) {
		const scopeKey = getReportBlockScopeKey(block);
		const existingGroup = scopeKey ? groupsByScope.get(scopeKey) : undefined;
		if (existingGroup) {
			existingGroup.blocks.push(block);
			continue;
		}
		const group = {
			key: block.id,
			scopeKey,
			scopeLabel: getReportBlockScopeLabel(block),
			blocks: [block],
		};
		groups.push(group);
		if (scopeKey) groupsByScope.set(scopeKey, group);
	}
	return groups;
};

type ManualReportBlockViewProps = {
	block: Extract<ReviewReportBlock, { kind: "manual" }>;
	onManualChange: (id: string, content: string) => void;
	onLineBreakChange: (id: string, lineBreakBefore: boolean) => void;
	onToggle: (id: string, enabled: boolean) => void;
	onDelete: (id: string) => void;
	onMoveManual: (id: string, direction: -1 | 1) => void;
	canMoveManual: (id: string, direction: -1 | 1) => boolean;
};

const ManualReportBlockView = ({
	block,
	onManualChange,
	onLineBreakChange,
	onToggle,
	onDelete,
	onMoveManual,
	canMoveManual,
}: ManualReportBlockViewProps) => {
	const [focused, setFocused] = useState(false);
	const textAreaRef = useRef<HTMLTextAreaElement>(null);
	return (
		<Box
			className={`${styles.reportManualBlock} ${
				block.enabled ? "" : styles.reportBlockChipDisabled
			}`}
		>
			<Flex
				align="center"
				justify="between"
				gap="2"
				className={styles.reportManualHeader}
			>
				<Flex align="center" gap="2">
					<Checkbox
						checked={block.enabled}
						onCheckedChange={(checked) => onToggle(block.id, checked === true)}
					/>
					<Text size="2" weight="medium">
						手写内容
					</Text>
				</Flex>
				<Flex align="center" gap="1" className={styles.reportManualActions}>
					<Flex
						align="center"
						gap="1"
						className={styles.reportManualLineBreak}
						title="在 Markdown 预览中另起一行"
					>
						<Switch
							size="1"
							checked={block.lineBreakBefore === true}
							onCheckedChange={(checked) =>
								onLineBreakChange(block.id, checked)
							}
							aria-label="换行"
						/>
						<Text size="1" color="gray">
							换行
						</Text>
					</Flex>
					<Button
						size="1"
						variant="soft"
						disabled={!canMoveManual(block.id, -1)}
						onClick={() => onMoveManual(block.id, -1)}
						title="将手写条目上移"
					>
						上移
					</Button>
					<Button
						size="1"
						variant="soft"
						disabled={!canMoveManual(block.id, 1)}
						onClick={() => onMoveManual(block.id, 1)}
						title="将手写条目下移"
					>
						下移
					</Button>
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
			</Flex>
			{focused ? (
				<TextArea
					ref={textAreaRef}
					value={block.content}
					onChange={(event) =>
						onManualChange(block.id, event.currentTarget.value)
					}
					onFocus={() => setFocused(true)}
					onBlur={() => setFocused(false)}
					placeholder="手写报告内容"
					style={{ minHeight: "96px" }}
				/>
			) : (
				<button
					type="button"
					className={styles.reportManualSummary}
					onClick={() => {
						setFocused(true);
						window.requestAnimationFrame(() => textAreaRef.current?.focus());
					}}
				>
					{block.content.trim() || "点击展开并编辑手写内容"}
				</button>
			)}
		</Box>
	);
};

const renderReportBlockChip = (
	block: ReviewReportBlock,
	onManualChange: (id: string, content: string) => void,
	onManualLineBreakChange: (id: string, lineBreakBefore: boolean) => void,
	onToggle: (id: string, enabled: boolean) => void,
	onToggleGroupChange: (id: string, index: number, enabled: boolean) => void,
	onDelete: (id: string) => void,
	onMoveManual: (id: string, direction: -1 | 1) => void,
	canMoveManual: (id: string, direction: -1 | 1) => boolean,
	reportFormat: ReviewReportFormat,
) => {
	if (block.kind === "manual") {
		return (
			<ManualReportBlockView
				key={block.id}
				block={block}
				onManualChange={onManualChange}
				onLineBreakChange={onManualLineBreakChange}
				onToggle={onToggle}
				onDelete={onDelete}
				onMoveManual={onMoveManual}
				canMoveManual={canMoveManual}
			/>
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
								key={`${change.wordId ?? `${change.oldWord}->${change.newWord}`}`}
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
	const wasDialogOpenRef = useRef(false);
	const [activeTab, setActiveTab] = useState("blocks");
	const [formatDirty, setFormatDirty] = useState(false);
	const [sourceReport, setSourceReport] = useState<ReviewReport>(() =>
		normalizeReviewReport(dialog.report),
	);
	const renderedReport = useMemo(
		() => renderReviewReport(dialog.report, reportFormat),
		[dialog.report, reportFormat],
	);
	const displayReportText = renderedReport;
	const rerenderSourceReport = useMemo(() => {
		const structuredBlocks = sourceReport.blocks.filter(
			(block) => block.kind !== "manual",
		);
		if (structuredBlocks.length === 0) return sourceReport;
		return createReviewReport(structuredBlocks);
	}, [sourceReport]);
	const reportBlocks = useMemo(
		() => normalizeReviewReport(sourceReport).blocks,
		[sourceReport],
	);
	const reportBlockGroups = useMemo(
		() => createReportBlockSequenceGroups(reportBlocks),
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
		if (dialog.open && !wasDialogOpenRef.current) {
			const report = normalizeReviewReport(dialog.report);
			setSourceReport(report);
			submittedRef.current = false;
			setActiveTab("blocks");
			setFormatDirty(false);
		}
		wasDialogOpenRef.current = dialog.open;
	}, [dialog.open, dialog.report]);

	useEffect(() => {
		if (!dialog.open || !wasDialogOpenRef.current) return;
		const report = normalizeReviewReport(dialog.report);
		setSourceReport(report);
	}, [dialog.open, dialog.report]);

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

	const getCurrentReport = () => normalizeReviewReport(sourceReport);

	const closeDialog = () => {
		const currentReport = getCurrentReport();
		if (
			!submittedRef.current &&
			hasReviewReportContent(currentReport, reportFormat)
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
						report: normalizeReviewReport(currentReport),
						createdAt: existing.createdAt ?? createdAt,
					};
					return next;
				}
				return [
					{
						id: draftId,
						prNumber: dialog.prNumber,
						prTitle: dialog.prTitle,
						report: normalizeReviewReport(currentReport),
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
		const emptyReport = createReviewReport();
		cleanupDrafts(collectDraftIds());
		submittedRef.current = true;
		setSourceReport(emptyReport);
		setDialog((prev: ReviewReportDialogState) => ({
			...prev,
			report: emptyReport,
		}));
		closeDialog();
	};
	const submitAndClose = () => {
		cleanupDrafts(collectDraftIds());
		submittedRef.current = true;
		closeDialog();
	};
	const getCleanReport = () => {
		const reportBody = displayReportText.trim();
		if (!reportBody || reportBody === DEFAULT_REVIEW_REPORT_TEXT) {
			return "";
		}
		if (!hasReviewReportContent(getCurrentReport(), reportFormat)) {
			return "";
		}
		return reportBody;
	};
	const updateReportBlocks = (
		updater: (blocks: ReviewReportBlock[]) => ReviewReportBlock[],
	) => {
		const nextBlocks = captureManualReviewReportPlacements(
			updater(normalizeReviewReport(sourceReport).blocks),
		);
		const report = createReviewReport(nextBlocks);
		setSourceReport(report);
		setDialog((prev: ReviewReportDialogState) => ({
			...prev,
			report,
		}));
	};
	const insertTemplate = (content: string) => {
		const trimmed = content.trim();
		if (!trimmed) return;
		const manualBlocks = createManualReviewReport(trimmed).blocks;
		const current = normalizeReviewReport(sourceReport);
		const report = createReviewReport(
			captureManualReviewReportPlacements([...manualBlocks, ...current.blocks]),
		);
		setSourceReport(report);
		setDialog((prev: ReviewReportDialogState) => ({
			...prev,
			report,
		}));
	};
	const addManualBlock = () => {
		updateReportBlocks((blocks) => [
			...blocks,
			{
				id: uid(),
				kind: "manual",
				content: "",
				lineBreakBefore: false,
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
	const updateManualLineBreak = (id: string, lineBreakBefore: boolean) => {
		updateReportBlocks((blocks) =>
			blocks.map((block) =>
				block.id === id && block.kind === "manual"
					? { ...block, lineBreakBefore }
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
	const deleteBlock = (id: string) => {
		updateReportBlocks((blocks) => blocks.filter((block) => block.id !== id));
	};
	const canMoveManual = (id: string, direction: -1 | 1) => {
		const blocks = normalizeReviewReport(sourceReport).blocks;
		const index = blocks.findIndex((block) => block.id === id);
		return (
			index >= 0 &&
			blocks[index]?.kind === "manual" &&
			index + direction >= 0 &&
			index + direction < blocks.length
		);
	};
	const moveManualBlock = (id: string, direction: -1 | 1) => {
		updateReportBlocks((blocks) => {
			const index = blocks.findIndex((block) => block.id === id);
			const targetIndex = index + direction;
			if (
				index < 0 ||
				targetIndex < 0 ||
				targetIndex >= blocks.length ||
				blocks[index]?.kind !== "manual"
			) {
				return blocks;
			}
			const next = [...blocks];
			const [moved] = next.splice(index, 1);
			if (!moved) return blocks;
			next.splice(targetIndex, 0, moved);
			return next;
		});
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
						<Flex
							align="center"
							justify="between"
							gap="2"
							className={styles.reportTabsHeader}
						>
							<Tabs.List>
								<Tabs.Trigger value="blocks">条目</Tabs.Trigger>
								<Tabs.Trigger value="format">格式</Tabs.Trigger>
								<Tabs.Trigger value="text">文本</Tabs.Trigger>
								<Tabs.Trigger value="preview">预览</Tabs.Trigger>
							</Tabs.List>
							{activeTab === "text" && (
								<Text size="1" color="gray">
									文本由条目顺序自动生成，请在“条目”页添加手写内容
								</Text>
							)}
						</Flex>
						<Tabs.Content value="blocks" className={styles.reportTabsContent}>
							<Box className={styles.reportBlocksPane}>
								<Text size="1" color="gray">
									结构化条目按系统顺序排列；手写条目可通过上移/下移插入序列。
								</Text>
								{reportBlocks.length > 0 ? (
									<Flex direction="column" gap="3">
										{reportBlockGroups.map((group) => (
											<Box
												key={group.key}
												className={
													group.scopeLabel
														? styles.reportSequenceItem
														: undefined
												}
											>
												{group.scopeLabel && (
													<Text
														size="1"
														color="gray"
														className={styles.reportSequenceScope}
													>
														{group.scopeLabel}
													</Text>
												)}
												<div className={styles.reportSequenceEntries}>
													{group.blocks.map((block) =>
														renderReportBlockChip(
															block,
															updateManualBlock,
															updateManualLineBreak,
															toggleBlock,
															toggleWordTextGroupChange,
															deleteBlock,
															moveManualBlock,
															canMoveManual,
															reportFormat,
														),
													)}
												</div>
											</Box>
										))}
									</Flex>
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
								report={rerenderSourceReport}
								onDirtyChange={setFormatDirty}
							/>
						</Tabs.Content>
						<Tabs.Content value="text" className={styles.reportTabsContent}>
							<TextArea
								value={displayReportText}
								readOnly
								aria-label="自动生成的审阅报告文本"
								className={styles.reportTextArea}
							/>
						</Tabs.Content>
						<Tabs.Content value="preview" className={styles.reportTabsContent}>
							<Box className={styles.reportPreviewPane}>
								{getCleanReport() ? (
									<ReactMarkdown
										remarkPlugins={[remarkGfm]}
										rehypePlugins={[rehypeRaw]}
									>
										{displayReportText}
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
							getCurrentReport={getCurrentReport}
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
