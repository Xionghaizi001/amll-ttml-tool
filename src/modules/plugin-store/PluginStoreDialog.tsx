import {
	ArrowCounterclockwise24Regular,
	ArrowSync24Regular,
	CloudArrowDown24Regular,
	Javascript24Regular,
	PaintBrush24Regular,
	PuzzlePiece24Regular,
	ShieldTask24Regular,
	StoreMicrosoft24Regular,
} from "@fluentui/react-icons";
import type {
	RemotePluginCatalogEntryV0,
	RemotePluginCatalogV0,
} from "@amll-ttml-tool/plugin-api";
import { Badge, Button, Dialog, Flex, Switch, Text } from "@radix-ui/themes";
import { useAtom } from "jotai";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { themeService } from "$/plugins/adapters/theme-host";
import { wasmPluginService } from "$/plugins/adapters/wasm-plugin-host";
import { loadRemotePluginCatalog } from "$/plugins/store/catalog-client";
import { installStoreEntry } from "$/plugins/store/store-host";
import { isStoreUpdateAvailable } from "$/plugins/store/store-install";
import { FACTORY_TRUSTED_JS_PLUGINS } from "$/plugins/trusted/factory-plugins";
import {
	applyTrustedJsUpdate,
	getTrustedJsPluginState,
	getTrustedJsUpdateStates,
	isDesktopTrustedJsEnabled,
	reloadTrustedJsPlugin,
	revertTrustedJsToFactory,
	setDesktopTrustedJsEnabled,
	trustedJsPluginService,
} from "$/plugins/trusted/trusted-js-host";
import type { TrustedJsFactoryUpdateState } from "$/plugins/trusted/trusted-js-load-plan";
import { TRUSTED_JS_CRASH_AUTO_DISABLE_THRESHOLD } from "$/plugins/trusted/trusted-js-service";
import {
	SettingsGroup,
	SettingsRow,
} from "$/modules/settings/modals/SettingsGroup";
import { pluginStoreDialogAtom } from "$/states/dialogs";

const isDesktop = (): boolean => Boolean(import.meta.env.TAURI_ENV_PLATFORM);

const CHANNEL_BADGES: Record<
	RemotePluginCatalogEntryV0["channel"],
	{ color: "amber" | "blue" | "purple"; key: string; fallback: string }
> = {
	"trusted-js": {
		color: "amber",
		key: "pluginStore.channel.trustedJs",
		fallback: "JS 插件",
	},
	"extism-wasm": {
		color: "blue",
		key: "pluginStore.channel.wasm",
		fallback: "WASM 沙箱",
	},
	theme: {
		color: "purple",
		key: "pluginStore.channel.theme",
		fallback: "主题",
	},
};

const CHANNEL_ICONS: Record<RemotePluginCatalogEntryV0["channel"], ReactNode> =
	{
		"trusted-js": <Javascript24Regular />,
		"extism-wasm": <PuzzlePiece24Regular />,
		theme: <PaintBrush24Regular />,
	};

const useTrustedJsLoaded = () => {
	const [loaded, setLoaded] = useState(() =>
		trustedJsPluginService.getLoaded(),
	);
	useEffect(() => {
		const refresh = () => setLoaded(trustedJsPluginService.getLoaded());
		refresh();
		return trustedJsPluginService.subscribe(refresh);
	}, []);
	return loaded;
};

const useWasmPlugins = () => {
	const [plugins, setPlugins] = useState(() => wasmPluginService.getPlugins());
	useEffect(() => {
		const refresh = () => setPlugins(wasmPluginService.getPlugins());
		refresh();
		return wasmPluginService.subscribe(refresh);
	}, []);
	return plugins;
};

const useThemes = () => {
	const [themes, setThemes] = useState(() => themeService.listThemes());
	useEffect(() => {
		const refresh = () => setThemes(themeService.listThemes());
		refresh();
		return themeService.subscribe(refresh);
	}, []);
	return themes;
};

interface CatalogEntryRowProps {
	entry: RemotePluginCatalogEntryV0;
	installedVersion: string | null;
	trustedUpdate?: TrustedJsFactoryUpdateState;
	trustedLive?: { version: string; bundled: boolean };
	busy: boolean;
	onAction(action: "install" | "update" | "revert" | "load"): void;
}

const CatalogEntryRow = ({
	entry,
	installedVersion,
	trustedUpdate,
	trustedLive,
	busy,
	onAction,
}: CatalogEntryRowProps) => {
	const { t } = useTranslation();
	const badge = CHANNEL_BADGES[entry.channel];

	let action: ReactNode = null;
	let statusBadge: ReactNode = null;
	if (entry.channel === "trusted-js" && trustedUpdate !== undefined) {
		// Factory-backed plugin: the store is only its update channel.
		if (trustedLive !== undefined && !trustedLive.bundled) {
			statusBadge = (
				<Badge color="green">
					{t("pluginStore.storeVersionActive", "商店版运行中")}
				</Badge>
			);
			action = (
				<Button
					size="1"
					variant="soft"
					disabled={busy}
					onClick={() => onAction("revert")}
				>
					<ArrowCounterclockwise24Regular width="1em" height="1em" />
					{t("pluginStore.revertToFactory", "回退出厂版")}
				</Button>
			);
		} else if (trustedUpdate.updateAvailable) {
			statusBadge = (
				<Badge color="amber">
					{t("pluginStore.factoryVersion", "出厂版")}{" "}
					{trustedUpdate.factoryVersion}
				</Badge>
			);
			action = (
				<Button
					size="1"
					variant="soft"
					disabled={busy}
					onClick={() => onAction("update")}
				>
					<CloudArrowDown24Regular width="1em" height="1em" />
					{t("pluginStore.update", "更新")}
				</Button>
			);
		} else {
			statusBadge = (
				<Badge color="gray">
					{t("pluginStore.factoryUpToDate", "出厂版已是最新")}
				</Badge>
			);
		}
	} else if (entry.channel === "trusted-js") {
		// Remote-only trusted-js entry.
		if (trustedLive !== undefined)
			statusBadge = (
				<Badge color="green">{t("pluginStore.loaded", "已加载")}</Badge>
			);
		else
			action = (
				<Button
					size="1"
					variant="soft"
					disabled={busy}
					onClick={() => onAction("load")}
				>
					{t("pluginStore.load", "加载")}
				</Button>
			);
	} else if (installedVersion === null) {
		action = (
			<Button
				size="1"
				variant="soft"
				disabled={busy}
				onClick={() => onAction("install")}
			>
				{t("pluginStore.install", "安装")}
			</Button>
		);
	} else if (isStoreUpdateAvailable(entry.version, installedVersion)) {
		statusBadge = (
			<Badge color="amber">
				{t("pluginStore.installed", "已安装")} {installedVersion}
			</Badge>
		);
		action = (
			<Button
				size="1"
				variant="soft"
				disabled={busy}
				onClick={() => onAction("update")}
			>
				<CloudArrowDown24Regular width="1em" height="1em" />
				{t("pluginStore.update", "更新")}
			</Button>
		);
	} else {
		statusBadge = (
			<Badge color="gray">{t("pluginStore.upToDate", "已是最新")}</Badge>
		);
	}

	return (
		<SettingsRow
			icon={CHANNEL_ICONS[entry.channel]}
			title={
				<Flex align="center" gap="2" wrap="wrap">
					{entry.name}
					<Badge color="gray">{entry.version}</Badge>
					<Badge color={badge.color}>{t(badge.key, badge.fallback)}</Badge>
					{entry.firstParty === true && (
						<Badge color="blue" variant="soft">
							{t("pluginStore.firstParty", "第一方")}
						</Badge>
					)}
					{statusBadge}
				</Flex>
			}
			description={
				<Flex direction="column" gap="1">
					<span>{entry.description ?? entry.id}</span>
					{entry.author !== undefined && (
						<Text size="1" color="gray">
							{t("pluginStore.author", "作者")}: {entry.author}
						</Text>
					)}
				</Flex>
			}
			action={action ?? undefined}
		/>
	);
};

/** Trusted-js plugin management row: enable toggle, crash recovery. */
const TrustedJsManagementRow = ({
	id,
	name,
	version,
	bundled,
	live,
	busy,
	onToggle,
	onRetry,
}: {
	id: string;
	name: string;
	version: string;
	bundled: boolean;
	live: boolean;
	busy: boolean;
	onToggle(enabled: boolean): void;
	onRetry(): void;
}) => {
	const { t } = useTranslation();
	const state = getTrustedJsPluginState(id);
	const disabled = state?.disabled === true;
	const crashDisabled =
		(state?.crashes ?? 0) >= TRUSTED_JS_CRASH_AUTO_DISABLE_THRESHOLD;
	return (
		<SettingsRow
			icon={<Javascript24Regular />}
			title={
				<Flex align="center" gap="2" wrap="wrap">
					{name}
					<Badge color="gray">{version}</Badge>
					{bundled ? (
						<Badge color="blue" variant="soft">
							{t("pluginStore.factoryBadge", "出厂版")}
						</Badge>
					) : (
						<Badge color="amber" variant="soft">
							{t("pluginStore.storeBadge", "商店版")}
						</Badge>
					)}
					{crashDisabled && (
						<Badge color="red">
							{t("pluginStore.crashDisabled", "多次崩溃已禁用")}
						</Badge>
					)}
					{!live && !crashDisabled && disabled && (
						<Badge color="gray">{t("pluginStore.disabled", "已禁用")}</Badge>
					)}
				</Flex>
			}
			description={id}
			action={
				<Flex gap="2" align="center">
					{crashDisabled && (
						<Button size="1" variant="soft" disabled={busy} onClick={onRetry}>
							{t("pluginStore.retry", "重试")}
						</Button>
					)}
					<Switch
						checked={live}
						disabled={busy}
						onCheckedChange={(checked) => onToggle(checked)}
					/>
				</Flex>
			}
		/>
	);
};

export const PluginStoreDialog = () => {
	const { t } = useTranslation();
	const [open, setOpen] = useAtom(pluginStoreDialogAtom);
	const [catalog, setCatalog] = useState<RemotePluginCatalogV0 | null>(null);
	const [catalogLoading, setCatalogLoading] = useState(false);
	const [trustedUpdates, setTrustedUpdates] = useState<
		TrustedJsFactoryUpdateState[]
	>([]);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [desktopTrust, setDesktopTrust] = useState(isDesktopTrustedJsEnabled);
	const trustedLoaded = useTrustedJsLoaded();
	const wasmPlugins = useWasmPlugins();
	const themes = useThemes();

	const refresh = useCallback(async (force: boolean) => {
		setCatalogLoading(true);
		try {
			const [nextCatalog, nextUpdates] = await Promise.all([
				loadRemotePluginCatalog({ refresh: force }),
				getTrustedJsUpdateStates({ refresh: force }),
			]);
			setCatalog(nextCatalog);
			setTrustedUpdates(nextUpdates);
		} finally {
			setCatalogLoading(false);
		}
	}, []);

	useEffect(() => {
		if (open) void refresh(false);
	}, [open, refresh]);

	const platform = isDesktop() ? "desktop" : "web";
	const entries = useMemo(
		() =>
			(catalog?.plugins ?? []).filter(
				(entry) =>
					entry.platforms === undefined || entry.platforms.includes(platform),
			),
		[catalog, platform],
	);

	const runAction = useCallback(
		async (
			entry: RemotePluginCatalogEntryV0,
			action: "install" | "update" | "revert" | "load",
		) => {
			setBusyId(entry.id);
			try {
				if (entry.channel === "trusted-js") {
					if (action === "revert") await revertTrustedJsToFactory(entry.id);
					else if (action === "update") await applyTrustedJsUpdate(entry.id);
					else await reloadTrustedJsPlugin(entry.id);
				} else {
					const result = await installStoreEntry(entry);
					if (result.ok)
						toast.success(
							action === "update"
								? t("pluginStore.updateSuccess", "已更新")
								: t("pluginStore.installSuccess", "已安装"),
						);
					else if (!result.cancelled)
						toast.error(
							`${t("pluginStore.installFailed", "安装失败")}\n${
								result.message ?? ""
							}`,
						);
				}
				await refresh(false);
			} finally {
				setBusyId(null);
			}
		},
		[refresh, t],
	);

	const knownTrustedPlugins = useMemo(() => {
		const known = new Map<
			string,
			{
				id: string;
				name: string;
				version: string;
				bundled: boolean;
				live: boolean;
			}
		>();
		for (const factory of FACTORY_TRUSTED_JS_PLUGINS)
			known.set(factory.id, {
				id: factory.id,
				name: factory.name,
				version: factory.version,
				bundled: true,
				live: false,
			});
		for (const entry of entries) {
			if (entry.channel !== "trusted-js" || known.has(entry.id)) continue;
			known.set(entry.id, {
				id: entry.id,
				name: entry.name,
				version: entry.version,
				bundled: false,
				live: false,
			});
		}
		for (const summary of trustedLoaded)
			known.set(summary.id, {
				id: summary.id,
				name: summary.name,
				version: summary.version,
				bundled: summary.bundled,
				live: true,
			});
		return [...known.values()];
	}, [entries, trustedLoaded]);

	const onToggleTrusted = useCallback(
		async (pluginId: string, enabled: boolean) => {
			setBusyId(pluginId);
			try {
				await trustedJsPluginService.setEnabled(pluginId, enabled);
				if (enabled) await reloadTrustedJsPlugin(pluginId);
				await refresh(false);
			} finally {
				setBusyId(null);
			}
		},
		[refresh],
	);

	const onRetryTrusted = useCallback(
		async (pluginId: string) => {
			setBusyId(pluginId);
			try {
				trustedJsPluginService.resetFailures(pluginId);
				await reloadTrustedJsPlugin(pluginId);
				await refresh(false);
			} finally {
				setBusyId(null);
			}
		},
		[refresh],
	);

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Content
				maxWidth="720px"
				data-amll-protected
				aria-describedby={undefined}
			>
				<Flex align="center" justify="between" mb="4">
					<Dialog.Title mb="0">
						<Flex align="center" gap="2">
							<StoreMicrosoft24Regular />
							{t("pluginStore.title", "插件商店")}
						</Flex>
					</Dialog.Title>
					<Button
						size="1"
						variant="ghost"
						disabled={catalogLoading}
						onClick={() => void refresh(true)}
					>
						<ArrowSync24Regular width="1em" height="1em" />
						{t("pluginStore.refresh", "刷新")}
					</Button>
				</Flex>
				<Flex direction="column" gap="4">
					{catalog === null && !catalogLoading && (
						<Text size="2" color="gray">
							{t(
								"pluginStore.unavailable",
								"商店目前不可用（离线或清单未发布）。这不影响编辑器和随应用附带的出厂插件。",
							)}
						</Text>
					)}
					{entries.length > 0 && (
						<SettingsGroup title={t("pluginStore.catalogTitle", "可用插件")}>
							{entries.map((entry) => {
								const trustedUpdate = trustedUpdates.find(
									(update) => update.id === entry.id,
								);
								const live = trustedLoaded.find(
									(summary) => summary.id === entry.id,
								);
								const installedVersion =
									entry.channel === "extism-wasm"
										? (wasmPlugins.find((plugin) => plugin.id === entry.id)
												?.version ?? null)
										: entry.channel === "theme"
											? (themes.find((theme) => theme.id === entry.id)
													?.version ?? null)
											: null;
								return (
									<CatalogEntryRow
										key={entry.id}
										entry={entry}
										installedVersion={installedVersion}
										trustedUpdate={trustedUpdate}
										trustedLive={live}
										busy={busyId !== null}
										onAction={(action) => void runAction(entry, action)}
									/>
								);
							})}
						</SettingsGroup>
					)}
					{knownTrustedPlugins.length > 0 && (
						<SettingsGroup title={t("pluginStore.trustedTitle", "JS 插件管理")}>
							{knownTrustedPlugins.map((plugin) => (
								<TrustedJsManagementRow
									key={plugin.id}
									id={plugin.id}
									name={plugin.name}
									version={plugin.version}
									bundled={plugin.bundled}
									live={plugin.live}
									busy={busyId !== null}
									onToggle={(enabled) =>
										void onToggleTrusted(plugin.id, enabled)
									}
									onRetry={() => void onRetryTrusted(plugin.id)}
								/>
							))}
						</SettingsGroup>
					)}
					{isDesktop() && (
						<SettingsGroup title={t("pluginStore.desktopTitle", "桌面端")}>
							<SettingsRow
								icon={<ShieldTask24Regular />}
								title={t("pluginStore.desktopGate", "允许加载远程 JS 插件")}
								description={t(
									"pluginStore.desktopGateHint",
									"桌面端的 JS 插件除了能以你的身份在应用内行事之外，还可能危害你的系统——请像安装一个软件一样对待。默认关闭；出厂插件不受影响。",
								)}
								action={
									<Switch
										checked={desktopTrust}
										onCheckedChange={(checked) => {
											setDesktopTrustedJsEnabled(checked);
											setDesktopTrust(checked);
											void refresh(false);
										}}
									/>
								}
							/>
						</SettingsGroup>
					)}
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
