import {
	Info24Regular,
	Keyboard24Regular,
	PaintBrush24Regular,
	PuzzlePiece24Regular,
	Settings24Regular,
} from "@fluentui/react-icons";
import { Box, Dialog, Heading, Text } from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import { useAtom } from "jotai";
import type { ComponentType } from "react";
import { memo, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { extensionRegistry } from "$/plugins/adapters/extension-host";
import { localizeText } from "$/plugins/ui/localize";
import { settingsDialogAtom, settingsTabAtom } from "$/states/dialogs.ts";
import { SettingsAboutTab } from "./about";
import { SettingsCommonTab } from "./common";
import { SettingsKeyBindingsDialog } from "./keybindings";
import { SettingsPersonalizationTab } from "./personalization";
import styles from "./SettingsDialog.module.css";

type SettingsSubpage = "customPalette";

const subscribeContributions = (listener: () => void) => {
	const disposable = extensionRegistry.contributions.subscribe(listener);
	return () => disposable.dispose();
};

/**
 * Plugin `settings-view` trusted views appear as extra tabs after the host
 * tabs. The settings shell, plugin manager, permissions and recovery entries
 * stay host-owned (goal.md stage 8 "帮助、设置和更新扩展"); a plugin only gets
 * a body slot, scoped with `data-amll-plugin-scope` for theme scoping.
 */
const usePluginSettingsViews = () => {
	useSyncExternalStore(
		subscribeContributions,
		() => extensionRegistry.contributions.getRevision(),
		() => 0,
	);
	return extensionRegistry.contributions.getTrustedViews("settings-view");
};

const contentTransition = {
	duration: 0.25,
	ease: [0.4, 0, 0.2, 1],
} as const;

const contentVariants = {
	initial: { opacity: 0, y: 12 },
	animate: { opacity: 1, y: 0 },
} as const;

export const SettingsDialog = memo(() => {
	const [settingsDialogOpen, setSettingsDialogOpen] =
		useAtom(settingsDialogAtom);
	const [requestedTab, setActiveTab] = useAtom(settingsTabAtom);
	const [activeSubpage, setActiveSubpage] = useState<SettingsSubpage | null>(
		null,
	);
	const { t, i18n } = useTranslation();
	const pluginViews = usePluginSettingsViews();

	const pluginTabs = useMemo(
		() =>
			pluginViews.map((view) => ({
				value: view.id,
				icon: PuzzlePiece24Regular,
				label: localizeText(view.title, i18n.language),
				view,
			})),
		[pluginViews, i18n.language],
	);

	const hostTabConfig = useMemo(
		() => [
			{
				value: "common",
				icon: Settings24Regular,
				label: t("settingsDialog.tab.general", "常规"),
			},
			{
				value: "keybinding",
				icon: Keyboard24Regular,
				label: t("settingsDialog.tab.keybindings", "按键绑定"),
			},
			{
				value: "personalization",
				icon: PaintBrush24Regular,
				label: t("settingsDialog.tab.appearance", "个性化"),
			},
			{
				value: "about",
				icon: Info24Regular,
				label: t("settingsDialog.tab.about", "关于"),
			},
		],
		[t],
	);
	const tabConfig = useMemo(
		() => [...hostTabConfig, ...pluginTabs],
		[hostTabConfig, pluginTabs],
	);
	const activeTab = tabConfig.some((tab) => tab.value === requestedTab)
		? requestedTab
		: "common";
	const activePluginTab = pluginTabs.find((tab) => tab.value === activeTab);
	const ActivePluginView = activePluginTab?.view.view as
		| ComponentType
		| undefined;

	const activeTabConfig =
		tabConfig.find((tab) => tab.value === activeTab) ?? tabConfig[0];
	const activeTabTitle = activeTabConfig.label;
	const subpageTitle =
		activeTab === "personalization"
			? activeSubpage === "customPalette"
				? t("settings.spectrogram.customPaletteTitle", "自定义频谱图配色")
				: null
			: null;
	const onSubpageChange = (nextSubpage: SettingsSubpage | null) => {
		setActiveSubpage(nextSubpage);
	};

	return (
		<Dialog.Root open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
			<Dialog.Content className={styles.dialogContent} data-amll-protected>
				<Dialog.Title className={styles.srOnly}>
					{t("settingsDialog.title", "首选项")}
				</Dialog.Title>

				<aside className={styles.sidebar}>
					<Text as="div" weight="bold" size="2" className={styles.sidebarTitle}>
						{t("settingsDialog.title", "首选项")}
					</Text>
					<nav className={styles.navList}>
						{tabConfig.map((tab) => {
							const Icon = tab.icon;
							const selected = activeTab === tab.value;

							return (
								<button
									key={tab.value}
									type="button"
									className={styles.navItem}
									data-active={selected || undefined}
									onClick={() => {
										setActiveSubpage(null);
										setActiveTab(tab.value);
									}}
								>
									<Icon className={styles.navIcon} />
									<span>{tab.label}</span>
								</button>
							);
						})}
					</nav>
				</aside>

				<section className={styles.mainPane}>
					<header className={styles.header}>
						<Heading size="7" className={styles.pageTitle}>
							<span className={styles.titleText}>
								{subpageTitle ? (
									<button
										type="button"
										className={styles.titleButton}
										onClick={() => onSubpageChange(null)}
									>
										{activeTabTitle}
									</button>
								) : (
									<span>{activeTabTitle}</span>
								)}
								{subpageTitle && (
									<>
										<span className={styles.titleSeparator}>{">"}</span>
										<span className={styles.titleCurrent}>{subpageTitle}</span>
									</>
								)}
							</span>
						</Heading>
					</header>

					<Box className={styles.scrollContent}>
						<AnimatePresence mode="wait" initial={false}>
							<motion.div
								key={activeTab}
								className={styles.contentTransition}
								variants={contentVariants}
								initial="initial"
								animate="animate"
								transition={contentTransition}
							>
								{activeTab === "common" && <SettingsCommonTab />}
								{activeTab === "keybinding" && <SettingsKeyBindingsDialog />}
								{activeTab === "personalization" && (
									<SettingsPersonalizationTab
										subpage={activeSubpage}
										onSubpageChange={onSubpageChange}
									/>
								)}
								{activeTab === "about" && <SettingsAboutTab />}
								{activePluginTab && ActivePluginView && (
									<div
										data-amll-plugin-scope={
											activePluginTab.view.owner.kind === "plugin"
												? activePluginTab.view.owner.pluginId
												: activePluginTab.view.owner.id
										}
									>
										<ActivePluginView />
									</div>
								)}
							</motion.div>
						</AnimatePresence>
					</Box>
				</section>
			</Dialog.Content>
		</Dialog.Root>
	);
});
