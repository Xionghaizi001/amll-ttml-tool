import {
	ClockRegular,
	DeleteRegular,
	DocumentRegular,
	HistoryRegular,
} from "@fluentui/react-icons";
import {
	Badge,
	Box,
	Button,
	Card,
	Flex,
	Heading,
	ScrollArea,
	Text,
} from "@radix-ui/themes";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import saveFile from "save-file";
import {
	DetailPlaceholder,
	MasterColumn,
	MasterDetailLayout,
	MasterListEmpty,
	MasterListItem,
} from "$/components/MasterDetail";
import { useConfirmedAction } from "$/hooks/useConfirmedAction";
import { useRelativeTime } from "$/hooks/useRelativeTime";
import {
	deleteReviewHistory,
	getReviewHistory,
	type ReviewHistoryRecord,
} from "$/modules/review/services/review-history-db";
import { readStructuredReviewReport } from "$/modules/user/services/structured-review-report-reader";
import {
	newLyricLinesAtom,
	projectIdAtom,
	saveFileNameAtom,
	sourceFileContentAtom,
} from "$/states/main";
import { pushNotificationAtom } from "$/states/notifications";
import { error as logError } from "$/utils/logging";

const NOTIFICATION_SOURCE = "ReviewHistory";

type ReviewPrGroup = {
	prNumber: number;
	prTitle: string;
	lastReviewedAt: number;
	count: number;
};

const groupByPr = (records: ReviewHistoryRecord[]): ReviewPrGroup[] => {
	const groups = new Map<number, ReviewPrGroup>();
	for (const record of records) {
		const current = groups.get(record.prNumber);
		if (!current) {
			groups.set(record.prNumber, {
				prNumber: record.prNumber,
				prTitle: record.prTitle,
				lastReviewedAt: record.createdAt,
				count: 1,
			});
			continue;
		}
		current.count += 1;
		if (record.createdAt > current.lastReviewedAt) {
			current.lastReviewedAt = record.createdAt;
			current.prTitle = record.prTitle;
		}
	}
	return [...groups.values()].sort(
		(a, b) => b.lastReviewedAt - a.lastReviewedAt,
	);
};

const ReviewHistoryCard = ({
	record,
	onDelete,
	onLoad,
	onExport,
}: {
	record: ReviewHistoryRecord;
	onDelete: (record: ReviewHistoryRecord) => void;
	onLoad: (
		record: ReviewHistoryRecord,
		variant: "original" | "modified",
	) => void;
	onExport: (record: ReviewHistoryRecord) => void;
}) => {
	const { t } = useTranslation();
	return (
		<Card variant="surface">
			<Flex direction="column" gap="3">
				<Flex align="start" justify="between" gap="3">
					<Flex align="center" gap="3" style={{ minWidth: 0 }}>
						<DocumentRegular fontSize={24} />
						<Flex direction="column" style={{ minWidth: 0 }}>
							<Text weight="bold" truncate>
								{record.fileName}
							</Text>
							<Text size="1" color="gray">
								{new Date(record.createdAt).toLocaleString()}
							</Text>
						</Flex>
					</Flex>
					<Button
						size="1"
						variant="soft"
						color="red"
						onClick={() => onDelete(record)}
					>
						<DeleteRegular />
						{t("common.delete", "删除")}
					</Button>
				</Flex>
				<Flex gap="2" wrap="wrap">
					<Badge variant="soft" color="gray">
						{t("reviewHistory.lines", "{count} 行", {
							count: record.data.lyricLines.length,
						})}
					</Badge>
					<Badge variant="soft" color="gray">
						{record.source}
					</Badge>
				</Flex>
				{record.structuredReport && (
					<Flex gap="2" wrap="wrap">
						<Button
							size="1"
							variant="soft"
							onClick={() => onLoad(record, "original")}
						>
							{t("reviewHistory.loadOriginal", "原稿")}
						</Button>
						<Button
							size="1"
							variant="soft"
							onClick={() => onLoad(record, "modified")}
						>
							{t("reviewHistory.loadModified", "修改稿")}
						</Button>
						<Button size="1" variant="soft" onClick={() => onExport(record)}>
							{t("reviewHistory.exportJson", "导出 JSON")}
						</Button>
					</Flex>
				)}
				<Text size="1" color="gray" truncate>
					{record.contentHash}
				</Text>
			</Flex>
		</Card>
	);
};

export const ReviewHistoryPanel = ({
	onRestored,
}: {
	/** 恢复成功后通知宿主（例如关闭包裹它的对话框）。 */
	onRestored?: () => void;
}) => {
	const { t } = useTranslation();
	const [records, setRecords] = useState<ReviewHistoryRecord[]>([]);
	const [selectedPr, setSelectedPr] = useState<number | null>(null);
	const confirmAction = useConfirmedAction();
	const formatRelativeTime = useRelativeTime();
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const setNewLyrics = useSetAtom(newLyricLinesAtom);
	const setProjectId = useSetAtom(projectIdAtom);
	const setSaveFileName = useSetAtom(saveFileNameAtom);
	const setSourceFileContent = useSetAtom(sourceFileContentAtom);

	const loadHistory = useCallback(async () => {
		try {
			const nextRecords = await getReviewHistory();
			setRecords(nextRecords);
			const availablePrs = new Set(nextRecords.map((item) => item.prNumber));
			setSelectedPr((current) =>
				current !== null && availablePrs.has(current)
					? current
					: (nextRecords[0]?.prNumber ?? null),
			);
		} catch (cause) {
			logError("Failed to load review history", cause);
			setPushNotification({
				title: t("reviewHistory.loadError", "加载审阅历史失败"),
				level: "error",
				source: NOTIFICATION_SOURCE,
			});
		}
	}, [setPushNotification, t]);

	useEffect(() => {
		void loadHistory();
	}, [loadHistory]);

	const prGroups = useMemo(() => groupByPr(records), [records]);
	const selectedRecords = useMemo(
		() => records.filter((record) => record.prNumber === selectedPr),
		[records, selectedPr],
	);
	const selectedGroup = prGroups.find((group) => group.prNumber === selectedPr);

	const handleDelete = (record: ReviewHistoryRecord) => {
		confirmAction({
			title: t("reviewHistory.delete.title", "删除审阅记录"),
			description: t(
				"reviewHistory.delete.description",
				"确定要删除这条审阅会话记录吗？此操作无法撤销。",
			),
			source: NOTIFICATION_SOURCE,
			successTitle: t("common.deleteSuccess", "删除成功"),
			run: async () => {
				await deleteReviewHistory(record.id);
				await loadHistory();
			},
		});
	};

	const loadReportVariant = async (
		record: ReviewHistoryRecord,
		variant: "original" | "modified",
	) => {
		if (!record.structuredReport) return;
		try {
			const result = await readStructuredReviewReport(record.structuredReport);
			if (!result.hashMatches) {
				throw new Error("原稿内容与报告中的 contentHash 不一致");
			}
			const lyric =
				variant === "original" ? result.originalLyric : result.modifiedLyric;
			const source =
				variant === "original"
					? record.structuredReport.original
					: record.structuredReport.modified;
			confirmAction({
				title:
					variant === "original"
						? t("reviewHistory.loadOriginal.title", "载入审阅原稿")
						: t("reviewHistory.loadModified.title", "载入审阅修改稿"),
				description: t(
					"historyRestoreDialog.confirm.description",
					"此操作将覆盖当前编辑器中的所有内容，确定要恢复此快照吗？",
				),
				source: NOTIFICATION_SOURCE,
				successTitle:
					variant === "original"
						? t("reviewHistory.loadOriginal.done", "已载入审阅原稿")
						: t("reviewHistory.loadModified.done", "已载入审阅修改稿"),
				run: () => {
					setProjectId(record.id);
					setNewLyrics(lyric);
					setSaveFileName(record.fileName);
					setSourceFileContent(source);
					onRestored?.();
				},
			});
		} catch (cause) {
			setPushNotification({
				title: `载入结构化报告失败：${cause instanceof Error ? cause.message : "未知错误"}`,
				level: "error",
				source: NOTIFICATION_SOURCE,
			});
		}
	};

	const exportReport = async (record: ReviewHistoryRecord) => {
		if (!record.structuredReport) return;
		try {
			const blob = new Blob(
				[JSON.stringify(record.structuredReport, null, 2)],
				{
					type: "application/json",
				},
			);
			await saveFile(blob, `structured-review-${record.prNumber}.json`);
		} catch (cause) {
			setPushNotification({
				title: `导出结构化报告失败：${cause instanceof Error ? cause.message : "未知错误"}`,
				level: "error",
				source: NOTIFICATION_SOURCE,
			});
		}
	};

	return (
		<MasterDetailLayout
			master={
				<MasterColumn title={t("reviewHistory.pullRequests", "Pull Requests")}>
					{prGroups.length === 0 ? (
						<MasterListEmpty>
							{t("reviewHistory.empty", "暂无审阅会话记录")}
						</MasterListEmpty>
					) : (
						prGroups.map((group) => (
							<MasterListItem
								key={group.prNumber}
								selected={selectedPr === group.prNumber}
								onSelect={() => setSelectedPr(group.prNumber)}
							>
								<Flex direction="column" gap="1">
									<Text weight="bold" size="2">
										#{group.prNumber}
									</Text>
									<Text size="1" truncate>
										{group.prTitle || "-"}
									</Text>
									<Flex gap="2" align="center">
										<ClockRegular fontSize={12} />
										<Text size="1" color="gray">
											{formatRelativeTime(group.lastReviewedAt)}
										</Text>
										<Badge size="1" variant="soft" color="gray">
											{group.count}
										</Badge>
									</Flex>
								</Flex>
							</MasterListItem>
						))
					)}
				</MasterColumn>
			}
			detail={
				selectedGroup ? (
					<Flex direction="column" gap="4" p="4" style={{ height: "100%" }}>
						<Flex direction="column" gap="1">
							<Heading size="4">PR #{selectedGroup.prNumber}</Heading>
							<Text size="2" color="gray">
								{selectedGroup.prTitle}
							</Text>
						</Flex>
						<Flex align="center" gap="2">
							<HistoryRegular />
							<Text weight="bold" size="2">
								{t("reviewHistory.sessions", "审阅会话")}
							</Text>
						</Flex>
						<ScrollArea type="auto" scrollbars="vertical">
							<Flex direction="column" gap="3" pr="3">
								{selectedRecords.map((record) => (
									<ReviewHistoryCard
										key={record.id}
										record={record}
										onDelete={handleDelete}
										onLoad={(item, variant) =>
											void loadReportVariant(item, variant)
										}
										onExport={(item) => void exportReport(item)}
									/>
								))}
							</Flex>
						</ScrollArea>
					</Flex>
				) : (
					<Box p="4" style={{ height: "100%" }}>
						<DetailPlaceholder>
							{t("reviewHistory.selectPr", "请从左侧选择一个 PR")}
						</DetailPlaceholder>
					</Box>
				)
			}
		/>
	);
};
