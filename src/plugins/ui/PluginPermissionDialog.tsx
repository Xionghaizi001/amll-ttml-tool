import type { Capability } from "@amll-ttml-tool/plugin-api";
import { ShieldTask24Regular } from "@fluentui/react-icons";
import { AlertDialog, Badge, Button, Flex, Text } from "@radix-ui/themes";
import { useCallback, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { pluginPermissionService } from "./plugin-install-service";

const CAPABILITY_DESCRIPTIONS: Record<string, { key: string; fallback: string }> =
	{
		"lyrics.core": {
			key: "plugins.capability.lyricsCore",
			fallback: "读取并修改歌词文档（修改可撤销）",
		},
		"lyrics.ruby": {
			key: "plugins.capability.lyricsRuby",
			fallback: "读取并修改注音（Ruby）分段",
		},
		"lyrics.format": {
			key: "plugins.capability.lyricsFormat",
			fallback: "提供歌词格式的导入/导出转换",
		},
		"ui.notify": {
			key: "plugins.capability.uiNotify",
			fallback: "显示纯文本通知",
		},
		"ui.form": {
			key: "plugins.capability.uiForm",
			fallback: "打开声明式表单对话框",
		},
		"storage.kv": {
			key: "plugins.capability.storageKv",
			fallback: "使用按插件隔离的键值存储",
		},
	};

const describeCapability = (
	capability: Capability,
	t: (key: string, fallback: string) => string,
): string => {
	const known = CAPABILITY_DESCRIPTIONS[capability];
	if (known) return t(known.key, known.fallback);
	return t("plugins.capability.extension", "定制扩展能力");
};

/**
 * Capability grant prompt shown before a plugin package is installed.
 * Radix portals the content to body — outside every theme slot — and the
 * data-amll-protected marker makes it unthemable by contract, so a broken
 * or malicious theme can never cover or restyle this decision.
 */
export const PluginPermissionDialog = () => {
	const request = useSyncExternalStore(
		useCallback(
			(listener: () => void) => pluginPermissionService.subscribe(listener),
			[],
		),
		pluginPermissionService.getSnapshot,
	);
	const { t } = useTranslation();
	if (request === null) return null;
	const manifest = request.manifest;
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
						<ShieldTask24Regular />
						{t("plugins.permission.title", "安装插件")}
					</Flex>
				</AlertDialog.Title>
				<AlertDialog.Description size="2">
					{t(
						"plugins.permission.description",
						"该插件将在隔离的 WASM 运行环境中执行，只能使用下列已授权能力。",
					)}
				</AlertDialog.Description>
				<Flex direction="column" gap="2" my="3">
					<Flex align="center" gap="2">
						<Text weight="bold">{manifest.name}</Text>
						<Badge color="gray">{manifest.version}</Badge>
						{request.source === "dev" && (
							<Badge color="amber">
								{t("plugins.permission.devBadge", "开发模式")}
							</Badge>
						)}
					</Flex>
					<Text size="1" color="gray">
						{manifest.id}
					</Text>
					{manifest.description && (
						<Text size="2">{manifest.description}</Text>
					)}
					<Flex direction="column" gap="1" mt="2">
						<Text size="2" weight="bold">
							{t("plugins.permission.capabilities", "请求的能力")}
						</Text>
						{request.granted.length === 0 && (
							<Text size="2" color="gray">
								{t("plugins.permission.noCapabilities", "无（纯贡献点插件）")}
							</Text>
						)}
						{request.granted.map((capability) => (
							<Flex key={capability} align="center" gap="2">
								<Badge>{capability}</Badge>
								<Text size="1" color="gray">
									{describeCapability(capability, t)}
								</Text>
							</Flex>
						))}
						{request.rejected.length > 0 && (
							<Text size="1" color="red">
								{t(
									"plugins.permission.rejected",
									"以下能力不受当前宿主支持，将被拒绝：",
								)}{" "}
								{request.rejected.join(", ")}
							</Text>
						)}
					</Flex>
				</Flex>
				<Flex gap="3" justify="end">
					<AlertDialog.Cancel>
						<Button
							variant="soft"
							color="gray"
							onClick={() =>
								pluginPermissionService.complete(request.id, false)
							}
						>
							{t("plugins.permission.cancel", "取消")}
						</Button>
					</AlertDialog.Cancel>
					<AlertDialog.Action>
						<Button
							onClick={() => pluginPermissionService.complete(request.id, true)}
						>
							{t("plugins.permission.install", "授权并安装")}
						</Button>
					</AlertDialog.Action>
				</Flex>
			</AlertDialog.Content>
		</AlertDialog.Root>
	);
};
