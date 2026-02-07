import { Flex, Heading } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { GithubLoginCard } from "$/modules/github/modals/GithubLoginCard";
import { NeteaseLoginCard } from "$/modules/ncm/modals/NeteaseLoginCard";
import { githubLoginAtom } from "$/modules/settings/states";

export const SettingsConnectTab = () => {
	const { t } = useTranslation();
	const githubLogin = useAtomValue(githubLoginAtom);
	const shouldShowNetease = Boolean(githubLogin.trim());

	return (
		<Flex direction="column" gap="4">
			<Flex direction="column" gap="1">
				<Heading size="4">{t("settings.connect.title", "连接")}</Heading>
			</Flex>

			<GithubLoginCard />

			{shouldShowNetease && <NeteaseLoginCard />}
		</Flex>
	);
};
