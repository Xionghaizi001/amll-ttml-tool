import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { type CSSProperties, useCallback, useEffect, useMemo } from "react";
import { getReviewReplayBase } from "$/modules/review/services/report-flow-service";
import {
	buildSyncChanges,
	type SyncChangeCandidate,
	type TimingStashItem,
} from "$/modules/review/services/report-service";
import {
	createLyricTimelineAuxiliaryDividerRenderer,
	type LyricTimelineAuxiliaryDivider,
	type LyricTimelineOverlayLineRenderer,
} from "$/modules/spectrogram/components/LyricTimelineOverlay.tsx";
import {
	selectedWordIdAtom,
	timelineDragAtom,
} from "$/modules/spectrogram/states/dnd.ts";
import {
	lyricLinesAtom,
	type ReviewSession,
	reviewFreezeAtom,
	reviewOperationLogAtom,
	reviewSessionAtom,
	reviewStashLastSelectionAtom,
	reviewStashRemovedOrderAtom,
	reviewStashSubmittedAtom,
	selectedWordsAtom,
} from "$/states/main";
import type { TTMLLyric } from "$/types/ttml";

export type TimingStashGroupItem = {
	label: string;
	field: TimingStashItem["field"];
	wordId: string;
};

export type TimingStashDisplayItem = {
	lineNumber: number;
	wordId: string;
	field: TimingStashItem["field"];
	key: string;
	label: string;
	orderIndex: number;
};

export type TimingStashCard = {
	line: number;
	items: Array<{
		label: string;
		wordId: string;
		field: TimingStashItem["field"];
		key: string;
	}>;
};

type TimingStashSelectionEntry = [string, TimingStashItem["field"]];

type ReviewTimingStashCandidate = TimingStashItem & {
	key: string;
	lineId: string;
	lineNumber: number;
	word: string;
	orderIndex: number;
	oldTimeMs: number;
	newTimeMs: number;
};

export const buildTimingStashItemKey = (
	wordId: string,
	field: TimingStashItem["field"],
) => `${wordId}:${field}`;

const normalizeTimingStashSelectionKey = (
	keyOrWordId: string,
	field: TimingStashItem["field"],
) =>
	keyOrWordId.includes(":")
		? keyOrWordId
		: buildTimingStashItemKey(keyOrWordId, field);

const getTimingStashSelectionWordId = (
	keyOrWordId: string,
	field: TimingStashItem["field"],
) => normalizeTimingStashSelectionKey(keyOrWordId, field).split(":")[0];

export const buildTimingStashGroups = (
	timingCandidateMap: Map<string, SyncChangeCandidate>,
	timingStashItems: TimingStashItem[],
) => {
	const grouped = new Map<number, TimingStashGroupItem[]>();
	timingStashItems.forEach((stashItem) => {
		const candidate = timingCandidateMap.get(stashItem.wordId);
		if (!candidate) return;
		const list = grouped.get(candidate.lineNumber) ?? [];
		list.push({
			label: `${candidate.word || "（空白）"}`,
			field: stashItem.field,
			wordId: stashItem.wordId,
		});
		grouped.set(candidate.lineNumber, list);
	});
	return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
};

export const buildStashKey = (reviewSession: ReviewSession | null) => {
	if (!reviewSession) return "";
	return `${reviewSession.prNumber}:${reviewSession.fileName}`;
};

export const buildTimingStashCards = (
	displayItems: TimingStashDisplayItem[],
) => {
	const lineMap = new Map<number, TimingStashCard["items"]>();
	for (const item of displayItems) {
		const list = lineMap.get(item.lineNumber) ?? [];
		list.push({
			label: item.label,
			wordId: item.wordId,
			field: item.field,
			key: item.key,
		});
		lineMap.set(item.lineNumber, list);
	}
	return Array.from(lineMap.entries())
		.sort((a, b) => a[0] - b[0])
		.map(([line, items]) => ({ line, items }) satisfies TimingStashCard);
};

export const buildTimingStashItemsFromSelection = (
	availableItems: TimingStashItem[],
	selection: TimingStashSelectionEntry[],
) => {
	const availableKeys = new Set(
		availableItems.map((item) =>
			buildTimingStashItemKey(item.wordId, item.field),
		),
	);
	const selectedItems: TimingStashItem[] = [];
	for (const [keyOrWordId, field] of selection) {
		const key = normalizeTimingStashSelectionKey(keyOrWordId, field);
		if (!availableKeys.has(key)) continue;
		const [wordId] = key.split(":");
		selectedItems.push({ wordId, field });
	}
	return selectedItems;
};

const createWordLineMap = (lyricLines: TTMLLyric["lyricLines"]) => {
	const map = new Map<string, string>();
	for (const line of lyricLines) {
		for (const word of line.words) {
			map.set(word.id, line.id);
		}
	}
	return map;
};

const createTimingOrderMap = (lyricLines: TTMLLyric["lyricLines"]) => {
	const map = new Map<string, number>();
	let orderIndex = 0;
	for (const line of lyricLines) {
		for (const word of line.words) {
			map.set(word.id, orderIndex);
			orderIndex += 1;
		}
	}
	return map;
};

const buildReviewTimingStashCandidates = (
	candidates: SyncChangeCandidate[],
	wordLineMap: Map<string, string>,
	orderMap: Map<string, number>,
	submittedSet: Set<string>,
	removedItems: Array<string | number>,
) => {
	const removedLegacyOrderSet = new Set(
		removedItems.filter((item): item is number => typeof item === "number"),
	);
	const removedItemKeySet = new Set(
		removedItems.filter((item): item is string => typeof item === "string"),
	);
	const items: ReviewTimingStashCandidate[] = [];
	for (const candidate of candidates) {
		if (submittedSet.has(candidate.wordId)) continue;
		const lineId = wordLineMap.get(candidate.wordId);
		if (!lineId) continue;
		const wordOrder = orderMap.get(candidate.wordId);
		const legacyRemoved =
			wordOrder !== undefined && removedLegacyOrderSet.has(wordOrder);
		if (legacyRemoved) continue;

		const fields: Array<{
			field: TimingStashItem["field"];
			oldTimeMs: number;
			newTimeMs: number;
			orderOffset: number;
		}> = [
			{
				field: "startTime",
				oldTimeMs: candidate.oldStart,
				newTimeMs: candidate.newStart,
				orderOffset: 0,
			},
			{
				field: "endTime",
				oldTimeMs: candidate.oldEnd,
				newTimeMs: candidate.newEnd,
				orderOffset: 1,
			},
		];

		for (const fieldState of fields) {
			if (fieldState.oldTimeMs === fieldState.newTimeMs) continue;
			const key = buildTimingStashItemKey(candidate.wordId, fieldState.field);
			if (submittedSet.has(key) || removedItemKeySet.has(key)) continue;
			items.push({
				wordId: candidate.wordId,
				field: fieldState.field,
				key,
				lineId,
				lineNumber: candidate.lineNumber,
				word: candidate.word || "（空白）",
				orderIndex:
					(wordOrder ?? Number.MAX_SAFE_INTEGER) * 2 + fieldState.orderOffset,
				oldTimeMs: fieldState.oldTimeMs,
				newTimeMs: fieldState.newTimeMs,
			});
		}
	}
	return items.sort((a, b) => a.orderIndex - b.orderIndex);
};

const REVIEW_TIMING_DIVIDER_SELECTED_STYLE = {
	"--timeline-auxiliary-divider-color": "var(--green-9)",
} as CSSProperties;

const REVIEW_TIMING_START_DIVIDER_PENDING_STYLE = {
	"--timeline-auxiliary-divider-color": "var(--blue-9)",
	opacity: 0.72,
} as CSSProperties;

const REVIEW_TIMING_END_DIVIDER_PENDING_STYLE = {
	"--timeline-auxiliary-divider-color": "var(--green-9)",
	opacity: 0.72,
} as CSSProperties;

const getReviewTimingDividerStyle = (
	field: TimingStashItem["field"],
	selected: boolean,
) => {
	if (selected) return REVIEW_TIMING_DIVIDER_SELECTED_STYLE;
	return field === "startTime"
		? REVIEW_TIMING_START_DIVIDER_PENDING_STYLE
		: REVIEW_TIMING_END_DIVIDER_PENDING_STYLE;
};

export const useReviewSpectrogramTimingOverlay = () => {
	const reviewSession = useAtomValue(reviewSessionAtom);
	const reviewFreeze = useAtomValue(reviewFreezeAtom);
	const lyricLines = useAtomValue(lyricLinesAtom);
	const selectedWordId = useAtomValue(selectedWordIdAtom);
	const reviewOperationLog = useAtomValue(reviewOperationLogAtom);
	const reviewStashSubmitted = useAtomValue(reviewStashSubmittedAtom);
	const [reviewStashLastSelection, setReviewStashLastSelection] = useAtom(
		reviewStashLastSelectionAtom,
	);
	const reviewStashRemovedOrder = useAtomValue(reviewStashRemovedOrderAtom);
	const setSelectedWords = useSetAtom(selectedWordsAtom);
	const setTimelineDrag = useSetAtom(timelineDragAtom);

	const activeReviewSession =
		reviewSession && reviewSession.source !== "update" ? reviewSession : null;
	const stashKey = useMemo(
		() => buildStashKey(activeReviewSession),
		[activeReviewSession],
	);

	const timingItems = useMemo(() => {
		if (!activeReviewSession || !reviewFreeze) return [];
		const freezeData = getReviewReplayBase(
			reviewFreeze.data,
			reviewOperationLog,
		);
		const candidates = buildSyncChanges(freezeData, lyricLines);
		const wordLineMap = createWordLineMap(lyricLines.lyricLines);
		const orderMap = createTimingOrderMap(
			(reviewFreeze?.data ?? lyricLines).lyricLines,
		);
		return buildReviewTimingStashCandidates(
			candidates,
			wordLineMap,
			orderMap,
			new Set(stashKey ? (reviewStashSubmitted[stashKey] ?? []) : []),
			stashKey ? (reviewStashRemovedOrder[stashKey] ?? []) : [],
		);
	}, [
		activeReviewSession,
		lyricLines,
		reviewFreeze,
		reviewOperationLog,
		reviewStashRemovedOrder,
		reviewStashSubmitted,
		stashKey,
	]);

	const selectedWordOrder = useMemo(() => {
		if (!selectedWordId) return undefined;
		const orderMap = createTimingOrderMap(
			(reviewFreeze?.data ?? lyricLines).lyricLines,
		);
		return orderMap.get(selectedWordId);
	}, [lyricLines, reviewFreeze, selectedWordId]);

	const submittedKeys = useMemo(
		() => new Set(stashKey ? (reviewStashSubmitted[stashKey] ?? []) : []),
		[reviewStashSubmitted, stashKey],
	);

	const removedLegacyOrders = useMemo(() => {
		const removedItems = stashKey
			? (reviewStashRemovedOrder[stashKey] ?? [])
			: [];
		return new Set(
			removedItems.filter((item): item is number => typeof item === "number"),
		);
	}, [reviewStashRemovedOrder, stashKey]);

	const removedItemKeys = useMemo(() => {
		const removedItems = stashKey
			? (reviewStashRemovedOrder[stashKey] ?? [])
			: [];
		return new Set(
			removedItems.filter((item): item is string => typeof item === "string"),
		);
	}, [reviewStashRemovedOrder, stashKey]);

	const selectedKeys = useMemo(() => {
		if (!stashKey) return new Set<string>();
		return new Set(
			(reviewStashLastSelection[stashKey] ?? []).map(([keyOrWordId, field]) =>
				normalizeTimingStashSelectionKey(keyOrWordId, field),
			),
		);
	}, [reviewStashLastSelection, stashKey]);

	useEffect(() => {
		if (!stashKey) return;
		const availableKeys = new Set(timingItems.map((item) => item.key));
		const currentSelection = reviewStashLastSelection[stashKey] ?? [];
		const nextSelection = currentSelection.filter(([keyOrWordId, field]) => {
			const key = normalizeTimingStashSelectionKey(keyOrWordId, field);
			const wordId = getTimingStashSelectionWordId(keyOrWordId, field);
			return availableKeys.has(key) || wordId === selectedWordId;
		});
		if (nextSelection.length === currentSelection.length) return;
		setReviewStashLastSelection((prev) => ({
			...prev,
			[stashKey]: nextSelection,
		}));
	}, [
		reviewStashLastSelection,
		setReviewStashLastSelection,
		selectedWordId,
		stashKey,
		timingItems,
	]);

	const selectTimingItem = useCallback(
		(wordId: string, field: TimingStashItem["field"]) => {
			if (!stashKey) return;
			const itemKey = buildTimingStashItemKey(wordId, field);
			setReviewStashLastSelection((prev) => {
				const selection = prev[stashKey] ?? [];
				const exists = selection.some(
					([keyOrWordId, field]) =>
						normalizeTimingStashSelectionKey(keyOrWordId, field) === itemKey,
				);
				const nextSelection = exists
					? selection
					: [
							...selection,
							[itemKey, field] satisfies TimingStashSelectionEntry,
						];
				return {
					...prev,
					[stashKey]: nextSelection,
				};
			});
			setSelectedWords(new Set([wordId]));
		},
		[setReviewStashLastSelection, setSelectedWords, stashKey],
	);

	const isTimingHandleAvailable = useCallback(
		(wordId: string, field: TimingStashItem["field"]) => {
			const itemKey = buildTimingStashItemKey(wordId, field);
			if (submittedKeys.has(wordId) || submittedKeys.has(itemKey)) return false;
			if (removedItemKeys.has(itemKey)) return false;
			if (
				selectedWordOrder !== undefined &&
				removedLegacyOrders.has(selectedWordOrder)
			) {
				return false;
			}
			return true;
		},
		[removedItemKeys, removedLegacyOrders, selectedWordOrder, submittedKeys],
	);

	return useMemo<LyricTimelineOverlayLineRenderer | undefined>(() => {
		if (!activeReviewSession || !reviewFreeze || !selectedWordId) {
			return undefined;
		}

		return (context) => {
			const { line, zoom } = context;
			const segmentIndex = line.segments.findIndex(
				(segment) => segment.type === "word" && segment.id === selectedWordId,
			);
			if (segmentIndex < 0) return null;

			const selectedSegment = line.segments[segmentIndex];
			if (selectedSegment.type !== "word") return null;

			const fields: Array<{
				field: TimingStashItem["field"];
				timeMs: number;
				dragSegmentIndex: number;
				offsetPx: number;
			}> = [
				{
					field: "startTime",
					timeMs: selectedSegment.startTime,
					dragSegmentIndex: segmentIndex - 1,
					offsetPx: 8,
				},
				{
					field: "endTime",
					timeMs: selectedSegment.endTime,
					dragSegmentIndex: segmentIndex,
					offsetPx: -8,
				},
			];

			const dividers: LyricTimelineAuxiliaryDivider[] = fields
				.filter(({ field }) => isTimingHandleAvailable(selectedWordId, field))
				.map(({ field, timeMs, dragSegmentIndex, offsetPx }) => {
					const key = buildTimingStashItemKey(selectedWordId, field);
					const selected = selectedKeys.has(key);
					const isStart = field === "startTime";
					return {
						id: `review-timing-${key}`,
						lineId: line.id,
						timeMs,
						offsetPx,
						allowOutOfLineRange: true,
						short: true,
						ariaLabel: `${selected ? "已选择" : "选择"}${selectedSegment.word} ${isStart ? "起始" : "结束"}时间`,
						style: getReviewTimingDividerStyle(field, selected),
						onMouseDown: (event) => {
							event.preventDefault();
							event.stopPropagation();
							selectTimingItem(selectedWordId, field);
							setTimelineDrag({
								type: "divider",
								lineId: line.id,
								segmentIndex: dragSegmentIndex,
								zoom,
								startX: event.clientX,
								isGapCreation: event.altKey,
							});
						},
						onClick: (event) => {
							event.preventDefault();
							event.stopPropagation();
						},
					};
				});
			if (dividers.length === 0) return null;
			return createLyricTimelineAuxiliaryDividerRenderer(dividers)(context);
		};
	}, [
		activeReviewSession,
		isTimingHandleAvailable,
		reviewFreeze,
		selectTimingItem,
		selectedKeys,
		selectedWordId,
		setTimelineDrag,
	]);
};
