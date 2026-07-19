import {
	Beaker24Regular,
	Database24Regular,
	Info24Regular,
	Keyboard24Regular,
	Link24Regular,
	PaintBrush24Regular,
	Settings24Regular,
	SpeakerSettings24Regular,
} from "@fluentui/react-icons";
import { Box, Dialog, Heading, Text } from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import { useAtom } from "jotai";
import { memo, type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
// #if DEV
import { DevelopmentSettings } from "$/modules/settings/modals/development";
// #endif
import { settingsDialogAtom, settingsTabAtom } from "$/states/dialogs.ts";
import { SettingsAboutTab } from "./about";
import { SettingsAMLLTab } from "./amll";
import { SettingsCommonTab } from "./common";
import { type SettingsConnectSubpage, SettingsConnectTab } from "./connect";
import { SettingsKeyBindingsDialog } from "./keybindings";
import { SettingsPersonalizationTab } from "./personalization";
import styles from "./SettingsDialog.module.css";
import { SettingsStorageTab } from "./storage";

type SettingsPersonalizationSubpage = "customBackground" | "customPalette";
type SettingsSubpage = SettingsPersonalizationSubpage | SettingsConnectSubpage;

const contentTransition = {
	duration: 0.3,
	ease: [0.2, 0.8, 0.2, 1],
} as const;

const contentVariants = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	exit: { opacity: 0 },
} as const;

export const SettingsDialog = memo(() => {
	const [settingsDialogOpen, setSettingsDialogOpen] =
		useAtom(settingsDialogAtom);
	const [activeTab, setActiveTab] = useAtom(settingsTabAtom);
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
				value: "connect",
				icon: Link24Regular,
				label: t("settingsDialog.tab.connect", "连接"),
			},
			{
				value: "amll",
				icon: SpeakerSettings24Regular,
				label: t("settingsDialog.tab.amll", "AMLL"),
			},
			{
				value: "storage",
				icon: Database24Regular,
				label: t("settingsDialog.tab.storage", "存储"),
			},
			// #if DEV
			{
				value: "development",
				icon: Beaker24Regular,
				label: t("settingsDialog.tab.development", "开发"),
			},
			// #endif
			{
				value: "about",
				icon: Info24Regular,
				label: t("settingsDialog.tab.about", "关于"),
			},
		],
		[t],
	);

	const activeTabConfig =
		tabConfig.find((tab) => tab.value === activeTab) ?? tabConfig[0];
	const activeTabTitle = activeTabConfig.label;
	const personalizationSubpage =
		activeTab === "personalization" &&
		(activeSubpage === "customBackground" || activeSubpage === "customPalette")
			? activeSubpage
			: null;
	const connectSubpage =
		activeTab === "connect" &&
		(activeSubpage === "reviewHiddenLabels" ||
			activeSubpage === "reviewHiddenUsers")
			? activeSubpage
			: null;
	const subpageTitle =
		activeTab === "personalization"
			? personalizationSubpage === "customBackground"
				? t("settings.common.customBackground", "自定义背景")
				: personalizationSubpage === "customPalette"
					? t("settings.spectrogram.customPaletteTitle", "自定义频谱图配色")
					: null
			: activeTab === "connect"
				? connectSubpage === "reviewHiddenLabels"
					? t("settings.connect.reviewHiddenLabelsTitle", "审阅隐藏标签")
					: connectSubpage === "reviewHiddenUsers"
						? t("settings.connect.reviewHiddenUsersTitle", "隐藏指定用户")
						: null
				: null;
	const subpageParentTitle =
		activeTab === "connect" && connectSubpage ? "Github" : null;
	const onSubpageChange = (nextSubpage: SettingsSubpage | null) => {
		setActiveSubpage(nextSubpage);
	};
	let developmentContent: ReactNode = null;
	// #if DEV
	developmentContent =
		activeTab === "development" ? <DevelopmentSettings /> : null;
	// #endif

	return (
		<Dialog.Root open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
			<Dialog.Content className={styles.dialogContent}>
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
										{subpageParentTitle && (
											<>
												<span className={styles.titleCurrent}>
													{subpageParentTitle}
												</span>
												<span className={styles.titleSeparator}>{">"}</span>
											</>
										)}
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
								exit="exit"
								transition={contentTransition}
							>
								{activeTab === "common" && <SettingsCommonTab />}
								{activeTab === "keybinding" && <SettingsKeyBindingsDialog />}
								{activeTab === "personalization" && (
									<SettingsPersonalizationTab
										subpage={personalizationSubpage}
										onSubpageChange={onSubpageChange}
									/>
								)}
								{activeTab === "connect" && (
									<SettingsConnectTab
										subpage={connectSubpage}
										onSubpageChange={onSubpageChange}
									/>
								)}
								{activeTab === "amll" && <SettingsAMLLTab />}
								{activeTab === "storage" && <SettingsStorageTab />}
								{developmentContent}
								{activeTab === "about" && <SettingsAboutTab />}
							</motion.div>
						</AnimatePresence>
					</Box>
				</section>
			</Dialog.Content>
		</Dialog.Root>
	);
});
