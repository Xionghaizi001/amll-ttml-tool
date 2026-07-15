import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

/**
 * 侧边栏可能显示的面板类型
 */
export type SidebarPanelType = "none" | "outline";

/**
 * 当前激活的面板
 */
export const sidebarPanelAtom = atom<SidebarPanelType>("none");

/**
 * 侧边栏的宽度
 */
export const sidebarWidthAtom = atomWithStorage("sidebarWidth", 300);

/**
 * 用于触发编辑器跳转的事件 Atom
 */
export const outlineJumpActionAtom = atom<{ id: string; ts: number } | null>(
	null,
);
