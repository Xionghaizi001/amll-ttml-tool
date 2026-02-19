import { Badge, Button, Card, Flex, Text } from "@radix-ui/themes";
import { open } from "@tauri-apps/plugin-shell";
import { motion } from "framer-motion";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { notificationCenterDialogAtom, reviewReportDialogAtom } from "$/states/dialogs";
import {
	removeNotificationAtom,
	type AppNotification,
} from "$/states/notifications";
import { reviewReportDraftsAtom } from "$/states/main";
import { notificationCenterStyles } from "./notification-center.styles";

type NotificationEntryProps = {
	item: AppNotification;
	onOpenUpdate: (payload: { prNumber: number; prTitle: string }) => void;
	formatTime: (value: string) => string;
	getAccentColor: (
		level: AppNotification["level"],
	) => "blue" | "yellow" | "red" | "green";
};

export const NotificationEntry = ({
	item,
	onOpenUpdate,
	formatTime,
	getAccentColor,
}: NotificationEntryProps) => {
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

	const draftAction =
		item.action?.type === "open-review-report" ? item.action : null;
	const updateAction =
		item.action?.type === "open-review-update" ? item.action : null;
	const urlAction = item.action?.type === "open-url" ? item.action : null;
	const canOpenDraft = Boolean(draftAction);
	const canOpenUpdate = Boolean(updateAction);
	const canOpenUrl = Boolean(urlAction);
	const canOpenAction = canOpenDraft || canOpenUpdate || canOpenUrl;
	const accentColor = getAccentColor(item.level);
	const cardStyle = notificationCenterStyles.notificationCard(
		accentColor,
		canOpenAction,
	);
	const handleOpenDraft = () => {
		if (!canOpenDraft) return;
		const draft = drafts.find(
			(candidate) => candidate.id === draftAction?.payload.draftId,
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
	const handleOpenUpdate = () => {
		if (!canOpenUpdate) return;
		if (!updateAction) return;
		onOpenUpdate(updateAction.payload);
	};
	const handleOpenAction = () => {
		if (canOpenDraft) {
			handleOpenDraft();
			return;
		}
		if (canOpenUpdate) {
			handleOpenUpdate();
			return;
		}
		if (canOpenUrl && urlAction) {
			if (import.meta.env.TAURI_ENV_PLATFORM) {
				void open(urlAction.payload.url);
			} else {
				window.open(urlAction.payload.url, "_blank");
			}
			setNotificationCenterOpen(false);
		}
	};

	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -8 }}
			transition={{ duration: 0.18 }}
		>
			<Card onClick={canOpenAction ? handleOpenAction : undefined} style={cardStyle}>
				<Flex align="start" justify="between" gap="3">
					<Flex
						direction="column"
						gap="1"
						style={notificationCenterStyles.flexGrowMinWidth}
					>
						<Flex align="center" gap="2" wrap="wrap">
							<Badge size="1" color={accentColor}>
								{levelTextMap[item.level]}
							</Badge>
							{item.source && (
								<Text size="1" color="gray" wrap="nowrap">
									{item.source}
								</Text>
							)}
						</Flex>
						<Text
							size="2"
							weight="bold"
							wrap="wrap"
							style={notificationCenterStyles.titleText}
						>
							{item.title}
						</Text>
						{item.description && (
							<Text size="1" color="gray" wrap="wrap">
								{item.description}
							</Text>
						)}
					</Flex>
					<Flex direction="column" align="end" gap="2" style={notificationCenterStyles.actionColumn}>
						<Text size="1" color="gray" wrap="nowrap">
							{formatTime(item.createdAt)}
						</Text>
						{item.dismissible !== false && (
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
						)}
					</Flex>
				</Flex>
			</Card>
		</motion.div>
	);
};
