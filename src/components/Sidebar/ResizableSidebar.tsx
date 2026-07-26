import { Dismiss16Regular } from "@fluentui/react-icons";
import { Box, IconButton, Text } from "@radix-ui/themes";
import { motion } from "framer-motion";
import { type PrimitiveAtom, useAtom } from "jotai";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import styles from "./ResizableSidebar.module.css";

const SNAP_CLOSE_THRESHOLD = 20;

export type ResizableSidebarProps<Panel extends string> = {
	/** 停靠边；决定拖拽方向与边框侧。 */
	side: "left" | "right";
	panelAtom: PrimitiveAtom<Panel>;
	widthAtom: PrimitiveAtom<number>;
	/** 关闭态的哨兵值。 */
	closedPanel: Panel;
	minWidth: number;
	/** 绝对上限，可选；总会再按 maxWidthRatio 收一次。 */
	maxWidth?: number;
	maxWidthRatio: number;
	/** 面板标题；未命中时不显示原始面板名。 */
	titles: Partial<Record<Panel, string>>;
	children: ReactNode;
};

/**
 * 可拖拽调宽 / 贴边吸附关闭的侧边栏外壳。
 * 左右两侧共用，避免两份逐字重复的拖拽与动画逻辑各自漂移。
 */
export const ResizableSidebar = <Panel extends string>({
	side,
	panelAtom,
	widthAtom,
	closedPanel,
	minWidth,
	maxWidth,
	maxWidthRatio,
	titles,
	children,
}: ResizableSidebarProps<Panel>) => {
	const { t } = useTranslation();
	const [activePanel, setActivePanel] = useAtom(panelAtom);
	const [savedWidth, setSavedWidth] = useAtom(widthAtom);

	const [isDragging, setIsDragging] = useState(false);
	const [tempWidth, setTempWidth] = useState(savedWidth);
	const sidebarRef = useRef<HTMLDivElement>(null);

	const contentWidth = tempWidth > 0 ? tempWidth : savedWidth;
	const isOpen = activePanel !== closedPanel;

	const close = useCallback(
		() => setActivePanel(closedPanel),
		[closedPanel, setActivePanel],
	);

	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		setIsDragging(true);
	}, []);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!isDragging || !sidebarRef.current) return;
			// 左侧从左边缘向右量宽，右侧从右边缘向左量宽。
			const newWidth =
				side === "left"
					? e.clientX
					: sidebarRef.current.getBoundingClientRect().right - e.clientX;
			const ratioLimit = window.innerWidth * maxWidthRatio;
			const maxAllowedWidth =
				maxWidth === undefined ? ratioLimit : Math.min(maxWidth, ratioLimit);

			if (newWidth <= SNAP_CLOSE_THRESHOLD) {
				setTempWidth(0);
			} else {
				setTempWidth(Math.min(Math.max(newWidth, minWidth), maxAllowedWidth));
			}
		},
		[isDragging, maxWidth, maxWidthRatio, minWidth, side],
	);

	const handlePointerUp = useCallback(
		(e: React.PointerEvent) => {
			if (!isDragging) return;
			setIsDragging(false);
			e.currentTarget.releasePointerCapture(e.pointerId);

			if (tempWidth <= SNAP_CLOSE_THRESHOLD) {
				close();
				setTempWidth(savedWidth);
			} else {
				setSavedWidth(tempWidth);
			}
		},
		[isDragging, tempWidth, savedWidth, close, setSavedWidth],
	);

	useEffect(() => {
		if (!isDragging) setTempWidth(savedWidth);
	}, [savedWidth, isDragging]);

	const resizer = isOpen && (
		<div
			className={styles.resizer}
			data-dragging={isDragging}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
		/>
	);

	return (
		<div className={styles.root} data-side={side}>
			{side === "right" && resizer}
			<motion.div
				ref={sidebarRef}
				className={styles.sidebarContainer}
				initial={false}
				animate={{
					width: isOpen ? tempWidth : 0,
					opacity: isOpen ? 1 : 0,
					...(side === "left"
						? { borderRightWidth: isOpen ? 1 : 0 }
						: { borderLeftWidth: isOpen ? 1 : 0 }),
				}}
				transition={{
					type: "tween",
					ease: [0.12, 0.84, 0.27, 0.98],
					duration: isDragging ? 0 : 0.25,
				}}
			>
				<div
					className={styles.inner}
					style={{ width: contentWidth, minWidth: contentWidth }}
				>
					<div className={styles.header}>
						<Text className={styles.title} size="2">
							{isOpen ? (titles[activePanel] ?? "") : ""}
						</Text>
						<IconButton
							variant="ghost"
							color="gray"
							radius="full"
							onClick={close}
							aria-label={t("common.close", "关闭")}
						>
							<Dismiss16Regular />
						</IconButton>
					</div>
					<Box className={styles.content}>{children}</Box>
				</div>
			</motion.div>
			{side === "left" && resizer}
		</div>
	);
};
