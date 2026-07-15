import { Dismiss16Regular } from "@fluentui/react-icons";
import { Box, IconButton, Text } from "@radix-ui/themes";
import { motion } from "framer-motion";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { sidebarPanelAtom, sidebarWidthAtom } from "$/states/sidebar.ts";
import styles from "./index.module.css";
import { OutlinePanel } from "./OutlinePanel";

const MIN_WIDTH = 200;
const SNAP_CLOSE_THRESHOLD = 20;
const MAX_WIDTH = 650;

export const Sidebar = () => {
	const { t } = useTranslation();
	const [activePanel, setActivePanel] = useAtom(sidebarPanelAtom);
	const [savedWidth, setSavedWidth] = useAtom(sidebarWidthAtom);

	const [isDragging, setIsDragging] = useState(false);
	const [tempWidth, setTempWidth] = useState(savedWidth);
	const sidebarRef = useRef<HTMLDivElement>(null);

	const contentWidth = tempWidth > 0 ? tempWidth : savedWidth;

	const isOpen = activePanel !== "none";

	const getTitle = () => {
		if (!isOpen) return "";

		const PANEL_TITLE_MAP: Record<string, string> = {
			outline: t("sidebar.outline.title", "大纲"),
		};

		return PANEL_TITLE_MAP[activePanel] || activePanel;
	};

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
		<div style={{ position: "relative", height: "100%", flexShrink: 0 }}>
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
					<div className={styles.header}>
						<Text className={styles.title} size="2">
							{getTitle()}
						</Text>
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
						{activePanel === "outline" && <OutlinePanel />}
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
