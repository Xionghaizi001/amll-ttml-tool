import { Alert24Regular } from "@fluentui/react-icons";
import { Box, Button, Dialog, Flex, ScrollArea, Text } from "@radix-ui/themes";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { useFileOpener } from "$/hooks/useFileOpener";
import { createReviewUpdateNotificationHandler } from "$/modules/review/services/notification-service";
import type { AppNotification } from "$/states/notifications";
import type { ReviewSessionSource, ToolMode } from "$/states/main";
import { notificationCenterStyles } from "./notification-center.styles";
import { PendingUpdateGroup } from "./pending-update-group";
import { NotificationEntry } from "./notification-entry";

export type NotificationRenderEntry =
	| {
			type: "single";
			item: AppNotification;
	  }
	| {
			type: "group";
			items: AppNotification[];
			createdAt: string;
			pinned: boolean;
	  };

type NotificationCenterBodyProps = {
	open: boolean;
	setOpen: (value: boolean) => void;
	sortedNotifications: NotificationRenderEntry[];
	removeNotification: (id: string) => void;
	clearNotifications: () => void;
	hasDismissible: boolean;
	pat: string;
	neteaseCookie: string;
	setToolMode: (mode: ToolMode) => void;
	setReviewSession: (value: {
		prNumber: number;
		prTitle: string;
		fileName: string;
		source: ReviewSessionSource;
	}) => void;
	setPushNotification: (
		input: Omit<AppNotification, "id" | "createdAt"> & {
			id?: string;
			createdAt?: string;
		},
	) => void;
	audioLoadPendingId: string | null;
	setAudioLoadPendingId: Dispatch<SetStateAction<string | null>>;
	setLastNeteaseIdByPr: Dispatch<SetStateAction<Record<number, string>>>;
	getAccentColor: (
		level: AppNotification["level"],
	) => "blue" | "yellow" | "red" | "green";
	formatTime: (value: string) => string;
};

export const NotificationCenterBody = ({
	open,
	setOpen,
	sortedNotifications,
	removeNotification,
	clearNotifications,
	hasDismissible,
	pat,
	neteaseCookie,
	setToolMode,
	setReviewSession,
	setPushNotification,
	audioLoadPendingId,
	setAudioLoadPendingId,
	setLastNeteaseIdByPr,
	getAccentColor,
	formatTime,
}: NotificationCenterBodyProps) => {
	const { t } = useTranslation();
	const { openFile } = useFileOpener();
	const handleOpenUpdate = createReviewUpdateNotificationHandler({
		pat,
		neteaseCookie,
		openFile,
		setToolMode,
		setReviewSession,
		pushNotification: setPushNotification,
		audioLoadPendingId,
		setAudioLoadPendingId,
		setLastNeteaseIdByPr,
		onClose: () => setOpen(false),
	});

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
						<Box style={notificationCenterStyles.emptyIcon}>
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
						style={notificationCenterStyles.scrollArea}
					>
						<Flex direction="column" gap="2">
							{sortedNotifications.map((entry) => {
								if (entry.type === "group") {
									return (
										<PendingUpdateGroup
											key="pending-update-group"
											items={entry.items}
											onOpenUpdate={handleOpenUpdate}
											onClearGroup={() => {
												for (const item of entry.items) {
													removeNotification(item.id);
												}
											}}
											defaultOpen
											formatTime={formatTime}
											getAccentColor={getAccentColor}
										/>
									);
								}
								return (
									<NotificationEntry
										key={entry.item.id}
										item={entry.item}
										onOpenUpdate={handleOpenUpdate}
										formatTime={formatTime}
										getAccentColor={getAccentColor}
									/>
								);
							})}
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
