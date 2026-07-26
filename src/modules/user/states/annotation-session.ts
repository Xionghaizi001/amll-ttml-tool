import { atom } from "jotai";
import { lyricLinesAtom } from "$/states/main";
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

export const pendingAnnotationItemsAtom = atom((get) => {
	const items = get(annotationItemsAtom);
	const decisions = get(annotationDecisionMapAtom);
	return items.filter((item) => (decisions[item.key] ?? "pending") === "pending");
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
