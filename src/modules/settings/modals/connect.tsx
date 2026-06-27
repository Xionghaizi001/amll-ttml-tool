/** @jsxRuntime classic */
import {
	ChevronRight24Regular,
	Person24Regular,
	Tag24Regular,
} from "@fluentui/react-icons";
import { Box, Button, Flex, IconButton, Text, TextField } from "@radix-ui/themes";
import { useAtom, useAtomValue } from "jotai";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { GithubLoginCard } from "$/modules/github/modals/GithubLoginCard";
import { LyricsSiteLoginCard } from "$/modules/lyrics-site/modals/LyricsSiteLoginCard";
import { NeteaseLoginCard } from "$/modules/ncm/modals/NeteaseLoginCard";
import { lyricsSiteUserAtom } from "$/modules/review/services/remote-service";
import {
	githubAmlldbAccessAtom,
	githubLoginAtom,
	reviewHiddenLabelsAtom,
	reviewHiddenUsersAtom,
	reviewHiddenUsersModeAtom,
	type ReviewLabel,
	reviewLabelsAtom,
} from "$/modules/settings/states";
import styles from "./SettingsDialog.module.css";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";

export type SettingsConnectSubpage =
	| "reviewHiddenLabels"
	| "reviewHiddenUsers";

const SettingsConnectSubpageEntry = ({
	icon,
	title,
	description,
	onOpen,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	onOpen: () => void;
}) => (
	<SettingsRow
		icon={icon}
		title={title}
		description={description}
		action={
			<IconButton variant="ghost" aria-label={title} onClick={onOpen}>
				<ChevronRight24Regular />
			</IconButton>
		}
	/>
);

const SettingsConnectReviewHiddenLabelsPage = () => {
	const { t } = useTranslation();
	const [hiddenLabels, setHiddenLabels] = useAtom(reviewHiddenLabelsAtom);
	const labels = useAtomValue(reviewLabelsAtom);

	const hiddenLabelSet = React.useMemo(
		() =>
			new Set(
				hiddenLabels
					.map((label: string) => label.trim().toLowerCase())
					.filter((label: string) => label.length > 0),
			),
		[hiddenLabels],
	);

	const visibleLabels = React.useMemo(
		() =>
			labels.filter(
				(label: ReviewLabel) => !hiddenLabelSet.has(label.name.toLowerCase()),
			),
		[hiddenLabelSet, labels],
	);

	const hiddenLabelList = React.useMemo(
		() =>
			labels.filter((label: ReviewLabel) =>
				hiddenLabelSet.has(label.name.toLowerCase()),
			),
		[hiddenLabelSet, labels],
	);

	const hideLabel = React.useCallback(
		(name: string) => {
			setHiddenLabels((prev: string[]) => {
				if (
					prev.some((item: string) => item.toLowerCase() === name.toLowerCase())
				) {
					return prev;
				}
				return [...prev, name];
			});
		},
		[setHiddenLabels],
	);

	const showLabel = React.useCallback(
		(name: string) => {
			setHiddenLabels((prev: string[]) =>
				prev.filter((item: string) => item.toLowerCase() !== name.toLowerCase()),
			);
		},
		[setHiddenLabels],
	);

	return (
		<Flex direction="column" gap="4">
			<SettingsGroup>
				<div className={styles.connectSubpageContent}>
					<Text size="2" color="gray">
						{t(
							"settings.connect.reviewHiddenLabelsDesc",
							"点击标签可在未隐藏与已隐藏之间切换",
						)}
					</Text>

					<Flex gap="4" wrap="wrap">
						<Flex direction="column" gap="2" style={{ minWidth: "240px" }}>
							<Text size="1" color="gray">
								{t("settings.connect.reviewHiddenLabelsVisible", "未隐藏")}
							</Text>
							<Flex gap="2" wrap="wrap">
								{visibleLabels.length === 0 ? (
									<Text size="1" color="gray">
										{t("settings.connect.reviewHiddenLabelsEmpty", "暂无标签")}
									</Text>
								) : (
									visibleLabels.map((label: ReviewLabel) => (
										<Button
											key={`visible-${label.name}`}
											size="1"
											variant="soft"
											color="gray"
											onClick={() => hideLabel(label.name)}
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
									))
								)}
							</Flex>
						</Flex>

						<Flex direction="column" gap="2" style={{ minWidth: "240px" }}>
							<Text size="1" color="gray">
								{t("settings.connect.reviewHiddenLabelsHidden", "已隐藏")}
							</Text>
							<Flex gap="2" wrap="wrap">
								{hiddenLabelList.length === 0 ? (
									<Text size="1" color="gray">
										{t("settings.connect.reviewHiddenLabelsNone", "暂无隐藏标签")}
									</Text>
								) : (
									hiddenLabelList.map((label: ReviewLabel) => (
										<Button
											key={`hidden-${label.name}`}
											size="1"
											variant="soft"
											color="red"
											onClick={() => showLabel(label.name)}
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
									))
								)}
							</Flex>
						</Flex>
					</Flex>
				</div>
			</SettingsGroup>
		</Flex>
	);
};

const SettingsConnectReviewHiddenUsersPage = () => {
	const { t } = useTranslation();
	const [hiddenUsers, setHiddenUsers] = useAtom(reviewHiddenUsersAtom);
	const [hiddenUsersMode, setHiddenUsersMode] = useAtom(
		reviewHiddenUsersModeAtom,
	);
	const [newHiddenUser, setNewHiddenUser] = React.useState("");

	const addHiddenUser = React.useCallback(() => {
		const trimmed = newHiddenUser.trim();
		if (!trimmed) return;
		setHiddenUsers((prev: string[]) => {
			if (
				prev.some(
					(user: string) => user.toLowerCase() === trimmed.toLowerCase(),
				)
			) {
				return prev;
			}
			return [...prev, trimmed];
		});
		setNewHiddenUser("");
	}, [newHiddenUser, setHiddenUsers]);

	const removeHiddenUser = React.useCallback(
		(name: string) => {
			setHiddenUsers((prev: string[]) =>
				prev.filter((user: string) => user.toLowerCase() !== name.toLowerCase()),
			);
		},
		[setHiddenUsers],
	);

	return (
		<Flex direction="column" gap="4">
			<SettingsGroup>
				<div className={styles.connectSubpageContent}>
					<Text size="2" color="gray">
						{t(
							"settings.connect.reviewHiddenUsersDesc",
							"稿件所属用户在隐藏列表中时，该稿件不会在审阅页面显示",
						)}
					</Text>

					<Flex align="center" gap="2">
						<TextField.Root
							placeholder={t(
								"settings.connect.reviewHiddenUsersPlaceholder",
								"输入 GitHub 或歌词站用户名",
							)}
							value={newHiddenUser}
							onChange={(event) => setNewHiddenUser(event.currentTarget.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") addHiddenUser();
							}}
							autoComplete="off"
							style={{ flex: 1 }}
						/>
						<Button
							size="2"
							variant="soft"
							onClick={addHiddenUser}
							disabled={!newHiddenUser.trim()}
						>
							{t("settings.connect.reviewHiddenUsersAdd", "添加")}
						</Button>
					</Flex>

					{hiddenUsers.length > 0 && (
						<Flex gap="2" wrap="wrap" align="center">
							{hiddenUsers.map((user: string) => (
								<Button
									key={user}
									size="1"
									variant="soft"
									color="red"
									onClick={() => removeHiddenUser(user)}
								>
									@{user}
								</Button>
							))}
							<Button
								size="1"
								variant="outline"
								color="gray"
								onClick={() =>
									setHiddenUsersMode((prev: "any" | "all") =>
										prev === "any" ? "all" : "any",
									)
								}
							>
								{hiddenUsersMode === "any"
									? t("settings.connect.reviewHiddenUsersModeAny", "包含即隐藏")
									: t("settings.connect.reviewHiddenUsersModeAll", "全含才隐藏")}
							</Button>
						</Flex>
					)}
				</div>
			</SettingsGroup>
		</Flex>
	);
};

export const SettingsConnectTab = ({
	subpage,
	onSubpageChange,
}: {
	subpage: SettingsConnectSubpage | null;
	onSubpageChange: (subpage: SettingsConnectSubpage | null) => void;
}) => {
	const { t } = useTranslation();
	const githubLogin = useAtomValue(githubLoginAtom);
	const hasGithubAccess = useAtomValue(githubAmlldbAccessAtom);
	const lyricsSiteUser = useAtomValue(lyricsSiteUserAtom);
	const shouldShowReviewHiddenLabels =
		Boolean(githubLogin.trim()) && hasGithubAccess;
	const shouldShowNetease =
		Boolean(githubLogin.trim()) || Boolean(lyricsSiteUser);

	if (subpage === "reviewHiddenLabels") {
		return <SettingsConnectReviewHiddenLabelsPage />;
	}

	if (subpage === "reviewHiddenUsers") {
		return <SettingsConnectReviewHiddenUsersPage />;
	}

	return (
		<Flex direction="column" gap="4">
			<SettingsGroup title="GitHub" className={styles.connectLoginGroup}>
				<GithubLoginCard showHeader={false} />

				{shouldShowReviewHiddenLabels && (
					<SettingsConnectSubpageEntry
						icon={<Tag24Regular />}
						title={t("settings.connect.reviewHiddenLabelsTitle", "审阅隐藏标签")}
						description={t(
							"settings.connect.reviewHiddenLabelsDesc",
							"点击标签可在未隐藏与已隐藏之间切换",
						)}
						onOpen={() => onSubpageChange("reviewHiddenLabels")}
					/>
				)}

				<SettingsConnectSubpageEntry
					icon={<Person24Regular />}
					title={t("settings.connect.reviewHiddenUsersTitle", "隐藏指定用户")}
					description={t(
						"settings.connect.reviewHiddenUsersDesc",
						"稿件所属用户在隐藏列表中时，该稿件不会在审阅页面显示",
					)}
					onOpen={() => onSubpageChange("reviewHiddenUsers")}
				/>
			</SettingsGroup>

			<SettingsGroup
				title={t("settings.connect.lyricsSite", "歌词站")}
				className={styles.connectLoginGroup}
			>
				<LyricsSiteLoginCard showHeader={false} />
			</SettingsGroup>

			{shouldShowNetease && (
				<SettingsGroup
					title={t("settings.connect.netease.title", "网易云音乐")}
					className={styles.connectLoginGroup}
				>
					<NeteaseLoginCard showHeader={false} />
				</SettingsGroup>
			)}
		</Flex>
	);
};
