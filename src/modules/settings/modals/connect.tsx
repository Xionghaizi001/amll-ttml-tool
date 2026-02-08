import { Flex, Heading, Card, Text, Button, Avatar } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { GithubLoginCard } from "$/modules/github/modals/GithubLoginCard";
import { NeteaseLoginCard } from "$/modules/ncm/modals/NeteaseLoginCard";
import { githubLoginAtom } from "$/modules/settings/states";
import { useLyricsSiteAuth, lyricsSiteUserAtom } from "$/modules/review/services/remote-service";

const LyricsSiteLoginCard = () => {
	const { t } = useTranslation();
	const user = useAtomValue(lyricsSiteUserAtom);
	const { isLoggedIn, hasReviewPermission, initiateLogin, logout } = useLyricsSiteAuth();

	if (isLoggedIn && user) {
		return (
			<Card>
				<Flex direction="column" gap="3">
					<Flex align="center" gap="3">
						<Avatar
							size="3"
							src={user.avatarUrl}
							fallback={user.displayName?.[0] || "U"}
							radius="full"
						/>
						<Flex direction="column">
							<Text weight="medium">{user.displayName}</Text>
							<Text size="2" color="gray">
								@{user.username}
								{hasReviewPermission && (
									<span style={{ color: "var(--green-9)", marginLeft: "8px" }}>
										✓ 审核员
									</span>
								)}
							</Text>
						</Flex>
					</Flex>
					<Button variant="soft" color="gray" onClick={logout}>
						{t("common.logout", "登出")}
					</Button>
				</Flex>
			</Card>
		);
	}

	return (
		<Card>
			<Flex direction="column" gap="3">
				<Text weight="medium">{t("settings.connect.lyricsSite", "歌词站")}</Text>
				<Text size="2" color="gray">
					{t("settings.connect.lyricsSiteDesc", "登录歌词站以参与歌词审核")}
				</Text>
				<Button variant="soft" onClick={initiateLogin}>
					{t("settings.connect.loginLyricsSite", "登录歌词站")}
				</Button>
			</Flex>
		</Card>
	);
};

export const SettingsConnectTab = () => {
	const { t } = useTranslation();
	const githubLogin = useAtomValue(githubLoginAtom);
	const lyricsSiteUser = useAtomValue(lyricsSiteUserAtom);
	const shouldShowNetease = Boolean(githubLogin.trim()) || Boolean(lyricsSiteUser);

	return (
		<Flex direction="column" gap="4">
			<Flex direction="column" gap="1">
				<Heading size="4">{t("settings.connect.title", "连接")}</Heading>
			</Flex>

			<GithubLoginCard />

			<LyricsSiteLoginCard />

			{shouldShowNetease && <NeteaseLoginCard />}
		</Flex>
	);
};
