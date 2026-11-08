import {
	Info24Regular,
	Keyboard24Regular,
	PaintBrush24Regular,
	Settings24Regular,
} from "@fluentui/react-icons";
import { Box, Dialog, Heading, Text } from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import { useAtom } from "jotai";
import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	pluginStoreDialogAtom,
	settingsDialogAtom,
	settingsTabAtom,
} from "$/states/dialogs.ts";
import { PluginManager } from "$/modules/plugin-store/PluginStoreDialog";
import { SettingsAboutTab } from "./about";
import { SettingsCommonTab } from "./common";
import { SettingsKeyBindingsDialog } from "./keybindings";
import { SettingsPersonalizationTab } from "./personalization";
import styles from "./SettingsDialog.module.css";

type SettingsSubpage = "customPalette";

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
	const [managerOpen, setManagerOpen] = useAtom(pluginStoreDialogAtom);
	const [requestedTab, setActiveTab] = useAtom(settingsTabAtom);
	const [activeSubpage, setActiveSubpage] = useState<SettingsSubpage | null>(
		null,
	);
	const { t } = useTranslation();

	const tabConfig = useMemo(
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
	const activeTab = tabConfig.some((tab) => tab.value === requestedTab)
		? requestedTab
		: "common";

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
		<Dialog.Root
			open={settingsDialogOpen || managerOpen}
			onOpenChange={(open) => {
				setSettingsDialogOpen(open);
				if (!open) setManagerOpen(false);
			}}
		>
			<Dialog.Content
				className={styles.dialogContent}
				data-manager={managerOpen || undefined}
				data-amll-protected
			>
				<Dialog.Title className={styles.srOnly}>
					{managerOpen
						? t("pluginStore.title", "插件管理")
						: t("settingsDialog.title", "首选项")}
				</Dialog.Title>

				{/* Cross-fades the page while the dialog resizes (see data-manager). */}
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={managerOpen ? "manager" : "settings"}
						className={styles.pageFade}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeInOut" }}
					>
						{managerOpen ? (
							<PluginManager
								onBack={() => {
									setManagerOpen(false);
									setSettingsDialogOpen(true);
								}}
							/>
						) : (
							<>
								<aside className={styles.sidebar}>
									<Text
										as="div"
										weight="bold"
										size="2"
										className={styles.sidebarTitle}
									>
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
														<span className={styles.titleCurrent}>
															{subpageTitle}
														</span>
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
												{activeTab === "keybinding" && (
													<SettingsKeyBindingsDialog />
												)}
												{activeTab === "personalization" && (
													<SettingsPersonalizationTab
														subpage={activeSubpage}
														onSubpageChange={onSubpageChange}
													/>
												)}
												{activeTab === "about" && <SettingsAboutTab />}
											</motion.div>
										</AnimatePresence>
									</Box>
								</section>
							</>
						)}
					</motion.div>
				</AnimatePresence>
			</Dialog.Content>
		</Dialog.Root>
	);
});
