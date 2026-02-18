/*
 * Copyright 2023-2025 Steve Xiao (stevexmh@qq.com) and contributors.
 *
 * 本源代码文件是属于 AMLL TTML Tool 项目的一部分。
 * This source code file is a part of AMLL TTML Tool project.
 * 本项目的源代码的使用受到 GNU GENERAL PUBLIC LICENSE version 3 许可证的约束，具体可以参阅以下链接。
 * Use of this source code is governed by the GNU GPLv3 license that can be found through the following link.
 *
 * https://github.com/Steve-xmh/amll-ttml-tool/blob/main/LICENSE
 */

import {
	Box,
	Button,
	Checkbox,
	DropdownMenu,
	Flex,
	Grid,
	Text,
} from "@radix-ui/themes";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { forwardRef, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	githubAmlldbAccessAtom,
	githubLoginAtom,
	githubPatAtom,
	lyricsSiteTokenAtom,
	lyricsSiteUserAtom,
	reviewHiddenLabelsAtom,
	reviewLabelsAtom,
	reviewPendingFilterAtom,
	reviewRefreshTokenAtom,
	reviewSelectedLabelsAtom,
	reviewUpdatedFilterAtom,
	type ReviewLabel,
} from "$/modules/settings/states";
import { settingsDialogAtom, settingsTabAtom } from "$/states/dialogs";
import { RibbonFrame, RibbonSection } from "./common";

export type ContentSource = "github" | "lyrics-site";

const REPO_OWNER = "Steve-xmh";
type GithubUser = {
	login?: string;
	avatar_url?: string;
	name?: string | null;
};

export const ReviewModeRibbonBar = forwardRef<HTMLDivElement>(
	(_props, ref) => {
		const pat = useAtomValue(githubPatAtom);
		const login = useAtomValue(githubLoginAtom);
		const hasAccess = useAtomValue(githubAmlldbAccessAtom);
		const lyricsSiteToken = useAtomValue(lyricsSiteTokenAtom);
		const lyricsSiteUser = useAtomValue(lyricsSiteUserAtom);
		const hiddenLabels = useAtomValue(reviewHiddenLabelsAtom);
		const labels = useAtomValue(reviewLabelsAtom);
		const { t } = useTranslation();

		const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
		const [displayName, setDisplayName] = useState<string>("");
		const [selectedLabels, setSelectedLabels] = useAtom(
			reviewSelectedLabelsAtom,
		);
		const [pendingChecked, setPendingChecked] = useAtom(reviewPendingFilterAtom);
		const [updatedChecked, setUpdatedChecked] = useAtom(reviewUpdatedFilterAtom);
		const setSettingsDialogOpen = useSetAtom(settingsDialogAtom);
		const setSettingsTab = useSetAtom(settingsTabAtom);
		const bumpRefreshToken = useSetAtom(reviewRefreshTokenAtom);
		const [avatarActive, setAvatarActive] = useState(false);
		const avatarActiveTimerRef = useRef<number | null>(null);

		const idPending = useId();
		const idUpdated = useId();

		// 登录状态
		const isGithubLoggedIn = !!pat.trim() && !!login.trim();
		const isLyricsSiteLoggedIn = !!lyricsSiteToken && !!lyricsSiteUser;
		const hasLyricsSiteReviewPermission = lyricsSiteUser?.reviewPermission === 1;

		// 内容来源状态
		const [contentSource, setContentSource] = useState<ContentSource>(() => {
			if (isLyricsSiteLoggedIn && hasLyricsSiteReviewPermission) return "lyrics-site";
			if (isGithubLoggedIn && hasAccess) return "github";
			return "lyrics-site";
		});

		// 是否需要显示下拉菜单
		const showSourceSelector = isGithubLoggedIn && isLyricsSiteLoggedIn;

		const identityLabel = useMemo(() => {
			if (!login) return t("ribbonBar.reviewMode.identityUnknown", "未知身份");
			if (login.toLowerCase() === REPO_OWNER.toLowerCase())
				return t("ribbonBar.reviewMode.identityOwner", "所有者");
			if (hasAccess)
				return t("ribbonBar.reviewMode.identityCollaborator", "协作者");
			return t("ribbonBar.reviewMode.identityUnknown", "未知身份");
		}, [hasAccess, login, t]);

		const hiddenLabelSet = useMemo(() => {
			return new Set(
				hiddenLabels
					.map((label) => label.trim().toLowerCase())
					.filter((label) => label.length > 0),
			);
		}, [hiddenLabels]);

		useEffect(() => {
			return () => {
				if (avatarActiveTimerRef.current) {
					window.clearTimeout(avatarActiveTimerRef.current);
				}
			};
		}, []);

		useEffect(() => {
			let cancelled = false;
			const trimmedPat = pat.trim();
			const trimmedLogin = login.trim();
			if (!trimmedPat && !trimmedLogin) {
				setAvatarUrl(null);
				setDisplayName("");
				return;
			}

			const loadUser = async () => {
				try {
					const url = trimmedPat
						? "https://api.github.com/user"
						: `https://api.github.com/users/${trimmedLogin}`;
					const response = await fetch(url, {
						headers: trimmedPat
							? {
									Accept: "application/vnd.github+json",
									Authorization: `Bearer ${trimmedPat}`,
								}
							: {
									Accept: "application/vnd.github+json",
								},
					});
					if (!response.ok) {
						if (!cancelled) {
							setAvatarUrl(null);
							setDisplayName("");
						}
						return;
					}
					const userData = (await response.json()) as GithubUser;
					if (cancelled) return;
					setAvatarUrl(userData.avatar_url ?? null);
					setDisplayName(userData.name?.trim() || userData.login || "");
				} catch {
					if (!cancelled) {
						setAvatarUrl(null);
						setDisplayName("");
					}
				}
			};

			loadUser();

			return () => {
				cancelled = true;
			};
		}, [login, pat]);

		useEffect(() => {
			if (!hasAccess || labels.length === 0) {
				setSelectedLabels([]);
			}
		}, [hasAccess, labels.length, setSelectedLabels]);

		useEffect(() => {
			if (hiddenLabelSet.size === 0) return;
			setSelectedLabels((prev) =>
				prev.filter((label) => !hiddenLabelSet.has(label.toLowerCase())),
			);
		}, [hiddenLabelSet, setSelectedLabels]);

		const resolvedLogin = login || displayName;
		const avatarFallback = resolvedLogin?.trim().slice(0, 1).toUpperCase() || "?";

		const toggleLabel = (name: string) => {
			setSelectedLabels((prev) =>
				prev.includes(name)
					? prev.filter((label) => label !== name)
					: [...prev, name],
			);
		};

		const handleAvatarClick = () => {
			if (avatarActiveTimerRef.current) {
				window.clearTimeout(avatarActiveTimerRef.current);
			}
			setAvatarActive(true);
			avatarActiveTimerRef.current = window.setTimeout(() => {
				setAvatarActive(false);
			}, 700);
			const trimmedPat = pat.trim();
			const trimmedLogin = login.trim();
			if (trimmedPat && !trimmedLogin) {
				setSettingsTab("connect");
				setSettingsDialogOpen(true);
				return;
			}
			if (trimmedLogin) {
				bumpRefreshToken((prev) => prev + 1);
			}
		};

		const visibleLabels = useMemo(
			() =>
				(labels as ReviewLabel[]).filter(
					(label) => !hiddenLabelSet.has(label.name.toLowerCase()),
				),
			[hiddenLabelSet, labels],
		);

		// 获取当前显示的用户信息
		const currentUserInfo = useMemo(() => {
			if (contentSource === "lyrics-site" && isLyricsSiteLoggedIn && lyricsSiteUser) {
				return {
					source: "lyrics-site" as ContentSource,
					avatarUrl: lyricsSiteUser.avatarUrl,
					displayName: lyricsSiteUser.displayName,
					username: lyricsSiteUser.username,
					hasPermission: lyricsSiteUser.reviewPermission === 1,
					permissionLabel: "审核员",
				};
			}
			return {
				source: "github" as ContentSource,
				avatarUrl: avatarUrl,
				displayName: displayName || login || "GitHub",
				username: login,
				hasPermission: hasAccess,
				permissionLabel: hasAccess
					? login.toLowerCase() === REPO_OWNER.toLowerCase()
						? "所有者"
						: "协作者"
					: "未知身份",
			};
		}, [contentSource, isLyricsSiteLoggedIn, lyricsSiteUser, avatarUrl, displayName, login, hasAccess]);

		const currentAvatarFallback = currentUserInfo.displayName?.trim().slice(0, 1).toUpperCase() || "?";

		return (
			<RibbonFrame ref={ref}>
				<RibbonSection label={t("ribbonBar.reviewMode.avatar", "头像")}>
					<Box
						style={{
							width: "42px",
							height: "42px",
							borderRadius: "999px",
							overflow: "hidden",
							backgroundColor: "var(--gray-a3)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							cursor: "pointer",
							boxShadow: avatarActive
								? "0 0 0 2px var(--accent-9)"
								: "0 0 0 0 transparent",
							transition: "box-shadow 150ms ease-out",
						}}
						onClick={handleAvatarClick}
					>
						{showSourceSelector ? (
							currentUserInfo.avatarUrl ? (
								<img
									src={currentUserInfo.avatarUrl}
									alt={currentUserInfo.displayName || "avatar"}
									style={{
										width: "100%",
										height: "100%",
										objectFit: "cover",
									}}
								/>
							) : (
								<Text size="2" weight="medium">
									{currentAvatarFallback}
								</Text>
							)
						) : avatarUrl ? (
							<img
								src={avatarUrl}
								alt={resolvedLogin || "avatar"}
								style={{
									width: "100%",
									height: "100%",
									objectFit: "cover",
								}}
							/>
						) : (
							<Text size="2" weight="medium">
								{avatarFallback}
							</Text>
						)}
					</Box>
				</RibbonSection>
				<RibbonSection label={t("ribbonBar.reviewMode.user", "用户")}>
					{showSourceSelector ? (
						<Flex direction="column" gap="1" align="start">
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									<Button variant="ghost" size="2" style={{ padding: 0, height: "auto" }}>
										<Flex align="center" gap="1">
											<Text weight="medium">{currentUserInfo.displayName}</Text>
											<DropdownMenu.TriggerIcon />
										</Flex>
									</Button>
								</DropdownMenu.Trigger>
								<DropdownMenu.Content>
									<DropdownMenu.Item
										onSelect={() => setContentSource("lyrics-site")}
										disabled={!isLyricsSiteLoggedIn}
									>
										<Flex align="center" gap="2">
											<Box
												style={{
													width: "8px",
													height: "8px",
													borderRadius: "999px",
													backgroundColor:
														contentSource === "lyrics-site"
															? "var(--green-9)"
															: "var(--gray-6)",
												}}
											/>
											<Text>歌词站</Text>
										</Flex>
									</DropdownMenu.Item>
									<DropdownMenu.Item
										onSelect={() => setContentSource("github")}
										disabled={!isGithubLoggedIn}
									>
										<Flex align="center" gap="2">
											<Box
												style={{
													width: "8px",
													height: "8px",
													borderRadius: "999px",
													backgroundColor:
														contentSource === "github"
															? "var(--green-9)"
															: "var(--gray-6)",
												}}
											/>
											<Text>GitHub</Text>
										</Flex>
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
							<Text size="1" color="gray">
							{currentUserInfo.username
								? `@${currentUserInfo.username}`
								: currentUserInfo.permissionLabel}
							{currentUserInfo.hasPermission && (
								<span style={{ color: "var(--green-9)", marginLeft: "8px" }}>
									{currentUserInfo.permissionLabel}
								</span>
							)}
						</Text>
						</Flex>
					) : (
						<Flex direction="column" gap="1" align="start">
							<Text size="2" weight="medium">
								{resolvedLogin || t("ribbonBar.reviewMode.noLogin", "未登录")}
							</Text>
							<Text size="1" color="gray">
								{identityLabel}
							</Text>
						</Flex>
					)}
				</RibbonSection>
				<RibbonSection label={t("ribbonBar.reviewMode.status", "状态")}>
					<Grid columns="1fr auto" gapX="4" gapY="1" align="center">
						<Text size="1" asChild>
							<label htmlFor={idPending}>
								{t("ribbonBar.reviewMode.pending", "待更新")}
							</label>
						</Text>
						<Checkbox
							id={idPending}
							checked={pendingChecked}
							onCheckedChange={(value) => setPendingChecked(Boolean(value))}
						/>
						<Text size="1" asChild>
							<label htmlFor={idUpdated}>
								{t("ribbonBar.reviewMode.updated", "已更新")}
							</label>
						</Text>
						<Checkbox
							id={idUpdated}
							checked={updatedChecked}
							onCheckedChange={(value) => setUpdatedChecked(Boolean(value))}
						/>
					</Grid>
				</RibbonSection>
				<RibbonSection label={t("ribbonBar.reviewMode.labels", "标签")}>
					<Box
						style={{
							display: "grid",
							gridAutoFlow: "column",
							gridTemplateRows: "repeat(2, auto)",
							gridAutoColumns: "max-content",
							columnGap: "var(--space-2)",
							rowGap: "var(--space-2)",
							width: "100%",
							maxWidth: "100%",
							maxHeight: "72px",
							overflow: "hidden",
							alignContent: "flex-start",
						}}
					>
						{visibleLabels.length === 0 ? (
							<Text size="1" color="gray">
								{t("ribbonBar.reviewMode.noLabels", "暂无标签")}
							</Text>
						) : (
							visibleLabels.map((label) => {
								const isSelected = selectedLabels.includes(label.name);
								return (
									<Button
										key={label.name}
										size="1"
										variant={isSelected ? "solid" : "soft"}
										color={isSelected ? "blue" : "gray"}
										onClick={() => toggleLabel(label.name)}
									>
										<Flex align="center" gap="2">
											<Box
												style={{
													width: "8px",
													height: "8px",
													borderRadius: "999px",
													backgroundColor: `#${label.color}`,
												}}
											/>
											<Text size="1" weight="medium">
												{label.name}
											</Text>
										</Flex>
									</Button>
								);
							})
						)}
					</Box>
				</RibbonSection>
			</RibbonFrame>
		);
	},
);

export default ReviewModeRibbonBar;
