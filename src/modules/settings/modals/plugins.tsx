import {
	ArrowClockwise24Regular,
	DocumentAdd24Regular,
	FolderOpen24Regular,
	PlugConnected24Regular,
	PuzzlePiece24Regular,
} from "@fluentui/react-icons";
import { Badge, Button, Flex, Switch, Text } from "@radix-ui/themes";
import { parseManifest } from "@amll-ttml-tool/plugin-api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { wasmPluginService } from "$/plugins/adapters/wasm-plugin-host";
import type {
	WasmPluginStatus,
	WasmPluginSummary,
} from "$/plugins/adapters/wasm-plugin-service";
import {
	DevPluginWatcher,
	isDevPluginLoadingSupported,
	pickDevPluginDirectory,
	readDevPluginDirectory,
} from "$/plugins/ui/dev-plugin-loader";
import {
	assemblePluginPackage,
	installPluginPackage,
	installSamplePlugin,
	type PluginInstallResult,
} from "$/plugins/ui/plugin-install-service";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";

const STATUS_BADGES: Record<
	WasmPluginStatus,
	{ color: "green" | "blue" | "red" | "gray" | "amber"; key: string; fallback: string }
> = {
	active: { color: "green", key: "plugins.status.active", fallback: "运行中" },
	activating: {
		color: "blue",
		key: "plugins.status.activating",
		fallback: "启动中",
	},
	inactive: { color: "gray", key: "plugins.status.inactive", fallback: "未启动" },
	failed: { color: "red", key: "plugins.status.failed", fallback: "启动失败" },
	disabled: { color: "gray", key: "plugins.status.disabled", fallback: "已禁用" },
	"crash-disabled": {
		color: "red",
		key: "plugins.status.crashDisabled",
		fallback: "多次崩溃已禁用",
	},
};

const usePluginList = (): WasmPluginSummary[] => {
	const [plugins, setPlugins] = useState<WasmPluginSummary[]>(() =>
		wasmPluginService.getPlugins(),
	);
	useEffect(() => {
		const refresh = () => setPlugins(wasmPluginService.getPlugins());
		refresh();
		return wasmPluginService.subscribe(refresh);
	}, []);
	return plugins;
};

const reportInstallResult = (
	result: PluginInstallResult,
	t: (key: string, fallback: string) => string,
): void => {
	if (result.ok)
		toast.success(t("plugins.installSuccess", "插件已安装并启用"));
	else if (!result.cancelled)
		toast.error(
			`${t("plugins.installFailed", "插件安装失败")}\n${result.message}`,
		);
};

const PluginRow = ({ plugin }: { plugin: WasmPluginSummary }) => {
	const { t } = useTranslation();
	const [showLog, setShowLog] = useState(false);
	const badge = STATUS_BADGES[plugin.status];
	const diagnostics = showLog
		? wasmPluginService.getDiagnostics(plugin.id).slice(-20)
		: [];
	return (
		<SettingsRow
			icon={<PuzzlePiece24Regular />}
			title={
				<Flex align="center" gap="2" wrap="wrap">
					{plugin.name}
					<Badge color="gray">{plugin.version}</Badge>
					<Badge color={badge.color}>{t(badge.key, badge.fallback)}</Badge>
					{plugin.source === "dev" && (
						<Badge color="amber">{t("plugins.devBadge", "开发模式")}</Badge>
					)}
				</Flex>
			}
			description={
				<Flex direction="column" gap="1">
					<span>{plugin.description ?? plugin.id}</span>
					<Flex gap="1" wrap="wrap">
						{plugin.grantedCapabilities.map((capability) => (
							<Badge key={capability} color="gray" variant="soft" size="1">
								{capability}
							</Badge>
						))}
					</Flex>
					{plugin.lastError && (
						<Text size="1" color="red">
							{plugin.lastError}
						</Text>
					)}
					{showLog && (
						<Flex direction="column" gap="1">
							{diagnostics.length === 0 && (
								<Text size="1" color="gray">
									{t("plugins.logEmpty", "暂无日志")}
								</Text>
							)}
							{diagnostics.map((entry) => (
								<Text
									key={entry.seq}
									size="1"
									color={entry.level === "error" ? "red" : "gray"}
									style={{ fontFamily: "var(--code-font-family)" }}
								>
									{new Date(entry.at).toLocaleTimeString()} [{entry.level}]{" "}
									{entry.message}
								</Text>
							))}
						</Flex>
					)}
				</Flex>
			}
			action={
				<Flex gap="2" align="center">
					<Button
						variant="ghost"
						size="1"
						onClick={() => setShowLog((value) => !value)}
					>
						{showLog
							? t("plugins.hideLog", "隐藏日志")
							: t("plugins.showLog", "日志")}
					</Button>
					<Switch
						checked={plugin.enabled}
						onCheckedChange={(checked) =>
							void wasmPluginService.setEnabled(plugin.id, checked)
						}
					/>
					<Button
						variant="soft"
						color="red"
						size="1"
						onClick={() => void wasmPluginService.uninstall(plugin.id)}
					>
						{t("plugins.uninstall", "卸载")}
					</Button>
				</Flex>
			}
		/>
	);
};

const DevPluginSection = () => {
	const { t } = useTranslation();
	const [devPluginId, setDevPluginId] = useState<string | null>(null);
	const [hotReload, setHotReload] = useState(true);
	const directoryRef = useRef<FileSystemDirectoryHandle | null>(null);
	const watcherRef = useRef<DevPluginWatcher | null>(null);

	const stopWatcher = useCallback(() => {
		watcherRef.current?.stop();
		watcherRef.current = null;
	}, []);

	useEffect(() => stopWatcher, [stopWatcher]);

	const reloadFromDirectory = useCallback(
		async (pluginId: string) => {
			const directory = directoryRef.current;
			if (!directory) return;
			try {
				const source = await readDevPluginDirectory(directory);
				const manifest = parseManifest(source.manifest);
				if (!manifest.ok || manifest.value.kind !== "function")
					throw new Error("manifest failed validation");
				await wasmPluginService.reload(pluginId, manifest.value, source.wasm);
				toast.info(t("plugins.dev.reloaded", "开发插件已热重载"));
			} catch (error) {
				toast.error(
					`${t("plugins.dev.reloadFailed", "热重载失败")}\n${String(error)}`,
				);
			}
		},
		[t],
	);

	const startWatcher = useCallback(
		(pluginId: string) => {
			stopWatcher();
			const directory = directoryRef.current;
			if (!directory) return;
			const watcher = new DevPluginWatcher(directory, () => {
				void reloadFromDirectory(pluginId);
			});
			watcher.start();
			watcherRef.current = watcher;
		},
		[reloadFromDirectory, stopWatcher],
	);

	const onPickDirectory = useCallback(async () => {
		const directory = await pickDevPluginDirectory();
		if (!directory) return;
		try {
			const source = await readDevPluginDirectory(directory);
			const result = await installPluginPackage(
				assemblePluginPackage(source.manifest, source.wasm),
				"dev",
			);
			reportInstallResult(result, t);
			if (result.ok) {
				directoryRef.current = directory;
				setDevPluginId(result.pluginId);
				if (hotReload) startWatcher(result.pluginId);
			}
		} catch (error) {
			toast.error(
				`${t("plugins.dev.loadFailed", "开发插件加载失败")}\n${String(error)}`,
			);
		}
	}, [hotReload, startWatcher, t]);

	if (!isDevPluginLoadingSupported()) return null;

	return (
		<SettingsGroup title={t("plugins.dev.title", "开发模式")}>
			<SettingsRow
				icon={<FolderOpen24Regular />}
				title={t("plugins.dev.loadDirectory", "从目录加载插件")}
				description={t(
					"plugins.dev.loadDirectoryHint",
					"选择包含 manifest.json 与入口 wasm 的目录。开发插件不持久化，仅在当前会话有效。",
				)}
				action={
					<Button size="1" variant="soft" onClick={() => void onPickDirectory()}>
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
	const plugins = usePluginList();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const onImportFile = useCallback(
		async (file: File) => {
			try {
				const result = await installPluginPackage(
					JSON.parse(await file.text()),
					"user",
				);
				reportInstallResult(result, t);
			} catch (error) {
				toast.error(
					`${t("plugins.installFailed", "插件安装失败")}\n${String(error)}`,
				);
			}
		},
		[t],
	);

	return (
		<Flex direction="column" gap="4">
			<SettingsGroup title={t("plugins.installedTitle", "已安装插件")}>
				{plugins.length === 0 && (
					<SettingsRow
						icon={<PuzzlePiece24Regular />}
						title={t("plugins.empty", "尚未安装任何插件")}
						description={t(
							"plugins.emptyHint",
							"WASM 插件在独立 Worker 中运行，只能访问已授权的能力；崩溃或超时不会影响编辑器。",
						)}
					/>
				)}
				{plugins.map((plugin) => (
					<PluginRow key={plugin.id} plugin={plugin} />
				))}
			</SettingsGroup>
			<SettingsGroup title={t("plugins.installTitle", "安装")}>
				<SettingsRow
					icon={<DocumentAdd24Regular />}
					title={t("plugins.importPackage", "导入插件包")}
					description={t(
						"plugins.importPackageHint",
						"导入 JSON 格式的 WASM 插件包，安装前需要确认能力授权。",
					)}
					action={
						<Button
							size="1"
							variant="soft"
							onClick={() => fileInputRef.current?.click()}
						>
							{t("plugins.importButton", "选择文件")}
						</Button>
					}
				/>
				<SettingsRow
					icon={<PlugConnected24Regular />}
					title={t("plugins.installSample", "安装示例插件")}
					description={t(
						"plugins.installSampleHint",
						"官方示例：演示命令、声明式表单、文档事务与隔离存储。",
					)}
					action={
						<Button
							size="1"
							variant="soft"
							onClick={async () =>
								reportInstallResult(await installSamplePlugin(), t)
							}
						>
							{t("plugins.installSampleButton", "安装")}
						</Button>
					}
				/>
			</SettingsGroup>
			<DevPluginSection />
			<input
				ref={fileInputRef}
				type="file"
				accept="application/json,.json"
				hidden
				onChange={(event) => {
					const file = event.currentTarget.files?.[0];
					event.currentTarget.value = "";
					if (file) void onImportFile(file);
				}}
			/>
		</Flex>
	);
};
