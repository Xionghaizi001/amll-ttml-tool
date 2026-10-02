import {
	installTrustedJsPackage,
	installedTrustedJsService,
} from "$/plugins/trusted/trusted-js-host";
import {
	ArrowClockwise24Regular,
	FolderOpen24Regular,
	PlugDisconnected24Regular,
	StoreMicrosoft24Regular,
} from "@fluentui/react-icons";
import { Button, Flex, Switch } from "@radix-ui/themes";
import { parseManifest } from "@amll-ttml-tool/plugin-api";
import { useAtom } from "jotai";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import {
	DevPluginWatcher,
	isDevPluginLoadingSupported,
	pickDevPluginDirectory,
	readDevPluginDirectory,
} from "$/plugins/ui/dev-plugin-loader";
import { pluginStoreDialogAtom } from "$/states/dialogs";
import { pluginNetworkOfflineAtom } from "$/states/plugins";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";

/**
 * Offline master switch for plugin network access (goal.md stage 8 item 5).
 * Flipping it refuses every plugin `network.http` request at the shared host
 * port; host-owned features keep their own network access.
 */
const PluginNetworkSection = () => {
	const { t } = useTranslation();
	const [offline, setOffline] = useAtom(pluginNetworkOfflineAtom);
	return (
		<SettingsGroup title={t("plugins.network.title", "插件网络")}>
			<SettingsRow
				icon={<PlugDisconnected24Regular />}
				title={t("plugins.network.offline", "离线模式")}
				description={t(
					"plugins.network.offlineHint",
					"开启后宿主会拒绝通过插件网络接口发起的请求，宿主自身功能不受影响。此开关不能阻止 JS 插件直接使用浏览器网络能力。",
				)}
				action={
					<Switch
						checked={offline}
						onCheckedChange={(checked) => setOffline(checked)}
					/>
				}
			/>
		</SettingsGroup>
	);
};

// The directory watcher belongs to the application session, not the settings tab.
const devSession = {
	pluginId: null as string | null,
	hotReload: true,
	directory: { current: null as FileSystemDirectoryHandle | null },
	watcher: { current: null as DevPluginWatcher | null },
	queue: Promise.resolve(),
};

const DevPluginSection = () => {
	const { t } = useTranslation();
	const [devPluginId, setDevPluginId] = useState(devSession.pluginId);
	const [hotReload, setHotReload] = useState(devSession.hotReload);
	const directoryRef = devSession.directory;
	const watcherRef = devSession.watcher;

	const stopWatcher = useCallback(() => {
		watcherRef.current?.stop();
		watcherRef.current = null;
	}, []);

	const reloadFromDirectory = useCallback(
		(pluginId: string) => {
			const directory = directoryRef.current;
			const operation = devSession.queue.then(async () => {
				if (
					!directory ||
					directory !== directoryRef.current ||
					pluginId !== devSession.pluginId
				)
					return;
				if (
					!installedTrustedJsService
						.list()
						.some((record) => record.id === pluginId && record.source === "dev")
				)
					return;
				try {
					const source = await readDevPluginDirectory(directory);
					const manifest = parseManifest(source.manifest);
					if (!manifest.ok || manifest.value.kind !== "function")
						throw new Error("manifest failed validation");
					if (
						manifest.value.id !== pluginId ||
						manifest.value.runtime !== "trusted-js"
					)
						throw new Error("插件 id 或 runtime 已改变，请重新选择开发目录");
					{
						const result = await installTrustedJsPackage(
							{
								packageVersion: 0,
								manifest: source.manifest,
								code: source.code,
							},
							"dev",
						);
						if (!result.ok) throw new Error(result.message);
					}
					toast.info(t("plugins.dev.reloaded", "开发插件已热重载"));
				} catch (error) {
					toast.error(
						`${t("plugins.dev.reloadFailed", "热重载失败")}\n${String(error)}`,
					);
				}
			});
			devSession.queue = operation.catch(() => undefined);
			return operation;
		},
		[t],
	);

	const startWatcher = useCallback(
		(pluginId: string) => {
			stopWatcher();
			const directory = directoryRef.current;
			if (!directory) return;
			const watcher = new DevPluginWatcher(directory, () =>
				reloadFromDirectory(pluginId),
			);
			watcher.start();
			watcherRef.current = watcher;
		},
		[reloadFromDirectory, stopWatcher],
	);

	const onPickDirectory = useCallback(async () => {
		const directory = await pickDevPluginDirectory();
		if (!directory) return;
		stopWatcher();
		await devSession.queue;
		try {
			const source = await readDevPluginDirectory(directory);
			const result = await installTrustedJsPackage(
				{ packageVersion: 0, manifest: source.manifest, code: source.code },
				"dev",
			);
			if (!result.ok && !result.cancelled) throw new Error(result.message);
			if (result.ok) {
				directoryRef.current = directory;
				devSession.pluginId = result.pluginId;
				setDevPluginId(result.pluginId);
			}
		} catch (error) {
			toast.error(
				`${t("plugins.dev.loadFailed", "开发插件加载失败")}\n${String(error)}`,
			);
		}
		if (hotReload && devSession.pluginId) startWatcher(devSession.pluginId);
	}, [hotReload, startWatcher, stopWatcher, t]);

	if (!isDevPluginLoadingSupported()) return null;

	return (
		<SettingsGroup title={t("plugins.dev.title", "开发模式")}>
			<SettingsRow
				icon={<FolderOpen24Regular />}
				title={t("plugins.dev.loadDirectory", "从目录加载插件")}
				description={t(
					"plugins.dev.loadDirectoryHint",
					"选择包含 manifest.json 与入口 JS 的目录。开发插件不持久化，仅在当前会话有效。",
				)}
				action={
					<Button
						size="1"
						variant="soft"
						onClick={() => void onPickDirectory()}
					>
						{t("plugins.dev.pick", "选择目录")}
					</Button>
				}
			/>
			{devPluginId !== null && (
				<SettingsRow
					icon={<ArrowClockwise24Regular />}
					title={t("plugins.dev.hotReload", "热重载")}
					description={t(
						"plugins.dev.hotReloadHint",
						"监视目录内容变化并自动重载插件。",
					)}
					action={
						<Flex gap="2" align="center">
							<Switch
								checked={hotReload}
								onCheckedChange={(checked) => {
									setHotReload(checked);
									devSession.hotReload = checked;
									if (checked) startWatcher(devPluginId);
									else stopWatcher();
								}}
							/>
							<Button
								size="1"
								variant="soft"
								onClick={() => void reloadFromDirectory(devPluginId)}
							>
								{t("plugins.dev.reloadNow", "立即重载")}
							</Button>
						</Flex>
					}
				/>
			)}
		</SettingsGroup>
	);
};

export const SettingsPluginsTab = () => {
	const { t } = useTranslation();
	const [, setStoreOpen] = useAtom(pluginStoreDialogAtom);
	return (
		<Flex direction="column" gap="4">
			<SettingsGroup title={t("plugins.installedTitle", "插件")}>
				<SettingsRow
					icon={<StoreMicrosoft24Regular />}
					title={t("pluginStore.title", "插件商店")}
					action={
						<Button size="1" variant="soft" onClick={() => setStoreOpen(true)}>
							<StoreMicrosoft24Regular />
							{t("plugins.manage", "管理插件")}
						</Button>
					}
				/>
			</SettingsGroup>
			<PluginNetworkSection />
			<DevPluginSection />
		</Flex>
	);
};
