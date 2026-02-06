import { Alert24Regular } from "@fluentui/react-icons";
import { Box, Button, Dialog, Flex, ScrollArea, Text } from "@radix-ui/themes";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useFileOpener } from "$/hooks/useFileOpener";
import { createReviewUpdateNotificationHandler } from "$/modules/review/services/notification-service";
import { NeteaseIdSelectDialog } from "$/modules/ncm/modals/NeteaseIdSelectDialog";
import type { AppNotification } from "$/states/notifications";
import type { ToolMode } from "$/states/main";
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
	setPushNotification: (
		input: Omit<AppNotification, "id" | "createdAt"> & {
			id?: string;
			createdAt?: string;
		},
	) => void;
	audioLoadPendingId: string | null;
	setAudioLoadPendingId: (value: string | null) => void;
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
	setPushNotification,
	audioLoadPendingId,
	setAudioLoadPendingId,
	setLastNeteaseIdByPr,
	getAccentColor,
	formatTime,
}: NotificationCenterBodyProps) => {
	const { t } = useTranslation();
	const { openFile } = useFileOpener();
	const [neteaseIdDialog, setNeteaseIdDialog] = useState<{
		open: boolean;
		ids: string[];
	}>({ open: false, ids: [] });
	const neteaseIdResolveRef = useRef<((id: string | null) => void) | null>(
		null,
	);
	const closeNeteaseIdDialog = useCallback(() => {
		if (neteaseIdResolveRef.current) {
			neteaseIdResolveRef.current(null);
			neteaseIdResolveRef.current = null;
		}
		setNeteaseIdDialog({ open: false, ids: [] });
	}, []);
	const handleSelectNeteaseId = useCallback((id: string) => {
		if (neteaseIdResolveRef.current) {
			neteaseIdResolveRef.current(id);
			neteaseIdResolveRef.current = null;
		}
		setNeteaseIdDialog({ open: false, ids: [] });
	}, []);
	const requestNeteaseId = useCallback((ids: string[]) => {
		if (ids.length <= 1) {
			return ids[0] ?? null;
		}
		if (neteaseIdResolveRef.current) {
			neteaseIdResolveRef.current(null);
		}
		setNeteaseIdDialog({ open: true, ids });
		return new Promise<string | null>((resolve) => {
			neteaseIdResolveRef.current = resolve;
		});
	}, []);
	useEffect(() => {
		if (!open && neteaseIdDialog.open) {
			closeNeteaseIdDialog();
		}
	}, [closeNeteaseIdDialog, neteaseIdDialog.open, open]);
	const handleOpenUpdate = createReviewUpdateNotificationHandler({
		pat,
		openFile,
		setToolMode,
		pushNotification: setPushNotification,
		neteaseCookie,
		pendingId: audioLoadPendingId,
		setPendingId: setAudioLoadPendingId,
		setLastNeteaseIdByPr,
		selectNeteaseId: requestNeteaseId,
		onClose: () => setOpen(false),
	});

	return (
		<>
			<Dialog.Root open={open} onOpenChange={setOpen}>
				<Dialog.Content maxWidth="720px">
					<motion.div
						layout
						transition={{ type: "spring", stiffness: 500, damping: 40 }}
					>
						<Dialog.Title>
							{t("notificationCenter.title", "通知中心")}
						</Dialog.Title>
						<Dialog.Description size="2" color="gray" mb="3">
							{t(
								"notificationCenter.description",
								"应用内的通知、错误与提醒会显示在这里",
							)}
						</Dialog.Description>

						<AnimatePresence mode="wait" initial={false}>
							{sortedNotifications.length === 0 ? (
								<motion.div
									key="empty"
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: "auto" }}
									exit={{ opacity: 0, height: 0 }}
									transition={{ duration: 0.15 }}
									style={{ overflow: "hidden" }}
								>
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
								</motion.div>
							) : (
								<motion.div
									key="list"
									layout
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: "auto" }}
									exit={{ opacity: 0, height: 0 }}
									transition={{ duration: 0.2 }}
									style={{ overflow: "hidden" }}
								>
									<ScrollArea
										type="auto"
										scrollbars="vertical"
										style={notificationCenterStyles.scrollArea}
									>
										<Flex direction="column" gap="2">
											<AnimatePresence initial={false}>
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
											</AnimatePresence>
										</Flex>
									</ScrollArea>
								</motion.div>
							)}
						</AnimatePresence>

						<motion.div layout>
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
						</motion.div>
					</motion.div>
				</Dialog.Content>
			</Dialog.Root>
			<NeteaseIdSelectDialog
				open={neteaseIdDialog.open}
				ids={neteaseIdDialog.ids}
				onSelect={handleSelectNeteaseId}
				onClose={closeNeteaseIdDialog}
			/>
		</>
	);
};
