import { Dismiss16Regular } from "@fluentui/react-icons";
import { Box, IconButton, Text } from "@radix-ui/themes";
import { motion } from "framer-motion";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { annotationSessionAtom } from "$/modules/user/states/annotation-session";
import {
	rightSidebarPanelAtom,
	rightSidebarWidthAtom,
} from "$/states/sidebar.ts";
import styles from "./RightSidebar.module.css";
import { AnnotationPanel } from "./AnnotationPanel";

const MIN_WIDTH = 220;
const SNAP_CLOSE_THRESHOLD = 20;

export const RightSidebar = () => {
	const { t } = useTranslation();
	const [activePanel, setActivePanel] = useAtom(rightSidebarPanelAtom);
	const [savedWidth, setSavedWidth] = useAtom(rightSidebarWidthAtom);
	const annotationSession = useAtomValue(annotationSessionAtom);

	const [isDragging, setIsDragging] = useState(false);
	const [tempWidth, setTempWidth] = useState(savedWidth);
	const sidebarRef = useRef<HTMLDivElement>(null);

	const contentWidth = tempWidth > 0 ? tempWidth : savedWidth;
	const isOpen = activePanel !== "none";

	// 更新会话有批注时默认展开右侧批注面板
	useEffect(() => {
		if (annotationSession && activePanel === "none") {
			setActivePanel("annotations");
		}
		if (!annotationSession && activePanel === "annotations") {
			setActivePanel("none");
		}
	}, [annotationSession, activePanel, setActivePanel]);

	const getTitle = () => {
		if (activePanel === "annotations") {
			return t("sidebar.annotations.title", "批注");
		}
		return activePanel;
	};

	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		setIsDragging(true);
	}, []);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!isDragging || !sidebarRef.current) return;
			const rect = sidebarRef.current.getBoundingClientRect();
			// 右侧：从右边缘向左量宽
			const newWidth = rect.right - e.clientX;
			const maxAllowedWidth = Math.min(window.innerWidth * 0.4, window.innerWidth);

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
			<motion.div
				ref={sidebarRef}
				className={styles.sidebarContainer}
				initial={false}
				animate={{
					width: isOpen ? tempWidth : 0,
					opacity: isOpen ? 1 : 0,
					borderLeftWidth: isOpen ? 1 : 0,
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
						{activePanel === "annotations" && <AnnotationPanel />}
					</Box>
				</div>
			</motion.div>
		</div>
	);
};

export default RightSidebar;
