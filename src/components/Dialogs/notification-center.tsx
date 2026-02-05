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
import { open } from "@tauri-apps/plugin-shell";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileOpener } from "$/hooks/useFileOpener";
import { openReviewUpdateFromNotification } from "$/modules/github/services/review-update-service";
import { githubPatAtom, neteaseCookieAtom } from "$/modules/settings/states";
import { notificationCenterDialogAtom, reviewReportDialogAtom } from "$/states/dialogs";
import { reviewSessionAtom, toolModeAtom } from "$/states/main";
import {
	clearNotificationsAtom,
	notificationsAtom,
	pushNotificationAtom,
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

const PENDING_UPDATE_NOTIFICATION_PREFIX = "pending-update-";

const isPendingUpdateNotification = (item: AppNotification) =>
	item.id.startsWith(PENDING_UPDATE_NOTIFICATION_PREFIX);

type NotificationRenderEntry =
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

const NotificationEntry = ({
	item,
	onOpenUpdate,
}: {
	item: AppNotification;
	onOpenUpdate: (payload: { prNumber: number; prTitle: string }) => void;
}) => {
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
	const accentColor = levelColorMap[item.level];
	const cardStyle = {
		borderLeft: `3px solid var(--${accentColor}-9)`,
		cursor: canOpenAction ? "pointer" : undefined,
	};
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
		<Card onClick={canOpenAction ? handleOpenAction : undefined} style={cardStyle}>
			<Flex align="start" justify="between" gap="3">
				<Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
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
					<Text size="2" weight="bold" truncate>
						{item.title}
					</Text>
					{item.description && (
						<Text size="1" color="gray" wrap="wrap">
							{item.description}
						</Text>
					)}
				</Flex>
				<Flex direction="column" align="end" gap="2">
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
	);
};

const PendingUpdateGroup = ({
	items,
	onOpenUpdate,
	onClearGroup,
	defaultOpen,
}: {
	items: AppNotification[];
	onOpenUpdate: (payload: { prNumber: number; prTitle: string }) => void;
	onClearGroup: () => void;
	defaultOpen: boolean;
}) => {
	const { t } = useTranslation();
	const [open, setOpen] = useState(defaultOpen);
	const latestCreatedAt = useMemo(() => {
		if (items.length === 0) return "";
		return items
			.map((item) => item.createdAt)
			.sort((a, b) => b.localeCompare(a))[0];
	}, [items]);
	const accentColor = levelColorMap.info;
	return (
		<details
			open={open}
			onToggle={(event) => {
				setOpen(event.currentTarget.open);
			}}
			style={{ width: "100%" }}
		>
			<summary style={{ listStyle: "none", cursor: "pointer" }}>
				<Card style={{ borderLeft: `3px solid var(--${accentColor}-9)` }}>
					<Flex align="start" justify="between" gap="3">
						<Flex align="center" gap="2" style={{ flex: 1, minWidth: 0 }}>
							<Text
								size="2"
								style={{
									display: "inline-block",
									transform: open ? "rotate(90deg)" : "rotate(0deg)",
									transition: "transform 150ms ease",
									color: "var(--gray-10)",
								}}
							>
								▸
							</Text>
							<Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
								<Flex align="center" gap="2" wrap="wrap">
									<Badge size="1" color={accentColor}>
										{t("notificationCenter.level.info", "信息")}
									</Badge>
									<Text size="1" color="gray" wrap="nowrap">
										{t("notificationCenter.pendingUpdateGroup", "待更新PR")}
									</Text>
								</Flex>
								<Flex align="center" gap="2" wrap="wrap">
									<Text size="2" weight="bold">
										{t("notificationCenter.pendingUpdateGroup", "待更新PR")}
									</Text>
									<Text size="1" color="gray" wrap="nowrap">
										{t(
											"notificationCenter.pendingUpdateCount",
											"{count} 条",
											{ count: items.length },
										)}
									</Text>
								</Flex>
							</Flex>
						</Flex>
						<Flex direction="column" align="end" gap="2">
							<Text size="1" color="gray" wrap="nowrap">
								{latestCreatedAt ? formatTime(latestCreatedAt) : ""}
							</Text>
							<Button
								size="1"
								variant="soft"
								color={accentColor}
								onClick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									onClearGroup();
								}}
							>
								{t("notificationCenter.clearGroup", "清除该组")}
							</Button>
						</Flex>
					</Flex>
				</Card>
			</summary>
			<Box mt="2" style={{ paddingLeft: "20px" }}>
				<Flex direction="column" gap="2">
					{items.map((item) => (
						<NotificationEntry
							key={item.id}
							item={item}
							onOpenUpdate={onOpenUpdate}
						/>
					))}
				</Flex>
			</Box>
		</details>
	);
};

export const NotificationCenterDialog = () => {
	const [open, setOpen] = useAtom(notificationCenterDialogAtom);
	const notifications = useAtomValue(notificationsAtom);
	const drafts = useAtomValue(reviewReportDraftsAtom);
	const { t } = useTranslation();
	const { openFile } = useFileOpener();
	const pat = useAtomValue(githubPatAtom);
	const neteaseCookie = useAtomValue(neteaseCookieAtom);
	const setReviewSession = useSetAtom(reviewSessionAtom);
	const setToolMode = useSetAtom(toolModeAtom);
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const clearNotifications = useSetAtom(clearNotificationsAtom);
	const removeNotification = useSetAtom(removeNotificationAtom);
	const [audioLoadPendingId, setAudioLoadPendingId] = useState<string | null>(
		null,
	);
	const [, setLastNeteaseIdByPr] = useState<Record<number, string>>({});
	const draftIdSet = useMemo(() => new Set(drafts.map((d) => d.id)), [drafts]);
	const filteredNotifications = useMemo(() => {
		return notifications.filter((notification) => {
			if (notification.action?.type === "open-review-report") {
				const draftId = notification.action.payload.draftId;
				return draftIdSet.has(draftId);
			}
			return true;
		});
	}, [draftIdSet, notifications]);
	const pendingUpdateNotifications = useMemo(
		() => filteredNotifications.filter(isPendingUpdateNotification),
		[filteredNotifications],
	);
	const sortedNotifications = useMemo<NotificationRenderEntry[]>(() => {
		const sorted = [...filteredNotifications].sort((a, b) => {
			const pinnedDelta = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
			if (pinnedDelta !== 0) return pinnedDelta;
			return b.createdAt.localeCompare(a.createdAt);
		});
		if (pendingUpdateNotifications.length < 2) {
			return sorted.map(
				(item): NotificationRenderEntry => ({ type: "single", item }),
			);
		}
		const pendingIdSet = new Set(
			pendingUpdateNotifications.map((item) => item.id),
		);
		const nonPending = sorted.filter((item) => !pendingIdSet.has(item.id));
		const pendingSorted = [...pendingUpdateNotifications].sort((a, b) =>
			b.createdAt.localeCompare(a.createdAt),
		);
		const groupEntry: NotificationRenderEntry = {
			type: "group",
			items: pendingSorted,
			createdAt: pendingSorted[0]?.createdAt ?? "",
			pinned: true,
		};
		const entries: NotificationRenderEntry[] = [
			groupEntry,
			...nonPending.map(
				(item): NotificationRenderEntry => ({ type: "single", item }),
			),
		];
		return entries.sort((a, b) => {
			const pinnedDelta =
				Number(a.type === "group" ? a.pinned : Boolean(a.item.pinned)) -
				Number(b.type === "group" ? b.pinned : Boolean(b.item.pinned));
			if (pinnedDelta !== 0) return -pinnedDelta;
			const createdAtA =
				a.type === "group" ? a.createdAt : a.item.createdAt;
			const createdAtB =
				b.type === "group" ? b.createdAt : b.item.createdAt;
			return createdAtB.localeCompare(createdAtA);
		});
	}, [filteredNotifications, pendingUpdateNotifications]);
	const hasDismissible = useMemo(
		() => filteredNotifications.some((item) => item.dismissible !== false),
		[filteredNotifications],
	);
	const handleOpenUpdate = useCallback(
		async (payload: { prNumber: number; prTitle: string }) => {
			const token = pat.trim();
			if (!token) {
				setPushNotification({
					title: "请先在设置中登录以打开文件",
					level: "error",
					source: "review",
				});
				return;
			}
			try {
				await openReviewUpdateFromNotification({
					token,
					prNumber: payload.prNumber,
					prTitle: payload.prTitle,
					openFile,
					setToolMode,
					setReviewSession,
					pushNotification: setPushNotification,
					neteaseCookie,
					pendingId: audioLoadPendingId,
					setPendingId: setAudioLoadPendingId,
					setLastNeteaseIdByPr,
				});
				setOpen(false);
			} catch {
				setPushNotification({
					title: "打开 PR 文件失败",
					level: "error",
					source: "review",
				});
			}
		},
		[
			audioLoadPendingId,
			neteaseCookie,
			openFile,
			pat,
			setOpen,
			setPushNotification,
			setReviewSession,
			setToolMode,
		],
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
										/>
									);
								}
								return (
									<NotificationEntry
										key={entry.item.id}
										item={entry.item}
										onOpenUpdate={handleOpenUpdate}
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
