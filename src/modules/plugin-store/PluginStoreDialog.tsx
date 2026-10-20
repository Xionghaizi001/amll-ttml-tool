import type { RemotePluginCatalogV0 } from "@amll-ttml-tool/plugin-api";
import {
	ArrowCounterclockwise24Regular,
	ArrowLeft24Regular,
	ArrowSync24Regular,
	CloudArrowDown24Regular,
	Javascript24Regular,
	PaintBrush24Regular,
	Settings24Regular,
} from "@fluentui/react-icons";
import {
	Badge,
	Button,
	Flex,
	SegmentedControl,
	Switch,
	Text,
} from "@radix-ui/themes";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useState,
	useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { PluginSettingsSections } from "$/modules/settings/modals/plugins";
import styles from "$/modules/settings/modals/SettingsDialog.module.css";
import {
	SettingsGroup,
	SettingsRow,
} from "$/modules/settings/modals/SettingsGroup";
import {
	loadRemotePluginCatalog,
	storeProviderClient,
} from "$/plugins/store/catalog-client";
import {
	installStoreEntry,
	pluginInstallationService,
} from "$/plugins/store/store-host";
import { extensionRegistry } from "$/plugins/adapters/extension-host";
import { isStoreUpdateAvailable } from "$/plugins/store/store-install";
import type { ProviderCatalogEntry } from "$/plugins/store/store-providers";
import { FACTORY_TRUSTED_JS_PLUGINS } from "$/plugins/trusted/factory-plugins";
import {
	applyTrustedJsUpdate,
	getTrustedJsUpdateStates,
	reloadTrustedJsPlugin,
} from "$/plugins/trusted/trusted-js-host";
import type { TrustedJsFactoryUpdateState } from "$/plugins/trusted/trusted-js-load-plan";
import { installLocalPluginFile } from "$/plugins/ui/local-package-install";

const CHANNEL_BADGES = {
	"trusted-js": {
		color: "amber" as const,
		key: "pluginStore.channel.trustedJs",
		fallback: "插件",
	},
	theme: {
		color: "purple" as const,
		key: "pluginStore.channel.theme",
		fallback: "主题",
	},
};
const CHANNEL_ICONS = {
	"trusted-js": <Javascript24Regular />,
	theme: <PaintBrush24Regular />,
};
interface CatalogEntryRowProps {
	entry: ProviderCatalogEntry;
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
	if (entry.blockedReason) {
		statusBadge = <Badge color="red">{entry.blockedReason}</Badge>;
	} else if (entry.channel === "trusted-js" && trustedUpdate !== undefined) {
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
	} else if (
		entry.channel === "trusted-js" &&
		!/\.(zip|json)$/i.test(entry.entry)
	) {
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
					<Badge color="gray">{entry.provider.name}</Badge>
					{entry.mirrorOf && <Badge color="gray">镜像：{entry.mirrorOf}</Badge>}
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

/** The manager replaces the settings body inside its protected dialog shell. */
export const PluginManager = ({ onBack }: { onBack(): void }) => {
	const { t } = useTranslation();
	const shelves = useSyncExternalStore(
		storeProviderClient.subscribe,
		storeProviderClient.list
	);
	const [providerName, setProviderName] = useState("");
	const [providerUrl, setProviderUrl] = useState("");
	const [section, setSection] = useState("available");
	const [kind, setKind] = useState("all");
	const [location, setLocation] = useState("online");
	const [catalog, setCatalog] = useState<RemotePluginCatalogV0 | null>(null);
	const [updates, setUpdates] = useState<TrustedJsFactoryUpdateState[]>([]);
	const [loading, setLoading] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);
	const [installations, setInstallations] = useState(() =>
		pluginInstallationService.list()
	);
	useEffect(() => {
		const refresh = () => setInstallations(pluginInstallationService.list());
		refresh();
		return pluginInstallationService.subscribe(refresh);
	}, []);
	// Override sources live in the contribution layer, not in installations.
	useSyncExternalStore(
		(listener) => {
			const subscription = extensionRegistry.contributions.subscribe(listener);
			return () => subscription.dispose();
		},
		() => extensionRegistry.contributions.getRevision()
	);
	// Override chain in enable order: later sources win the keys they share.
	const overriddenBy = (pluginId: string) => {
		const sources = new Map<string, { kinds: Set<string>; shadowedBy: Map<string, Set<string>> }>();
		for (const source of extensionRegistry.contributions.overrides.getSources(pluginId)) {
			const merged = sources.get(source.sourcePluginId) ?? { kinds: new Set(), shadowedBy: new Map() };
			merged.kinds.add(source.kind);
			for (const later of source.shadowedBy) {
				const keys = merged.shadowedBy.get(later.sourcePluginId) ?? new Set();
				for (const key of later.keys) keys.add(`${source.kind}:${key}`);
				merged.shadowedBy.set(later.sourcePluginId, keys);
			}
			// Re-insert so the order follows each source's latest (winning) entry.
			sources.delete(source.sourcePluginId);
			sources.set(source.sourcePluginId, merged);
		}
		const nameOf = (id: string) => installations.find((candidate) => candidate.id === id)?.name ?? id;
		return [...sources].map(([id, { kinds, shadowedBy }]) => {
			const by = installations.find((candidate) => candidate.id === id);
			const shadowed = new Set([...shadowedBy.values()].flatMap((keys) => [...keys]));
			return {
				id,
				name: nameOf(id),
				kinds: [...kinds].join(", "),
				origin: by
					? `${t(`pluginStore.source.${by.source}`, by.source)}${by.store ? ` · ${by.store.providerName}` : ""}`
					: undefined,
				shadowed: shadowed.size
					? t("pluginStore.overrideShadowed", "{count} 处被 {names} 取代", {
							count: shadowed.size,
							names: [...shadowedBy.keys()].map(nameOf).join("、"),
						})
					: undefined,
			};
		});
	};
	const refresh = useCallback(async (force = false) => {
		setLoading(true);
		try {
			const [next, states] = await Promise.all([
				loadRemotePluginCatalog({ refresh: force }),
				getTrustedJsUpdateStates(),
			]);
			setCatalog(next);
			setUpdates(force ? await getTrustedJsUpdateStates() : states);
		} catch (error) {
			toast.error(String(error));
		} finally {
			setLoading(false);
		}
	}, []);
	useEffect(() => {
		void refresh();
	}, [refresh]);
	const run = async (
		id: string,
		operation: () => unknown | Promise<unknown>
	) => {
		setBusy(id);
		try {
			await operation();
		} catch (error) {
			toast.error(String(error));
		} finally {
			setBusy(null);
		}
	};
	const entries = storeProviderClient
		.entries(new Set(FACTORY_TRUSTED_JS_PLUGINS.map((p) => p.id)))
		.filter(
			(entry) =>
				(entry.platforms === undefined ||
					entry.platforms.includes(
						import.meta.env.TAURI_ENV_PLATFORM ? "desktop" : "web"
					)) &&
				(kind === "all" ||
					entry.channel === (kind === "theme" ? "theme" : "trusted-js"))
		);
	const local = installations.filter(
		(item) => kind === "all" || item.kind === kind
	);
	const installedRows = (items: typeof installations) =>
		items.map((item) => {
			const trusted = item.trustedJs;
			const update =
				item.kind === "function"
					? updates.find((entry) => entry.id === item.id)
					: undefined;
			const mutable = item.source !== "builtin" || trusted?.hasInstalledPackage;
			const overrides = item.kind === "function" ? overriddenBy(item.id) : [];
			return (
				<SettingsRow
					key={`${item.kind}:${item.id}`}
					icon={
						item.kind === "theme" ? (
							<PaintBrush24Regular />
						) : (
							<Javascript24Regular />
						)
					}
					title={
						<Flex gap="2" align="center" wrap="wrap">
							{item.name}
							<Badge color="gray">{item.version}</Badge>
							<Badge color={item.kind === "theme" ? "purple" : "amber"}>
								{item.kind === "theme"
									? t("pluginStore.channel.theme", "主题")
									: t("pluginStore.channel.trustedJs", "插件")}
							</Badge>
							{item.theme?.scope && (
								<Badge color="gray">
									{item.theme.scope === "global" ? "全局" : item.theme.scope}
								</Badge>
							)}
							{item.theme?.disabledByDependency && (
								<Badge color="red">
									依赖不可用：{item.theme.disabledByDependency}
								</Badge>
							)}
							{overrides.map((source) => (
								<Badge key={source.id} color="blue">
									{t("pluginStore.overriddenBy", "已被 {name} 覆盖", {
										name: source.name,
									})}
								</Badge>
							))}
							{trusted?.status && (
								<Badge color="gray">
									{t(`pluginStore.status.${trusted.status}`, trusted.status)}
								</Badge>
							)}
						</Flex>
					}
					description={
						<Flex direction="column" gap="1">
							<span style={{ overflowWrap: "anywhere" }}>
								{item.description ?? item.id}
							</span>
							<span style={{ overflowWrap: "anywhere" }}>
								{t(`pluginStore.source.${item.source}`, item.source)}
								{item.artifact ? ` · SHA-256: ${item.artifact.sha256}` : ""}
								{item.store && (
									<span>
										{" "}
										· {item.store.providerName}
										{!shelves.some(
											(s) => s.provider.id === item.store?.providerId
										) && "（来源已移除，不再更新）"}
									</span>
								)}
							</span>
							{overrides.length > 1 && (
								<span>{t("pluginStore.overrideChain", "覆盖链（后启用者优先）")}</span>
							)}
							{overrides.map((source, index) => (
								<span key={source.id} style={{ overflowWrap: "anywhere" }}>
									{overrides.length > 1 ? `${index + 1}. ` : ""}
									{t("pluginStore.overrideSource", "覆盖：{name}（{id}，{kinds}）", {
										name: source.name,
										id: source.id,
										kinds: source.kinds,
									})}
									{source.origin ? ` · ${source.origin}` : ""}
									{source.shadowed ? ` · ${source.shadowed}` : ""}
								</span>
							))}
						</Flex>
					}
					action={
						<Flex gap="2" align="center" wrap="wrap">
							{update?.updateAvailable && (
								<Button
									size="1"
									variant="soft"
									disabled={busy !== null}
									onClick={() =>
										void run(item.id, () => applyTrustedJsUpdate(item.id))
									}
								>
									{t("pluginStore.update", "更新")}
								</Button>
							)}
							{trusted && (
								<Button
									size="1"
									variant="soft"
									disabled={busy !== null}
									onClick={() =>
										void run(item.id, () =>
											pluginInstallationService.reauthorize(item.id)
										)
									}
								>
									{t("pluginStore.reauthorize", "重新授权")}
								</Button>
							)}
							{trusted?.hasFactory && trusted.hasInstalledPackage && (
								<Button
									size="1"
									variant="soft"
									disabled={busy !== null}
									onClick={() =>
										void run(item.id, () =>
											pluginInstallationService.revertToFactory(item.id)
										)
									}
								>
									{t("pluginStore.revertToFactory", "回退出厂版")}
								</Button>
							)}
							{mutable && (
								<Button
									size="1"
									variant="soft"
									disabled={busy !== null}
									onClick={() =>
										void run(item.id, () =>
											pluginInstallationService.uninstall(item.kind, item.id)
										)
									}
								>
									{t("pluginStore.uninstall", "卸载")}
								</Button>
							)}
							<Switch
								aria-label={`${item.name} ${t("pluginStore.enable", "启用")}`}
								checked={item.enabled}
								disabled={busy !== null || item.theme?.safeMode}
								onCheckedChange={(enabled) =>
									void run(item.id, () =>
										pluginInstallationService.setEnabled(
											item.kind,
											item.id,
											enabled
										)
									)
								}
							/>
						</Flex>
					}
				/>
			);
		});
	return (
		<>
			<aside className={styles.sidebar}>
				<Text as="div" size="2" weight="bold" className={styles.sidebarTitle}>
					{t("settingsDialog.title", "首选项")} &gt;{" "}
					{t("pluginStore.title", "插件管理")}
				</Text>
				<nav className={styles.navList}>
					<button type="button" className={styles.navItem} onClick={onBack}>
						<ArrowLeft24Regular className={styles.navIcon} />
						<span>{t("pluginStore.back", "返回首选项")}</span>
					</button>
					{[
						["available", t("pluginStore.available", "可用插件")],
						["installed", t("pluginStore.installedTitle", "已安装")],
						["settings", t("pluginStore.settingsTitle", "插件设置")],
					].map(([value, label]) => (
						<button
							type="button"
							key={value}
							className={styles.navItem}
							data-active={section === value || undefined}
							onClick={() => setSection(value)}
						>
							<Settings24Regular className={styles.navIcon} />
							<span>{label}</span>
						</button>
					))}
				</nav>
			</aside>
			<section className={styles.mainPane}>
				<header className={styles.header} />
				<div className={styles.scrollContent}>
					<Flex direction="column" gap="4">
						{section === "available" && (
							<>
								<Flex justify="between" align="center" gap="3" wrap="wrap">
									<SegmentedControl.Root
										value={kind}
										onValueChange={setKind}
										aria-label={t("pluginStore.filterKind", "扩展类型")}
									>
										<SegmentedControl.Item value="all">
											{t("pluginStore.all", "全部")}
										</SegmentedControl.Item>
										<SegmentedControl.Item value="function">
											{t("pluginStore.plugins", "插件")}
										</SegmentedControl.Item>
										<SegmentedControl.Item value="theme">
											{t("pluginStore.themes", "主题")}
										</SegmentedControl.Item>
									</SegmentedControl.Root>
									<SegmentedControl.Root
										value={location}
										onValueChange={setLocation}
										aria-label={t("pluginStore.filterLocation", "扩展来源")}
									>
										<SegmentedControl.Item value="online">
											{t("pluginStore.online", "在线")}
										</SegmentedControl.Item>
										<SegmentedControl.Item value="local">
											{t("pluginStore.local", "本地")}
										</SegmentedControl.Item>
									</SegmentedControl.Root>
								</Flex>
								{location === "local" ? (
									<>
										<label>
											{t("pluginStore.importZip", "导入插件包（ZIP）")}
											<input
												type="file"
												aria-label={t(
													"pluginStore.importZip",
													"导入插件包（ZIP）"
												)}
												accept=".zip"
												disabled={busy !== null}
												onChange={(event) => {
													const file = event.currentTarget.files?.[0];
													event.currentTarget.value = "";
													if (file)
														void run("local-import", async () => {
															if (!/\.zip$/i.test(file.name))
																throw new Error(
																	t("pluginStore.zipOnly", "请选择 ZIP 插件包")
																);
															const result = await installLocalPluginFile(file);
															if (result.ok)
																toast.success(
																	t("pluginStore.installSuccess", "已安装")
																);
															else if (
																!("cancelled" in result && result.cancelled)
															)
																toast.error(result.message);
														});
												}}
											/>
										</label>
										<SettingsGroup>{installedRows(local)}</SettingsGroup>
									</>
								) : (
									<>
										<Flex justify="end">
											<Button
												size="1"
												variant="ghost"
												disabled={loading}
												onClick={() => void refresh(true)}
											>
												<ArrowSync24Regular />
												{t("pluginStore.refresh", "刷新")}
											</Button>
										</Flex>
										{catalog === null && !loading && (
											<Text size="2" color="gray">
												{t(
													"pluginStore.unavailable",
													"商店目前不可用（离线或清单未发布）。这不影响编辑器和随应用附带的出厂插件。"
												)}
											</Text>
										)}
										<SettingsGroup>
											{entries.map((entry) => {
												const item = installations.find(
													(item) =>
														item.id === entry.id &&
														item.kind ===
															(entry.channel === "theme" ? "theme" : "function")
												);
												return (
													<CatalogEntryRow
														key={`${entry.provider.id}:${entry.id}`}
														entry={entry}
														installedVersion={item?.version ?? null}
														trustedUpdate={
															entry.provider.official
																? updates.find(
																		(update) => update.id === entry.id
																  )
																: undefined
														}
														trustedLive={
															item?.trustedJs?.loaded
																? {
																		version: item.version,
																		bundled: item.trustedJs.bundled,
																  }
																: undefined
														}
														busy={busy !== null}
														onAction={(action) =>
															void run(entry.id, async () => {
																if (action === "revert")
																	await pluginInstallationService.revertToFactory(
																		entry.id
																	);
																else if (action === "load")
																	await reloadTrustedJsPlugin(entry.id);
																else {
																	const result = await installStoreEntry(entry);
																	if (result.ok)
																		toast.success(
																			t("pluginStore.installSuccess", "已安装")
																		);
																	else if (!result.cancelled)
																		toast.error(result.message);
																}
																await refresh();
															})
														}
													/>
												);
											})}
										</SettingsGroup>
									</>
								)}
							</>
						)}
						{section === "installed" && (
							<SettingsGroup title={t("pluginStore.installedTitle", "已安装")}>
								{installedRows(installations)}
							</SettingsGroup>
						)}
						{section === "settings" && (
							<>
								<SettingsGroup title="商店提供者">
									<Text size="2">
										添加的来源均按第三方处理。JS
										插件可访问应用数据与登录态，安装时需要授权；主题可改变界面。当前技术原型允许
										HTTP localhost 来源。
									</Text>
									{shelves.map((shelf) => (
										<SettingsRow
											icon={<CloudArrowDown24Regular />}
											key={shelf.provider.id}
											title={shelf.provider.name}
											description={
												<span style={{ overflowWrap: "anywhere" }}>
													{shelf.provider.catalogUrl}
													<br />
													{shelf.error
														? `不可用：${shelf.error}${
																shelf.catalog ? "（显示本地缓存）" : ""
														  }`
														: shelf.fetchedAt
														? `缓存于 ${new Date(
																shelf.fetchedAt
														  ).toLocaleString()}`
														: "尚未获取，请在“可用插件 → 在线”中刷新目录"}
												</span>
											}
											action={
												!shelf.provider.official ? (
													<Button
														size="1"
														variant="soft"
														disabled={loading || busy !== null}
														onClick={() =>
															void run("provider", () =>
																storeProviderClient.remove(shelf.provider.id)
															)
														}
													>
														移除
													</Button>
												) : undefined
											}
										/>
									))}
									<form
										onSubmit={(event) => {
											event.preventDefault();
											void run("provider", async () => {
												storeProviderClient.add(providerName, providerUrl);
												setProviderName("");
												setProviderUrl("");
												await refresh(true);
											});
										}}
									>
										<Flex gap="2" wrap="wrap">
											<input
												aria-label="提供者名称"
												placeholder="提供者名称"
												value={providerName}
												onChange={(e) => setProviderName(e.target.value)}
												required
											/>
											<input
												aria-label="提供者目录 URL"
												placeholder="http://localhost:8787/plugins/catalog.json"
												type="url"
												value={providerUrl}
												onChange={(e) => setProviderUrl(e.target.value)}
												required
											/>
											<Button
												type="submit"
												size="1"
												disabled={loading || busy !== null}
											>
												添加第三方提供者
											</Button>
										</Flex>
									</form>
								</SettingsGroup>
								<PluginSettingsSections />
							</>
						)}
					</Flex>
				</div>
			</section>
		</>
	);
};
