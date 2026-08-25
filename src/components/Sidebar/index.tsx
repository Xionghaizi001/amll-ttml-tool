import { Dismiss16Regular } from "@fluentui/react-icons";
import { Box, IconButton } from "@radix-ui/themes";
import { motion } from "framer-motion";
import type { TFunction } from "i18next";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
	type FC,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	activeSidebarTabAtom,
	closeTabAtom,
	openSidebarTabsAtom,
	type SidebarPanelType,
	sidebarWidthAtom,
} from "$/states/sidebar.ts";
import { BpmPanel } from "./BpmPanel";
import styles from "./index.module.css";
import { OutlinePanel } from "./OutlinePanel";
import { SidebarTabBar } from "./SidebarTabBar";

const MIN_WIDTH = 200;
const SNAP_CLOSE_THRESHOLD = 20;
const MAX_WIDTH = 650;

export interface SidebarTab {
	id: Exclude<SidebarPanelType, "none">;
	getTitle: (t: TFunction) => string;
	component: FC;
}

export const SIDEBAR_TABS: SidebarTab[] = [
	{
		id: "outline",
		getTitle: (t) => t("sidebar.outline.title", "大纲"),
		component: OutlinePanel,
	},
	{
		id: "bpm",
		getTitle: (t) => t("sidebar.bpm.title", "BPM"),
		component: BpmPanel,
	},
];

export const Sidebar = () => {
	const { t } = useTranslation();
	const openTabs = useAtomValue(openSidebarTabsAtom);
	const [activePanel, setActivePanel] = useAtom(activeSidebarTabAtom);
	const closeTab = useSetAtom(closeTabAtom);
	const [savedWidth, setSavedWidth] = useAtom(sidebarWidthAtom);

	const [isDragging, setIsDragging] = useState(false);
	const [tempWidth, setTempWidth] = useState(savedWidth);
	const sidebarRef = useRef<HTMLDivElement>(null);

	const visibleTabs = useMemo(
		() =>
			openTabs
				.map((id) => SIDEBAR_TABS.find((tab) => tab.id === id))
				.filter((tab): tab is SidebarTab => tab !== undefined),
		[openTabs],
	);

	const lastNonEmptyTabsCountRef = useRef(visibleTabs.length);
	if (visibleTabs.length > 0) {
		lastNonEmptyTabsCountRef.current = visibleTabs.length;
	}

	const isSingleTab =
		visibleTabs.length === 1 ||
		(visibleTabs.length === 0 && lastNonEmptyTabsCountRef.current === 1);

	const contentWidth = tempWidth > 0 ? tempWidth : savedWidth;

	const isOpen = activePanel !== "none" && visibleTabs.length > 0;

	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		setIsDragging(true);
	}, []);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!isDragging || !sidebarRef.current) return;

			const newWidth = e.clientX;
			const maxAllowedWidth = Math.min(MAX_WIDTH, window.innerWidth * 0.5);

			if (newWidth <= SNAP_CLOSE_THRESHOLD) {
				setTempWidth(0);
			} else {
				setTempWidth(Math.min(Math.max(newWidth, MIN_WIDTH), maxAllowedWidth));
			}
		},
		[isDragging],
	);

	const handlePointerUp = useCallback(
		(e: React.PointerEvent) => {
			if (!isDragging) return;
			setIsDragging(false);
			e.currentTarget.releasePointerCapture(e.pointerId);

			if (tempWidth <= SNAP_CLOSE_THRESHOLD) {
				setActivePanel("none");
				setTempWidth(savedWidth);
			} else {
				setSavedWidth(tempWidth);
			}
		},
		[isDragging, tempWidth, savedWidth, setActivePanel, setSavedWidth],
	);

	useEffect(() => {
		if (!isDragging) setTempWidth(savedWidth);
	}, [savedWidth, isDragging]);

	return (
		<div
			style={{ position: "relative", height: "100%", flexShrink: 0 }}
			data-slot="sidebar"
		>
			<motion.div
				ref={sidebarRef}
				className={styles.sidebarContainer}
				initial={false}
				animate={{
					width: isOpen ? tempWidth : 0,
					opacity: isOpen ? 1 : 0,
					borderRightWidth: isOpen ? 1 : 0,
				}}
				transition={{
					type: "tween",
					ease: [0.12, 0.84, 0.27, 0.98],
					duration: isDragging ? 0 : 0.25,
				}}
			>
				<div
					style={{
						width: contentWidth,
						minWidth: contentWidth,
						flexShrink: 0,
						display: "flex",
						flexDirection: "column",
						height: "100%",
					}}
				>
					<div className={styles.header} data-single-tab={isSingleTab}>
						<SidebarTabBar
							tabs={visibleTabs}
							activePanel={activePanel}
							onSelectTab={setActivePanel}
							onCloseTab={(id) => closeTab(id)}
						/>
						<IconButton
							variant="ghost"
							color="gray"
							radius="full"
							onClick={() => setActivePanel("none")}
							aria-label={t("common.close", "关闭")}
						>
							<Dismiss16Regular />
						</IconButton>
					</div>

					<Box className={styles.content}>
						{SIDEBAR_TABS.map((tab) => {
							if (activePanel !== tab.id) return null;
							const Comp = tab.component;
							return <Comp key={tab.id} />;
						})}
					</Box>
				</div>
			</motion.div>

			{isOpen && (
				<div
					className={styles.resizer}
					data-dragging={isDragging}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerUp}
				/>
			)}
		</div>
	);
};

export default Sidebar;
