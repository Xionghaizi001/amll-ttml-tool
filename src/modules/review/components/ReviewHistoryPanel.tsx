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
import {
	deleteReviewHistory,
	getReviewHistory,
	type ReviewHistoryRecord,
} from "$/modules/review/services/review-history-db";
import { confirmDialogAtom } from "$/states/dialogs";
import { pushNotificationAtom } from "$/states/notifications";
import { error as logError } from "$/utils/logging";

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
}: {
	record: ReviewHistoryRecord;
	onDelete: (record: ReviewHistoryRecord) => void;
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
						{t("historyRestoreDialog.review.lines", "{count} 行", {
							count: record.structure.lines.length,
						})}
					</Badge>
					<Badge variant="soft" color="gray">
						{t("historyRestoreDialog.review.elements", "{count} 个元素", {
							count: record.structure.elements.length,
						})}
					</Badge>
					<Badge variant="soft" color="gray">
						{record.source}
					</Badge>
				</Flex>
				<Text size="1" color="gray" truncate>
					{t("historyRestoreDialog.review.documentId", "文档 ID：{id}", {
						id: record.structure.documentId,
					})}
				</Text>
				<Text size="1" color="gray" truncate>
					{record.contentHash}
				</Text>
			</Flex>
		</Card>
	);
};

export const ReviewHistoryPanel = () => {
	const { t } = useTranslation();
	const [records, setRecords] = useState<ReviewHistoryRecord[]>([]);
	const [selectedPr, setSelectedPr] = useState<number | null>(null);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const setPushNotification = useSetAtom(pushNotificationAtom);

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
				title: t("historyRestoreDialog.review.loadError", "加载审阅历史失败"),
				level: "error",
				source: "ReviewHistory",
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
		setConfirmDialog({
			open: true,
			title: t("historyRestoreDialog.review.delete.title", "删除审阅记录"),
			description: t(
				"historyRestoreDialog.review.delete.description",
				"确定要删除这条审阅会话记录吗？此操作无法撤销。",
			),
			onConfirm: async () => {
				await deleteReviewHistory(record.id);
				await loadHistory();
				setPushNotification({
					title: t("common.deleteSuccess", "删除成功"),
					level: "success",
					source: "ReviewHistory",
				});
			},
		});
	};

	return (
		<Flex style={{ height: "100%", minHeight: 0 }}>
			<Flex
				direction="column"
				style={{
					width: "30%",
					flexShrink: 0,
					backgroundColor: "var(--gray-2)",
					borderRight: "1px solid var(--gray-5)",
				}}
			>
				<Flex
					p="4"
					align="center"
					style={{ borderBottom: "1px solid var(--gray-5)" }}
				>
					<Heading size="3">
						{t("historyRestoreDialog.review.pullRequests", "Pull Requests")}
					</Heading>
				</Flex>
				<ScrollArea type="auto" scrollbars="vertical">
					{prGroups.length === 0 ? (
						<Box p="4">
							<Text size="2" color="gray">
								{t("historyRestoreDialog.review.empty", "暂无审阅会话记录")}
							</Text>
						</Box>
					) : (
						prGroups.map((group) => (
							<Box
								key={group.prNumber}
								onClick={() => setSelectedPr(group.prNumber)}
								style={{
									padding: 12,
									cursor: "pointer",
									backgroundColor:
										selectedPr === group.prNumber
											? "var(--accent-4)"
											: "transparent",
									borderBottom: "1px solid var(--gray-4)",
								}}
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
											{new Date(group.lastReviewedAt).toLocaleDateString()}
										</Text>
										<Badge size="1" variant="soft" color="gray">
											{group.count}
										</Badge>
									</Flex>
								</Flex>
							</Box>
						))
					)}
				</ScrollArea>
			</Flex>
			<Box p="4" flexGrow="1" style={{ minWidth: 0 }}>
				{selectedGroup ? (
					<Flex direction="column" gap="4" style={{ height: "100%" }}>
						<Flex direction="column" gap="1">
							<Heading size="4">PR #{selectedGroup.prNumber}</Heading>
							<Text size="2" color="gray">
								{selectedGroup.prTitle}
							</Text>
						</Flex>
						<Flex align="center" gap="2">
							<HistoryRegular />
							<Text weight="bold" size="2">
								{t("historyRestoreDialog.review.sessions", "审阅会话")}
							</Text>
						</Flex>
						<ScrollArea type="auto" scrollbars="vertical">
							<Flex direction="column" gap="3" pr="3">
								{selectedRecords.map((record) => (
									<ReviewHistoryCard
										key={record.id}
										record={record}
										onDelete={handleDelete}
									/>
								))}
							</Flex>
						</ScrollArea>
					</Flex>
				) : (
					<Flex
						align="center"
						justify="center"
						direction="column"
						style={{ height: "100%", color: "var(--gray-8)" }}
					>
						<DocumentRegular fontSize={48} />
						<Text mt="2">
							{t("historyRestoreDialog.review.selectPr", "请从左侧选择一个 PR")}
						</Text>
					</Flex>
				)}
			</Box>
		</Flex>
	);
};
