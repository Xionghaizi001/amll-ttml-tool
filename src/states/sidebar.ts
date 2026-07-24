import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

/**
 * 左侧边栏可能显示的面板类型
 */
export type SidebarPanelType = "none" | "outline";

/**
 * 当前激活的左侧面板
 */
export const sidebarPanelAtom = atom<SidebarPanelType>("none");

/**
 * 左侧边栏的宽度
 */
export const sidebarWidthAtom = atomWithStorage("sidebarWidth", 300);

/**
 * 右侧边栏可能显示的面板类型
 */
export type RightSidebarPanelType = "none" | "annotations";

/**
 * 当前激活的右侧面板
 */
export const rightSidebarPanelAtom = atom<RightSidebarPanelType>("none");

/**
 * 右侧边栏的宽度（最大不超过视口 40%，在组件内钳制）
 */
export const rightSidebarWidthAtom = atomWithStorage("rightSidebarWidth", 320);

/**
 * 用于触发编辑器跳转的事件 Atom
 * id 为歌词行 runtime id，或 `__annotation_line__:<lineIndex>` 用于批注聚焦
 */
export const outlineJumpActionAtom = atom<{ id: string; ts: number } | null>(
	null,
);
