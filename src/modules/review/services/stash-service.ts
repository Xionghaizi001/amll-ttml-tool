import type { ReviewSession } from "$/states/main";
import type {
	SyncChangeCandidate,
	TimingStashItem,
} from "$/modules/review/services/report-service";

export type TimingStashGroupItem = {
	label: string;
	field: TimingStashItem["field"];
	wordId: string;
};

export type TimingStashDisplayItem = {
	lineNumber: number;
	wordId: string;
	label: string;
	orderIndex: number;
};

export type TimingStashCard = {
	lines: number[];
	items: Array<{ label: string; wordId: string }>;
};

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

export const buildTimingStashCards = (displayItems: TimingStashDisplayItem[]) => {
	const cards: TimingStashCard[] = [];
	let index = 0;
	while (index < displayItems.length) {
		const a = displayItems[index];
		const b = displayItems[index + 1];
		const adjacent = Boolean(a && b) && b.orderIndex === a.orderIndex + 1;
		if (a && b && adjacent) {
			const lines =
				a.lineNumber === b.lineNumber
					? [a.lineNumber]
					: [a.lineNumber, b.lineNumber];
			cards.push({
				lines,
				items: [
					{ label: a.label, wordId: a.wordId },
					{ label: b.label, wordId: b.wordId },
				],
			});
			index += 2;
			continue;
		}
		if (a) {
			cards.push({
				lines: [a.lineNumber],
				items: [{ label: a.label, wordId: a.wordId }],
			});
		}
		index += 1;
	}
	return cards;
};
