import type { RemotePluginCatalogV0 } from "@amll-ttml-tool/plugin-api";
import {
	ArrowLeft24Regular,
	ArrowSortDown24Regular,
	ArrowSortUp24Regular,
	ArrowSync24Regular,
	CloudArrowDown24Regular,
	FolderOpen24Regular,
	StoreMicrosoft24Regular,
	Javascript24Regular,
	PaintBrush24Regular,
	PuzzlePiece24Regular,
	Settings24Regular,
} from "@fluentui/react-icons";
import {
	Badge,
	Button,
	Flex,
	IconButton,
	Link,
	SegmentedControl,
	Select,
	Text,
	TextField,
} from "@radix-ui/themes";
import { useAtom } from "jotai";
import {
	type ComponentType,
	useCallback,
	useEffect,
	useState,
	useRef,
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
import { installedDependencyNodes } from "$/plugins/trusted/dependency-context";
import type { ProviderCatalogEntry } from "$/plugins/store/store-providers";
import { FACTORY_TRUSTED_JS_PLUGINS } from "$/plugins/trusted/factory-plugins";
import { reloadTrustedJsPlugin } from "$/plugins/trusted/trusted-js-host";
import { installLocalPluginFile } from "$/plugins/ui/local-package-install";
import { localizeText } from "$/plugins/ui/localize";
import { pluginStoreSectionAtom } from "$/states/dialogs";
import { PluginCard, PluginCardGroup } from "./PluginCard";
import cardStyles from "./PluginCard.module.css";
import { compareSortKeys, type SortField, type SortKey } from "./sort";

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
	enabled: boolean;
	onToggle?: () => void;
	trustedLive?: { version: string; bundled: boolean };
	busy: boolean;
	onAction(action: "install" | "load"): void;
}

const CatalogEntryRow = ({
	entry,
	installedVersion,
	enabled,
	onToggle,
	trustedLive,
	busy,
	onAction,
}: CatalogEntryRowProps) => {
	const { t } = useTranslation();
	const badge = CHANNEL_BADGES[entry.channel];

	const installed = installedVersion !== null || trustedLive !== undefined;
	const statusBadge = entry.blockedReason ? (
		<Badge color="red">{entry.blockedReason}</Badge>
	) : null;
	const action = (
		<Flex gap="2" justify="end" wrap="wrap">
			<Button
				size="1"
				variant="soft"
				color={installed ? "gray" : undefined}
				disabled={busy || installed || Boolean(entry.blockedReason)}
				onClick={() =>
					onAction(
						entry.channel === "trusted-js" &&
							!/\.(zip|json)$/i.test(entry.entry)
							? "load"
							: "install",
					)
				}
			>
				{!installed && <CloudArrowDown24Regular width="1em" height="1em" />}
				{installed
					? t("pluginStore.installed", "已安装")
					: t("pluginStore.install", "安装")}
			</Button>
			<Button
				size="1"
				variant="soft"
				color={enabled ? "gray" : undefined}
				disabled={busy || !installed || !onToggle}
				aria-label={`${entry.name} ${enabled ? t("pluginStore.disable", "禁用") : t("pluginStore.enable", "启用")}`}
				onClick={onToggle}
			>
				{enabled
					? t("pluginStore.disable", "禁用")
					: t("pluginStore.enable", "启用")}
			</Button>
		</Flex>
	);

	return (
		<PluginCard
			title={entry.name}
			version={entry.version}
			icon={CHANNEL_ICONS[entry.channel]}
			badges={
				<Flex align="center" gap="2" wrap="wrap">
					<Badge color="gray">{entry.provider.name}</Badge>
					{entry.mirrorOf && <Badge color="gray">镜像：{entry.mirrorOf}</Badge>}
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

const subscribeContributions = (listener: () => void) => {
	const disposable = extensionRegistry.contributions.subscribe(listener);
	return () => disposable.dispose();
};

/**
 * Plugin `settings-view` trusted views appear as plugin manager pages below
 * the host sections. The settings shell, plugin manager, permissions and
 * recovery entries stay host-owned (goal.md stage 8 "帮助、设置和更新扩展"); a
 * plugin only gets a body slot, scoped with `data-amll-plugin-scope` for theme
 * scoping.
 */
let settingsViewsRevision = -1;
let settingsViewsSnapshot =
	extensionRegistry.contributions.getTrustedViews("settings-view");
const getSettingsViewsSnapshot = () => {
	const revision = extensionRegistry.contributions.getRevision();
	if (revision !== settingsViewsRevision) {
		settingsViewsRevision = revision;
		settingsViewsSnapshot =
			extensionRegistry.contributions.getTrustedViews("settings-view");
	}
	return settingsViewsSnapshot;
};
// Subscribe to the actual stable list, not an unused revision. React Compiler
// may otherwise memoize the separate registry read forever.
const usePluginSettingsViews = () =>
	useSyncExternalStore(
		subscribeContributions,
		getSettingsViewsSnapshot,
		getSettingsViewsSnapshot,
	);

const HOST_SECTIONS = ["available", "installed", "settings"];

/** The manager replaces the settings body inside its protected dialog shell. */
export const PluginManager = ({ onBack }: { onBack(): void }) => {
	const importInput = useRef<HTMLInputElement>(null);
	const { t, i18n } = useTranslation();
	const shelves = useSyncExternalStore(
		storeProviderClient.subscribe,
		storeProviderClient.list,
	);
	const [providerName, setProviderName] = useState("");
	const [providerUrl, setProviderUrl] = useState("");
	const [requestedSection, setSection] = useAtom(pluginStoreSectionAtom);
	// Fixed title order, independent of the list sort controls.
	const settingsPages = usePluginSettingsViews()
		.map((view) => ({ view, title: localizeText(view.title, i18n.language) }))
		.sort((a, b) => a.title.localeCompare(b.title, i18n.language));
	const activePage = settingsPages.find(
		({ view }) => view.id === requestedSection,
	);
	const ActivePageView = activePage?.view.view as ComponentType | undefined;
	// A page whose plugin was disabled or unloaded falls back to the first section.
	const section =
		activePage || HOST_SECTIONS.includes(requestedSection)
			? requestedSection
			: "available";
	const [kind, setKind] = useState("all");
	const [sortField, setSortField] = useState<SortField>("name");
	const [sortDescending, setSortDescending] = useState(false);
	const [location, setLocation] = useState("online");
	const [catalog, setCatalog] = useState<RemotePluginCatalogV0 | null>(null);
	const [loading, setLoading] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);
	const [installations, setInstallations] = useState(() =>
		pluginInstallationService.list(),
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
		() => extensionRegistry.contributions.getRevision(),
	);
	// Override chain in enable order: later sources win the keys they share.
	const overriddenBy = (pluginId: string) => {
		const sources = new Map<
			string,
			{ kinds: Set<string>; shadowedBy: Map<string, Set<string>> }
		>();
		for (const source of extensionRegistry.contributions.overrides.getSources(
			pluginId,
		)) {
			const merged = sources.get(source.sourcePluginId) ?? {
				kinds: new Set(),
				shadowedBy: new Map(),
			};
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
		return [...sources].map(([id, { kinds, shadowedBy }]) => {
			const by = installations.find((candidate) => candidate.id === id);
			const shadowed = new Set(
				[...shadowedBy.values()].flatMap((keys) => [...keys]),
			);
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
			setCatalog(await loadRemotePluginCatalog({ refresh: force }));
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
		operation: () => unknown | Promise<unknown>,
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
	const compare = (a: SortKey, b: SortKey) =>
		compareSortKeys(a, b, sortField, sortDescending, i18n.language);
	const installationOf = (entry: ProviderCatalogEntry) =>
		installations.find(
			(item) =>
				item.id === entry.id &&
				item.kind === (entry.channel === "theme" ? "theme" : "function"),
		);
	const sortedInstallations = [...installations].sort(compare);
	const factoryIds = new Set(FACTORY_TRUSTED_JS_PLUGINS.map((p) => p.id));
	const entries = storeProviderClient
		.entries(factoryIds)
		.filter(
			(entry) =>
				(entry.platforms === undefined ||
					entry.platforms.includes(
						import.meta.env.TAURI_ENV_PLATFORM ? "desktop" : "web",
					)) &&
				(kind === "all" ||
					entry.channel === (kind === "theme" ? "theme" : "trusted-js")),
		)
		.map((entry) => ({ entry, item: installationOf(entry) }))
		.sort((a, b) =>
			compare(
				{ ...a.item, name: a.entry.name },
				{ ...b.item, name: b.entry.name },
			),
		);
	const local = sortedInstallations.filter(
		(item) => kind === "all" || item.kind === kind,
	);
	const sortControls = (
		<Flex align="center" gap="2">
			<Select.Root
				size="2"
				value={sortField}
				onValueChange={(value) => setSortField(value as SortField)}
			>
				<Select.Trigger
					className={cardStyles.sortSelect}
					aria-label={t("pluginStore.sortBy", "排序方式")}
				/>
				<Select.Content>
					<Select.Item value="name">
						{t("pluginStore.sort.name", "名称")}
					</Select.Item>
					<Select.Item value="installedAt">
						{t("pluginStore.sort.installedAt", "安装时间")}
					</Select.Item>
					<Select.Item value="updatedAt">
						{t("pluginStore.sort.updatedAt", "更新时间")}
					</Select.Item>
				</Select.Content>
			</Select.Root>
			<IconButton
				size="2"
				variant="soft"
				aria-label={
					sortDescending
						? t("pluginStore.sortDescending", "降序")
						: t("pluginStore.sortAscending", "升序")
				}
				title={
					sortDescending
						? t("pluginStore.sortDescending", "降序")
						: t("pluginStore.sortAscending", "升序")
				}
				onClick={() => setSortDescending((value) => !value)}
			>
				{sortDescending ? (
					<ArrowSortDown24Regular width="1em" height="1em" />
				) : (
					<ArrowSortUp24Regular width="1em" height="1em" />
				)}
			</IconButton>
		</Flex>
	);
	const nameOf = (id: string) =>
		installations.find((candidate) => candidate.id === id)?.name ?? id;
	// First disabled required dependency, followed transitively.
	const dependencyNodes = installedDependencyNodes();
	const disabledDependency = (
		id: string,
		seen = new Set<string>(),
	): string | undefined => {
		seen.add(id);
		const node = dependencyNodes.find((candidate) => candidate.id === id);
		for (const dependency of node?.dependencies ?? []) {
			if (dependency.optional || seen.has(dependency.id)) continue;
			const target = dependencyNodes.find(
				(candidate) => candidate.id === dependency.id,
			);
			if (target && !target.enabled) return dependency.id;
			const nested = disabledDependency(dependency.id, seen);
			if (nested) return nested;
		}
	};
	const isFactory = (item: (typeof installations)[number]) =>
		item.source === "builtin" || Boolean(item.trustedJs?.hasFactory);
	const groupedRows = (items: typeof installations) =>
		(
			[
				[t("pluginStore.factoryGroup", "出厂插件"), items.filter(isFactory)],
				[
					t("pluginStore.thirdPartyGroup", "第三方插件"),
					items.filter((item) => !isFactory(item)),
				],
			] as const
		).map(
			([title, group]) =>
				group.length > 0 && (
					<PluginCardGroup key={title} title={title}>
						{installedRows(group)}
					</PluginCardGroup>
				),
		);
	const installedRows = (items: typeof installations) =>
		items.map((item) => {
			const trusted = item.trustedJs;
			const removable =
				item.source !== "builtin" || Boolean(trusted?.hasInstalledPackage);
			const overrides = item.kind === "function" ? overriddenBy(item.id) : [];
			const blockedBy =
				item.theme?.disabledByDependency ?? disabledDependency(item.id);
			return (
				<PluginCard
					title={item.name}
					version={item.version}
					key={`${item.kind}:${item.id}`}
					dimmed={!item.enabled || blockedBy !== undefined}
					icon={
						item.icon ? (
							<img src={item.icon} alt="" width={24} height={24} />
						) : item.kind === "theme" ? (
							<PaintBrush24Regular />
						) : (
							<Javascript24Regular />
						)
					}
					badges={
						<Flex gap="2" align="center" wrap="wrap">
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
							{!item.enabled && !trusted && !blockedBy && (
								<Badge color="gray">
									{t("pluginStore.status.disabled", "已禁用")}
								</Badge>
							)}
							{blockedBy && (
								<Badge color="red">
									{t("pluginStore.dependencyDisabled", "依赖不可用：{name}", {
										name: nameOf(blockedBy),
									})}
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
							{item.author !== undefined && (
								<Text
									size="1"
									color="gray"
									style={{ overflowWrap: "anywhere" }}
								>
									{t("pluginStore.author", "作者")}: {item.author}
								</Text>
							)}
							{item.homepage && (
								<Link
									size="1"
									href={item.homepage}
									target="_blank"
									rel="noopener noreferrer"
									style={{ overflowWrap: "anywhere" }}
								>
									{item.homepage}
								</Link>
							)}
							<span style={{ overflowWrap: "anywhere" }}>
								{t(`pluginStore.source.${item.source}`, item.source)}
								{item.artifact ? ` · SHA-256: ${item.artifact.sha256}` : ""}
								{item.store && (
									<span>
										{" "}
										· {item.store.providerName}
										{!shelves.some(
											(s) => s.provider.id === item.store?.providerId,
										) && "（来源已移除，不再更新）"}
									</span>
								)}
							</span>
							{overrides.length > 1 && (
								<span>
									{t("pluginStore.overrideChain", "覆盖链（后启用者优先）")}
								</span>
							)}
							{overrides.map((source, index) => (
								<span key={source.id} style={{ overflowWrap: "anywhere" }}>
									{overrides.length > 1 ? `${index + 1}. ` : ""}
									{t(
										"pluginStore.overrideSource",
										"覆盖：{name}（{id}，{kinds}）",
										{
											name: source.name,
											id: source.id,
											kinds: source.kinds,
										},
									)}
									{source.origin ? ` · ${source.origin}` : ""}
									{source.shadowed ? ` · ${source.shadowed}` : ""}
								</span>
							))}
						</Flex>
					}
					action={
						<Flex gap="2" align="center" wrap="wrap">
							{section === "available" && (
								<Button
									size="1"
									variant="soft"
									color={removable ? "red" : "gray"}
									disabled={!removable || busy !== null}
									aria-label={`${item.name} ${removable ? t("pluginStore.uninstall", "卸载") : t("pluginStore.installed", "已安装")}`}
									onClick={() =>
										void run(item.id, () =>
											pluginInstallationService.uninstall(item.kind, item.id),
										)
									}
								>
									{removable
										? t("pluginStore.uninstall", "卸载")
										: t("pluginStore.installed", "已安装")}
								</Button>
							)}
							<Button
								size="1"
								variant="soft"
								color={item.enabled ? "gray" : undefined}
								aria-label={`${item.name} ${item.enabled ? t("pluginStore.disable", "禁用") : t("pluginStore.enable", "启用")}`}
								disabled={busy !== null || item.theme?.safeMode}
								onClick={() =>
									void run(item.id, async () => {
										const enabled = !item.enabled;
										await pluginInstallationService.setEnabled(
											item.kind,
											item.id,
											enabled,
										);
										if (!enabled && trusted?.hasFactory)
											toast.info(
												t(
													"pluginStore.factoryDisableReloadHint",
													"部分内置插件禁用后需刷新页面才能完全生效",
												),
											);
									})
								}
							>
								{item.enabled
									? t("pluginStore.disable", "禁用")
									: t("pluginStore.enable", "启用")}
							</Button>
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
					{settingsPages.length > 0 && <hr className={styles.navDivider} />}
					{settingsPages.map(({ view, title }) => (
						<button
							type="button"
							key={view.id}
							className={styles.navItem}
							data-active={section === view.id || undefined}
							onClick={() => setSection(view.id)}
						>
							<PuzzlePiece24Regular className={styles.navIcon} />
							<span>{title}</span>
						</button>
					))}
				</nav>
			</aside>
			<section className={styles.mainPane}>
				<header className={styles.header} />
				<div className={styles.scrollContent}>
					<Flex direction="column" gap="4">
						<input
							ref={importInput}
							hidden
							type="file"
							aria-label={t("pluginStore.importZip", "导入插件包（ZIP）")}
							accept=".zip"
							disabled={busy !== null}
							onChange={(event) => {
								const file = event.currentTarget.files?.[0];
								event.currentTarget.value = "";
								if (file)
									void run("local-import", async () => {
										if (!/\.zip$/i.test(file.name))
											throw new Error(
												t("pluginStore.zipOnly", "请选择 ZIP 插件包"),
											);
										const result = await installLocalPluginFile(file);
										if (result.ok)
											toast.success(t("pluginStore.installSuccess", "已安装"));
										else if (!("cancelled" in result && result.cancelled))
											toast.error(result.message);
									});
							}}
						/>
						{(section === "available" || section === "installed") && (
							<section
								className={cardStyles.importPanel}
								aria-label={t("pluginStore.importTitle", "导入插件")}
							>
								<div className={cardStyles.importDescription}>
									<Text as="div" size="3" weight="medium">
										{t("pluginStore.importTitle", "导入插件")}
									</Text>
									<Text as="p" size="2" color="gray">
										{t(
											"pluginStore.importHint",
											"从本地 ZIP 安装插件，或浏览在线商店。",
										)}
									</Text>
								</div>
								<Flex gap="2" wrap="wrap" className={cardStyles.importActions}>
									<Button
										size="2"
										variant="soft"
										disabled={busy !== null}
										onClick={() => importInput.current?.click()}
									>
										<FolderOpen24Regular width="1em" height="1em" />
										{t("pluginStore.localImport", "本地导入")}
									</Button>
									<Button
										size="2"
										variant="soft"
										onClick={() => {
											setSection("available");
											setLocation("online");
										}}
									>
										<StoreMicrosoft24Regular width="1em" height="1em" />
										{t("pluginStore.onlineStore", "在线商店")}
									</Button>
								</Flex>
							</section>
						)}

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
									<Flex align="center" gap="3" wrap="wrap">
										{sortControls}
									</Flex>
								</Flex>
								{location === "local" ? (
									<>{groupedRows(local)}</>
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
													"商店目前不可用（离线或清单未发布）。这不影响编辑器和随应用附带的出厂插件。",
												)}
											</Text>
										)}
										{(
											[
												[
													t("pluginStore.factoryGroup", "出厂插件"),
													entries.filter(({ entry }) =>
														factoryIds.has(entry.id),
													),
												],
												[
													t("pluginStore.thirdPartyGroup", "第三方插件"),
													entries.filter(
														({ entry }) => !factoryIds.has(entry.id),
													),
												],
											] as const
										).map(
											([title, group]) =>
												group.length > 0 && (
													<PluginCardGroup key={title} title={title}>
														{group.map(({ entry, item }) => {
															return (
																<CatalogEntryRow
																	key={`${entry.provider.id}:${entry.id}`}
																	entry={entry}
																	installedVersion={item?.version ?? null}
																	enabled={item?.enabled ?? false}
																	onToggle={
																		item && !item.theme?.safeMode
																			? () =>
																					void run(item.id, async () => {
																						await pluginInstallationService.setEnabled(
																							item.kind,
																							item.id,
																							!item.enabled,
																						);
																						if (
																							item.enabled &&
																							item.trustedJs?.hasFactory
																						)
																							toast.info(
																								t(
																									"pluginStore.factoryDisableReloadHint",
																									"部分内置插件禁用后需刷新页面才能完全生效",
																								),
																							);
																					})
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
																			if (action === "load")
																				await reloadTrustedJsPlugin(entry.id);
																			else {
																				const result =
																					await installStoreEntry(entry);
																				if (result.ok)
																					toast.success(
																						t(
																							"pluginStore.installSuccess",
																							"已安装",
																						),
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
													</PluginCardGroup>
												),
										)}
									</>
								)}
							</>
						)}
						{section === "installed" && (
							<>
								<Flex justify="end">{sortControls}</Flex>
								{groupedRows(sortedInstallations)}
							</>
						)}
						{section === "settings" && (
							<>
								<SettingsGroup variant="card" title="商店提供者">
									<Text as="p" size="2" color="gray">
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
																	shelf.fetchedAt,
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
																storeProviderClient.remove(shelf.provider.id),
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
										className={cardStyles.providerForm}
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
										<Text as="div" size="2" weight="medium">
											添加第三方来源
										</Text>
										<Flex gap="3" wrap="wrap">
											<TextField.Root
												size="2"
												aria-label="提供者名称"
												placeholder="提供者名称"
												value={providerName}
												onChange={(e) => setProviderName(e.target.value)}
												required
											/>
											<TextField.Root
												size="2"
												aria-label="提供者目录 URL"
												placeholder="http://localhost:8787/plugins/catalog.json"
												type="url"
												value={providerUrl}
												onChange={(e) => setProviderUrl(e.target.value)}
												required
											/>
											<Button
												type="submit"
												size="2"
												variant="soft"
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
						{activePage && ActivePageView && (
							<div
								data-amll-plugin-scope={
									activePage.view.owner.kind === "plugin"
										? activePage.view.owner.pluginId
										: activePage.view.owner.id
								}
							>
								<ActivePageView />
							</div>
						)}
					</Flex>
				</div>
			</section>
		</>
	);
};
