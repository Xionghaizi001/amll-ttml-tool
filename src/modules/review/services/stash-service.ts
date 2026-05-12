import type {
	SyncChangeCandidate,
	TimingStashItem,
} from "$/modules/review/services/report-service";
import type { ReviewSession } from "$/states/main";

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

export const buildTimingStashItemKey = (
	wordId: string,
	field: TimingStashItem["field"],
) => `${wordId}:${field}`;

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
