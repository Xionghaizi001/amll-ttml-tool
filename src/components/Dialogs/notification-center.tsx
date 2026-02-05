import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useMemo, useState } from "react";
import { githubPatAtom, neteaseCookieAtom } from "$/modules/settings/states";
import { notificationCenterDialogAtom } from "$/states/dialogs";
import { reviewSessionAtom, toolModeAtom } from "$/states/main";
import {
	clearNotificationsAtom,
	notificationsAtom,
	pushNotificationAtom,
	removeNotificationAtom,
	type AppNotification,
} from "$/states/notifications";
import { reviewReportDraftsAtom } from "$/states/main";
import {
	NotificationCenterBody,
	type NotificationRenderEntry,
} from "./modals/notification-center-body";

const levelColorMap: Record<AppNotification["level"], "blue" | "yellow" | "red" | "green"> =
	{
		info: "blue",
		warning: "yellow",
		error: "red",
		success: "green",
	};

const PENDING_UPDATE_NOTIFICATION_PREFIX = "pending-update-";

const isPendingUpdateNotification = (item: AppNotification) =>
	item.id.startsWith(PENDING_UPDATE_NOTIFICATION_PREFIX);

export const NotificationCenterDialog = () => {
	const [open, setOpen] = useAtom(notificationCenterDialogAtom);
	const notifications = useAtomValue(notificationsAtom);
	const drafts = useAtomValue(reviewReportDraftsAtom);
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
	const formatTime = (value: string) => {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleString();
	};
	const getAccentColor = (level: AppNotification["level"]) => levelColorMap[level];

	return (
		<NotificationCenterBody
			open={open}
			setOpen={setOpen}
			sortedNotifications={sortedNotifications}
			removeNotification={removeNotification}
			clearNotifications={clearNotifications}
			hasDismissible={hasDismissible}
			pat={pat}
			neteaseCookie={neteaseCookie}
			setToolMode={setToolMode}
			setReviewSession={setReviewSession}
			setPushNotification={setPushNotification}
			audioLoadPendingId={audioLoadPendingId}
			setAudioLoadPendingId={setAudioLoadPendingId}
			setLastNeteaseIdByPr={setLastNeteaseIdByPr}
			getAccentColor={getAccentColor}
			formatTime={formatTime}
		/>
	);
};
