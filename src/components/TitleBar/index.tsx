import { Alert20Regular, Beaker24Regular } from "@fluentui/react-icons";
import { Button, Flex, SegmentedControl, Text } from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import WindowControls from "$/components/WindowControls";
import { useReviewTitleBar } from "$/modules/review/modals/useReviewTimingFlow.tsx";
import { requestFileUpdatePush } from "$/modules/user/services/request-file-update-push";
import { githubAmlldbAccessAtom, githubPatAtom, lyricsSiteUserAtom } from "$/modules/settings/states";
import { notificationCenterDialogAtom, confirmDialogAtom } from "$/states/dialogs";
import {
	type AppNotification,
	notificationsAtom,
	pushNotificationAtom,
} from "$/states/notifications";
import {
	keySwitchEditModeAtom,
	keySwitchPreviewModeAtom,
	keySwitchSyncModeAtom,
} from "$/states/keybindings.ts";
import {
	fileUpdateSessionAtom,
	lyricLinesAtom,
	selectedLinesAtom,
	selectedWordsAtom,
	ToolMode,
	toolModeAtom,
} from "$/states/main.ts";
import { useKeyBindingAtom } from "$/utils/keybindings.ts";
import { log } from "$/utils/logging";
import { ReviewActionGroup } from "./modals/ReviewActionGroup";
import { TopMenu } from "../TopMenu/index.tsx";
import styles from "./index.module.css";

const levelColorMap: Record<AppNotification["level"], "blue" | "yellow" | "red" | "green"> =
	{
		info: "blue",
		warning: "yellow",
		error: "red",
		success: "green",
	};

export const TitleBar: FC = () => {
	const [toolMode, setToolMode] = useAtom(toolModeAtom);
	const setSelectedLines = useSetImmerAtom(selectedLinesAtom);
	const setSelectedWords = useSetImmerAtom(selectedWordsAtom);
	const githubCanReview = useAtomValue(githubAmlldbAccessAtom);
	const lyricsSiteUser = useAtomValue(lyricsSiteUserAtom);
	const lyricsSiteCanReview = lyricsSiteUser?.reviewPermission === 1;
	const canReview = githubCanReview || lyricsSiteCanReview;
	const pat = useAtomValue(githubPatAtom);
	const lyricLines = useAtomValue(lyricLinesAtom);
	const fileUpdateSession = useAtomValue(fileUpdateSessionAtom);
	const setFileUpdateSession = useSetAtom(fileUpdateSessionAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const [notificationCenterOpen, setNotificationCenterOpen] = useAtom(
		notificationCenterDialogAtom,
	);
	const { t } = useTranslation();
	const { dialogs: reviewDialogs, actionGroup: reviewActionGroup, reviewSession } =
		useReviewTitleBar({ actionGroupClassName: styles.reviewActionGroup });

	const notifications = useAtomValue(notificationsAtom);
	const [latestNotification, setLatestNotification] =
		useState<AppNotification | null>(null);
	const [showNotificationContent, setShowNotificationContent] = useState(false);
	const [hasUnread, setHasUnread] = useState(false);
	const lastNotificationIdRef = useRef<string | null>(null);
	const shouldHighlightNotification = showNotificationContent || hasUnread;
	const notificationAccentColor = latestNotification
		? levelColorMap[latestNotification.level]
		: undefined;

	useEffect(() => {
		if (notifications.length > 0) {
			const latest = notifications[0];
			if (latest.id !== lastNotificationIdRef.current) {
				lastNotificationIdRef.current = latest.id;

				if (!notificationCenterOpen) {
					setLatestNotification(latest);
					setShowNotificationContent(true);
					setHasUnread(true);
				}
			}
		}
	}, [notifications, notificationCenterOpen]);

	useEffect(() => {
		if (!showNotificationContent || notificationCenterOpen) {
			return;
		}
		const timer = setTimeout(() => {
			setShowNotificationContent(false);
		}, 5000);
		return () => clearTimeout(timer);
	}, [notificationCenterOpen, showNotificationContent]);

	useEffect(() => {
		if (notificationCenterOpen) {
			setHasUnread(false);
			setShowNotificationContent(false);
		}
	}, [notificationCenterOpen]);

	const onSwitchEditMode = useCallback(() => {
		setToolMode(ToolMode.Edit);
	}, [setToolMode]);
	const onSwitchSyncMode = useCallback(() => {
		setToolMode(ToolMode.Sync);
	}, [setToolMode]);
	const onSwitchPreviewMode = useCallback(() => {
		setToolMode(ToolMode.Preview);
	}, [setToolMode]);

	useKeyBindingAtom(keySwitchEditModeAtom, onSwitchEditMode);
	useKeyBindingAtom(keySwitchSyncModeAtom, onSwitchSyncMode);
	useKeyBindingAtom(keySwitchPreviewModeAtom, onSwitchPreviewMode);

	useEffect(() => {
		if (!canReview && toolMode === ToolMode.Review) {
			setToolMode(ToolMode.Edit);
		}
	}, [canReview, toolMode, setToolMode]);

	const onUpdateComplete = useCallback(() => {
		if (!fileUpdateSession) return;
		requestFileUpdatePush({
			token: pat,
			session: fileUpdateSession,
			lyric: lyricLines,
			setConfirmDialog,
			pushNotification: setPushNotification,
			onAfterPush: () => {
				setFileUpdateSession(null);
				log(`已结束更新会话 PR #${fileUpdateSession.prNumber}`);
			},
			onSuccess: () => {
				setPushNotification({
					title: "更新推送成功",
					level: "success",
					source: "user-PR-update",
				});
			},
			onFailure: (message, url) => {
				setPushNotification({
					title: message || "更新推送失败",
					level: "error",
					source: "user-PR-update",
					action: {
						type: "open-url",
						payload: { url },
					},
				});
			},
			onError: () => {
				setPushNotification({
					title: "推送更新失败",
					level: "error",
					source: "user-PR-update",
				});
			},
		});
	}, [
		fileUpdateSession,
		lyricLines,
		pat,
		setConfirmDialog,
		setFileUpdateSession,
		setPushNotification,
	]);

	const onUpdateCancel = useCallback(() => {
		if (!fileUpdateSession) return;
		setFileUpdateSession(null);
		log(`已结束更新会话 PR #${fileUpdateSession.prNumber}`);
	}, [fileUpdateSession, setFileUpdateSession]);

	const updateActionGroup = fileUpdateSession ? (
		<ReviewActionGroup
			className={styles.reviewActionGroup}
			onComplete={onUpdateComplete}
			onCancel={onUpdateCancel}
		/>
	) : null;

	const actionGroup = updateActionGroup ?? reviewActionGroup;

	return (
		<>
			{reviewDialogs}
			<WindowControls
				startChildren={<TopMenu />}
				titleChildren={
					<SegmentedControl.Root
						value={toolMode}
						onValueChange={(v) => setToolMode(v as ToolMode)}
						className={styles.modeSwitch}
					>
						<SegmentedControl.Item value={ToolMode.Edit}>
							{t("topBar.modeBtns.edit", "编辑")}
						</SegmentedControl.Item>
						<SegmentedControl.Item value={ToolMode.Sync}>
							{t("topBar.modeBtns.sync", "打轴")}
						</SegmentedControl.Item>
						<SegmentedControl.Item value={ToolMode.Preview}>
							{t("topBar.modeBtns.preview", "预览")}
						</SegmentedControl.Item>
						{canReview && (
							<SegmentedControl.Item
								value={ToolMode.Review}
								className={reviewSession ? styles.reviewMenuItem : undefined}
							>
								{t("topBar.modeBtns.review", "审阅")}
							</SegmentedControl.Item>
						)}
					</SegmentedControl.Root>
				}
				endChildren={
					<Flex
						align="center"
						gap="2"
						style={{ marginRight: "12px", height: "32px" }}
					>
						{!import.meta.env.TAURI_ENV_PLATFORM && (
							<>
								<AnimatePresence>
									{!showNotificationContent && (
										<motion.div
											initial={{ opacity: 0, width: 0 }}
											animate={{ opacity: 1, width: "auto" }}
											exit={{ opacity: 0, width: 0 }}
											transition={{
												type: "spring",
												stiffness: 500,
												damping: 30,
											}}
											style={{ overflow: "hidden", whiteSpace: "nowrap" }}
										>
											<Text color="gray" wrap="nowrap" size="2">
												<Flex align="center" gap="2">
														{actionGroup}
													<span className={styles.title}>
														{t(
															"topBar.appName",
															"Apple Music-like Lyrics TTML Tool",
														)}
													</span>
												</Flex>
											</Text>
										</motion.div>
									)}
								</AnimatePresence>
								<motion.div
									layout
									initial={false}
									transition={{
										type: "spring",
										stiffness: 500,
										damping: 30,
									}}
									style={{
										width: showNotificationContent ? 360 : undefined,
										maxWidth: 360,
										overflow: "hidden",
										flexShrink: 0,
									}}
								>
									<Button
										asChild
										variant={
											showNotificationContent || hasUnread ? "solid" : "soft"
										}
										color={
											shouldHighlightNotification
												? notificationAccentColor
												: undefined
										}
										size="1"
										style={{
											marginLeft: "8px",
											overflow: "hidden",
											height: "32px",
											width: showNotificationContent ? "100%" : undefined,
											justifyContent: showNotificationContent
												? "flex-start"
												: undefined,
										}}
										onClick={() => setNotificationCenterOpen(true)}
									>
										<motion.button
											layout
											initial={false}
											transition={{
												type: "spring",
												stiffness: 500,
												damping: 30,
											}}
											style={{
												height: "32px",
												display: "flex",
												alignItems: "center",
												gap: "6px",
												overflow: "hidden",
											}}
										>
											<Alert20Regular />
											<AnimatePresence mode="wait" initial={false}>
												{showNotificationContent ? (
													<motion.span
														key="content"
														initial={{ opacity: 0, y: 10 }}
														animate={{ opacity: 1, y: 0 }}
														exit={{ opacity: 0, y: -10 }}
														style={{
															overflow: "hidden",
															textOverflow: "ellipsis",
															whiteSpace: "nowrap",
															display: "inline-block",
															maxWidth: "100%",
														}}
													>
														{latestNotification?.title}
													</motion.span>
												) : (
													<motion.span
														key="default"
														initial={{ opacity: 0, y: -10 }}
														animate={{ opacity: 1, y: 0 }}
														exit={{ opacity: 0, y: 10 }}
													>
														{t("topBar.notificationCenter", "通知中心")}
													</motion.span>
												)}
											</AnimatePresence>
										</motion.button>
									</Button>
								</motion.div>
								<Button
									asChild
									variant="soft"
									size="1"
									style={{ marginLeft: "10px", borderRadius: "999px" }}
								>
									<a
										href="https://github.com/Xionghaizi001/amll-ttml-tool/tree/amll-ttml-tool-test"
										target="_blank"
										rel="noreferrer"
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: "4px",
											padding: "2px 8px",
										}}
									>
										<Beaker24Regular style={{ fontSize: 16 }} />
										<Text size="1" weight="medium">
											TEST
										</Text>
									</a>
								</Button>
							</>
						)}
					</Flex>
				}
				onSpacerClicked={() => {
					setSelectedLines((o) => o.clear());
					setSelectedWords((o) => o.clear());
				}}
			/>
		</>
	);
};
