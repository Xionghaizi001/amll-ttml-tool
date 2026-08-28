import { PersonWarning24Regular } from "@fluentui/react-icons";
import { AlertDialog, Badge, Button, Flex, Link, Text } from "@radix-ui/themes";
import { useCallback, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { trustedJsConsentService } from "$/plugins/trusted/trusted-consent-service";

/**
 * Trusted-js admission prompt. Portals to body (outside every theme slot)
 * and carries data-amll-protected, so no theme can cover or restyle it.
 *
 * The wording is the tier's contract and must stay honest: a trusted-js
 * plugin is NOT sandboxed — it acts as the user inside the app (data and
 * credentials), and on desktop it can additionally harm the system. Do not
 * soften this text; it is what makes the consent meaningful.
 */
export const TrustedJsConsentDialog = () => {
	const request = useSyncExternalStore(
		useCallback(
			(listener: () => void) => trustedJsConsentService.subscribe(listener),
			[],
		),
		trustedJsConsentService.getSnapshot,
	);
	const { t } = useTranslation();
	if (request === null) return null;
	return (
		<AlertDialog.Root open>
			<AlertDialog.Content
				size="2"
				maxWidth="480px"
				data-amll-protected
				data-amll-modal-size="small"
			>
				<AlertDialog.Title>
					<Flex align="center" gap="2">
						<PersonWarning24Regular />
						{t("plugins.trustedConsent.title", "加载 JS 插件")}
					</Flex>
				</AlertDialog.Title>
				<AlertDialog.Description size="2">
					{t(
						"plugins.trustedConsent.description",
						"该插件不在沙箱中运行。它可以在本应用内以你的身份行事：读取和修改你的数据、读取你的登录凭据并以你的身份调用在线服务。",
					)}
					{request.tier === "desktop" &&
						` ${t(
							"plugins.trustedConsent.desktopWarning",
							"在桌面应用中，它还可能危害你的系统——请像“安装一个软件”一样对待它。",
						)}`}
					{request.tier === "browser" &&
						` ${t(
							"plugins.trustedConsent.browserNote",
							"它无法访问你的电脑（浏览器保护的是你的系统，不是你的账号）。",
						)}`}
				</AlertDialog.Description>
				<Flex direction="column" gap="2" my="3">
					<Flex align="center" gap="2">
						<Text weight="bold">{request.name}</Text>
						<Badge color="gray">{request.version}</Badge>
					</Flex>
					<Text size="1" color="gray">
						{request.pluginId}
					</Text>
					{request.description && <Text size="2">{request.description}</Text>}
					<Flex direction="column" gap="1" mt="1">
						<Text size="2" weight="bold">
							{t("plugins.trustedConsent.source", "来源")}
						</Text>
						<Text size="1" color="gray">
							{request.author ??
								t("plugins.trustedConsent.unknownAuthor", "未署名作者")}
						</Text>
						{request.homepage && (
							<Link size="1" href={request.homepage} target="_blank">
								{request.homepage}
							</Link>
						)}
					</Flex>
				</Flex>
				<Flex gap="3" justify="end">
					<AlertDialog.Cancel>
						<Button
							variant="soft"
							color="gray"
							onClick={() =>
								trustedJsConsentService.complete(request.requestId, false)
							}
						>
							{t("plugins.trustedConsent.decline", "不加载")}
						</Button>
					</AlertDialog.Cancel>
					<AlertDialog.Action>
						<Button
							color="red"
							onClick={() =>
								trustedJsConsentService.complete(request.requestId, true)
							}
						>
							{t("plugins.trustedConsent.accept", "信任并加载")}
						</Button>
					</AlertDialog.Action>
				</Flex>
			</AlertDialog.Content>
		</AlertDialog.Root>
	);
};
