import { type createStore, useAtomValue } from "jotai";
import { useMemo } from "react";
import type {
	LineAndWordLocationResult,
	LineLocationResult,
} from "$/application/lyrics/LyricNavigationService";
import {
	buildRubySelectionId,
	findLineLocation,
	findLocation,
	findNextWord,
	getFirstSynchronizableUnit,
	getLastSynchronizableUnit,
	getSynchronizableUnits,
	getSyncUnitsForLine,
	isSynchronizableLine,
	parseRubySelectionId,
} from "$/application/lyrics/LyricNavigationService";
import {
	lyricLinesAtom,
	selectedLinesAtom,
	selectedWordsAtom,
} from "$/states/main.ts";

export type {
	LineAndWordLocationResult,
	LineLocationResult,
} from "$/application/lyrics/LyricNavigationService";
export {
	buildRubySelectionId,
	findNextWord,
	getFirstSynchronizableUnit,
	getLastSynchronizableUnit,
	getSynchronizableUnits,
	getSyncUnitsForLine,
	isSynchronizableLine,
	parseRubySelectionId,
};

export function getCurrentLineLocation(
	store: ReturnType<typeof createStore>,
): LineLocationResult | undefined {
	return findLineLocation(
		store.get(lyricLinesAtom).lyricLines,
		store.get(selectedLinesAtom),
	);
}

export function getCurrentLocation(
	store: ReturnType<typeof createStore>,
): LineAndWordLocationResult | undefined {
	return findLocation(
		store.get(lyricLinesAtom).lyricLines,
		store.get(selectedLinesAtom),
		store.get(selectedWordsAtom),
	);
}

export function useCurrentLocation(): LineAndWordLocationResult | undefined {
	const lyrics = useAtomValue(lyricLinesAtom);
	const selectedLines = useAtomValue(selectedLinesAtom);
	const selectedWords = useAtomValue(selectedWordsAtom);
	const result = useMemo(
		() => findLocation(lyrics.lyricLines, selectedLines, selectedWords),
		[lyrics, selectedLines, selectedWords],
	);
	return result;
}
