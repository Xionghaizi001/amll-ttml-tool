import { Alert24Regular } from "@fluentui/react-icons";
import {
	Badge,
	Box,
	Button,
	Card,
	Dialog,
	Flex,
	ScrollArea,
	Text,
} from "@radix-ui/themes";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { notificationCenterDialogAtom, reviewReportDialogAtom } from "$/states/dialogs";
import {
	clearNotificationsAtom,
	notificationsAtom,
	removeNotificationAtom,
	type AppNotification,
} from "$/states/notifications";
import { reviewReportDraftsAtom } from "$/states/main";

const levelColorMap: Record<AppNotification["level"], "blue" | "yellow" | "red" | "green"> =
	{
		info: "blue",
		warning: "yellow",
		error: "red",
		success: "green",
	};

const formatTime = (value: string) => {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
};

const NotificationEntry = ({ item }: { item: AppNotification }) => {
	const { t } = useTranslation();
	const drafts = useAtomValue(reviewReportDraftsAtom);
	const setReviewReportDialog = useSetAtom(reviewReportDialogAtom);
	const setNotificationCenterOpen = useSetAtom(notificationCenterDialogAtom);
	const removeNotification = useSetAtom(removeNotificationAtom);
	const levelTextMap: Record<AppNotification["level"], string> = {
		info: t("notificationCenter.level.info", "信息"),
		warning: t("notificationCenter.level.warning", "警告"),
		error: t("notificationCenter.level.error", "错误"),
		success: t("notificationCenter.level.success", "成功"),
	};

	const canOpenDraft = item.action?.type === "open-review-report";
	const accentColor = levelColorMap[item.level];
	const cardStyle = {
		borderLeft: `3px solid var(--${accentColor}-9)`,
		cursor: canOpenDraft ? "pointer" : undefined,
	};
	const handleOpenDraft = () => {
		if (!canOpenDraft) return;
		const draft = drafts.find(
			(candidate) => candidate.id === item.action?.payload.draftId,
		);
		if (!draft) return;
		setReviewReportDialog({
			open: true,
			prNumber: draft.prNumber,
			prTitle: draft.prTitle,
			report: draft.report,
			draftId: draft.id,
		});
		setNotificationCenterOpen(false);
	};

	return (
		<Card onClick={canOpenDraft ? handleOpenDraft : undefined} style={cardStyle}>
			<Flex align="center" justify="between" gap="3">
				<Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
					<Flex align="center" gap="2">
						<Badge size="1" color={accentColor}>
							{levelTextMap[item.level]}
						</Badge>
						<Text size="2" weight="bold" truncate>
							{item.title}
						</Text>
					</Flex>
					{item.description && (
						<Text size="1" color="gray" wrap="wrap">
							{item.description}
						</Text>
					)}
					{item.source && (
						<Text size="1" color="gray">
							{item.source}
						</Text>
					)}
					{item.dismissible !== false && (
						<Flex align="center" gap="2">
							<Button
								size="1"
								variant="soft"
								color={accentColor}
								onClick={(event) => {
									event.stopPropagation();
									removeNotification(item.id);
								}}
							>
								{t("notificationCenter.ignore", "忽略")}
							</Button>
						</Flex>
					)}
				</Flex>
				<Text size="1" color="gray" wrap="nowrap">
					{formatTime(item.createdAt)}
				</Text>
			</Flex>
		</Card>
	);
};

export const NotificationCenterDialog = () => {
	const [open, setOpen] = useAtom(notificationCenterDialogAtom);
	const notifications = useAtomValue(notificationsAtom);
	const { t } = useTranslation();
	const clearNotifications = useSetAtom(clearNotificationsAtom);
	const sortedNotifications = useMemo(() => {
		return [...notifications].sort((a, b) => {
			const pinnedDelta = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
			if (pinnedDelta !== 0) return pinnedDelta;
			return b.createdAt.localeCompare(a.createdAt);
		});
	}, [notifications]);
	const hasDismissible = useMemo(
		() => notifications.some((item) => item.dismissible !== false),
		[notifications],
	);

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Content maxWidth="720px">
				<Dialog.Title>
					{t("notificationCenter.title", "通知中心")}
				</Dialog.Title>
				<Dialog.Description size="2" color="gray" mb="3">
					{t(
						"notificationCenter.description",
						"应用内的通知、错误与提醒会显示在这里",
					)}
				</Dialog.Description>

				{sortedNotifications.length === 0 ? (
					<Flex direction="column" align="center" gap="2" py="6">
						<Box style={{ color: "var(--gray-10)" }}>
							<Alert24Regular />
						</Box>
						<Text size="2" weight="medium">
							{t("notificationCenter.emptyTitle", "暂无通知")}
						</Text>
						<Text size="1" color="gray">
							{t(
								"notificationCenter.emptyDescription",
								"当有新的错误或提示时会自动展示在此处",
							)}
						</Text>
					</Flex>
				) : (
					<ScrollArea
						type="auto"
						scrollbars="vertical"
						style={{ maxHeight: "420px" }}
					>
						<Flex direction="column" gap="2">
							{sortedNotifications.map((item) => (
								<NotificationEntry key={item.id} item={item} />
							))}
						</Flex>
					</ScrollArea>
				)}

				<Flex justify="end" mt="4" gap="2">
					<Button
						variant="soft"
						color="gray"
						onClick={() => clearNotifications()}
						disabled={!hasDismissible}
					>
						{t("notificationCenter.clearAll", "全部清除")}
					</Button>
					<Dialog.Close>
						<Button variant="soft" color="gray">
							{t("common.close", "关闭")}
						</Button>
					</Dialog.Close>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
