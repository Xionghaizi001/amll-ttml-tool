import { Flex, Heading } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { GithubLoginCard } from "$/modules/github/modals/GithubLoginCard";
import { NeteaseLoginCard } from "$/modules/ncm/modals/NeteaseLoginCard";

export const SettingsConnectTab = () => {
	const { t } = useTranslation();

	return (
		<Flex direction="column" gap="4">
			<Flex direction="column" gap="1">
				<Heading size="4">{t("settings.connect.title", "连接")}</Heading>
			</Flex>

			<GithubLoginCard />

			<NeteaseLoginCard />
		</Flex>
	);
};
