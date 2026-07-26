import { atom } from "jotai";
import { lyricLinesAtom, ToolMode } from "$/states/main";
import {
	outlineJumpActionAtom,
	type RightSidebarPanelType,
	rightSidebarPanelAtom,
} from "$/states/sidebar";
import type {
	StructuredReviewChange,
	StructuredReviewReport,
} from "$/types/structured-review-report";
import type { TTMLLyric } from "$/types/ttml";
import {
	type AnnotationDecision,
	type AnnotationItem,
	buildAnnotationItemsFromReport,
} from "../services/annotation-summary";
import { applyStructuredChanges } from "../services/apply-structured-changes";

export type AnnotationSession = {
	report: StructuredReviewReport;
	originalLyric: TTMLLyric;
	/** annotation item key → 决策 */
	decisions: Record<string, AnnotationDecision>;
	/** 面板二级：聚焦某行的全部批注；null 为总览 */
	detailLineIndex: number | null;
	/** 当前高亮/聚焦的批注 */
	focusedKey: string | null;
};

export const annotationSessionAtom = atom<AnnotationSession | null>(null);

export const annotationItemsAtom = atom<AnnotationItem[]>((get) => {
	const session = get(annotationSessionAtom);
	if (!session) return [];
	return buildAnnotationItemsFromReport(session.report);
});

export const annotationDecisionMapAtom = atom((get) => {
	const session = get(annotationSessionAtom);
	return session?.decisions ?? {};
});

export const acceptedChangesAtom = atom<StructuredReviewChange[]>((get) => {
	const items = get(annotationItemsAtom);
	const decisions = get(annotationDecisionMapAtom);
	return items
		.filter((item) => decisions[item.key] === "accepted")
		.flatMap((item) => item.changes);
});

/** 由已接受变更从原稿推导的当前歌词（接受端应用结果）。 */
export const annotationAppliedLyricsAtom = atom((get) => {
	const session = get(annotationSessionAtom);
	if (!session) return null;
	const accepted = get(acceptedChangesAtom);
	return applyStructuredChanges(session.originalLyric, accepted, {
		verifyBefore: false,
	}).lyrics;
});

/**
 * 将「原稿 + 已接受批注」写回编辑器 lyricLines。
 * 接受/拒绝决策变化后应调用，使文件内容与批注决策一致。
 */
export const syncAnnotationAppliedLyricsAtom = atom(null, (get, set) => {
	const applied = get(annotationAppliedLyricsAtom);
	if (!applied) return;
	set(lyricLinesAtom, applied);
});

export const annotationsByLineAtom = atom((get) => {
	const items = get(annotationItemsAtom);
	const map = new Map<number, AnnotationItem[]>();
	for (const item of items) {
		if (item.lineIndex === null) continue;
		const list = map.get(item.lineIndex) ?? [];
		list.push(item);
		map.set(item.lineIndex, list);
	}
	return map;
});

export const documentAnnotationItemsAtom = atom((get) =>
	get(annotationItemsAtom).filter((item) => item.lineIndex === null),
);

/**
 * 「聚焦某条批注 + 让编辑区滚到对应行」。
 * 面板列表、行内批注轨道、分组标题等处原本各写一遍同样的 setSession + setJumpAction，
 * 统一收在这里，保证聚焦语义只有一处定义。
 */
export const focusAnnotationAtom = atom(
	null,
	(
		_get,
		set,
		options: {
			/** 目标行；null 表示文档级批注，保持当前详情页。 */
			lineIndex: number | null;
			focusedKey: string | null;
			/** 是否切到该行的详情页；false 则维持当前层级。 */
			openLineDetail?: boolean;
			/** 是否顺带展开右侧批注面板（行内轨道点击时需要）。 */
			revealPanel?: boolean;
		},
	) => {
		if (options.revealPanel) set(rightSidebarPanelAtom, "annotations");
		set(annotationSessionAtom, (prev) =>
			prev
				? {
						...prev,
						focusedKey: options.focusedKey,
						detailLineIndex:
							options.openLineDetail && options.lineIndex !== null
								? options.lineIndex
								: prev.detailLineIndex,
					}
				: prev,
		);
		// path 只给出行号，拿不到运行时 line.id；由编辑区按 lineIndex 自行滚动。
		if (options.lineIndex !== null) {
			set(outlineJumpActionAtom, {
				id: `__annotation_line__:${options.lineIndex}`,
				ts: Date.now(),
			});
		}
	},
);

/** 返回批注总览（退出行详情）。 */
export const closeAnnotationLineDetailAtom = atom(null, (_get, set) => {
	set(annotationSessionAtom, (prev) =>
		prev ? { ...prev, detailLineIndex: null } : prev,
	);
});

export const createAnnotationSession = (options: {
	report: StructuredReviewReport;
	originalLyric: TTMLLyric;
}): AnnotationSession => {
	const items = buildAnnotationItemsFromReport(options.report);
	const decisions: Record<string, AnnotationDecision> = {};
	for (const item of items) {
		decisions[item.key] = "pending";
	}
	return {
		report: options.report,
		originalLyric: options.originalLyric,
		decisions,
		detailLineIndex: null,
		focusedKey: null,
	};
};

/**
 * 进入「接受端批注」模式：载入原稿、建会话、展开批注面板、切到编辑模式。
 *
 * 走 setter 回调而非直接读写 store，因为 update-service 这类纯服务拿不到 jotai store；
 * 开发面板则把自己的 useSetAtom 结果传进来。两边共用同一套写入顺序，
 * 避免其中一处漏设 sourceFileContent / saveFileName 导致基线不一致。
 */
export const enterAnnotationReview = (options: {
	report: StructuredReviewReport;
	originalLyric: TTMLLyric;
	/** 原稿 TTML 文本，用作编辑器的 diff 基线。 */
	sourceTtml?: string;
	fileName?: string;
	setNewLyrics: (value: TTMLLyric) => void;
	setSourceFileContent?: (value: string | null) => void;
	setSaveFileName?: (value: string) => void;
	setAnnotationSession: (value: AnnotationSession | null) => void;
	setRightSidebarPanel: (value: RightSidebarPanelType) => void;
	setToolMode: (mode: ToolMode) => void;
}) => {
	options.setNewLyrics(options.originalLyric);
	if (options.sourceTtml !== undefined) {
		options.setSourceFileContent?.(options.sourceTtml);
	}
	if (options.fileName !== undefined) {
		options.setSaveFileName?.(options.fileName);
	}
	options.setAnnotationSession(
		createAnnotationSession({
			report: options.report,
			originalLyric: options.originalLyric,
		}),
	);
	options.setRightSidebarPanel("annotations");
	options.setToolMode(ToolMode.Edit);
};
