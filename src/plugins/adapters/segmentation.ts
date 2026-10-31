import type { TrustedJsSegmentationV0 } from "@amll-ttml-tool/plugin-sdk-js";
import { createSegmentationConfig } from "$/application/lyrics/SegmentationService";
import * as settings from "$/modules/segmentation/states";
import { loadHyphenator } from "$/modules/segmentation/utils/hyphen-loader";
import { isKanaOnly } from "$/modules/segmentation/utils/Transliteration/TransliterationUtils";
import {
	segmentWord,
	recalculateWordTime,
} from "$/modules/segmentation/utils/segmentation";
import { globalStore } from "$/states/store";
import { newLyricWord } from "$/types/ttml";

export const pluginSegmentation: TrustedJsSegmentationV0 = {
	isKanaOnly,
	async segmentText(input, segments) {
		if (
			!input ||
			typeof input.text !== "string" ||
			!Number.isFinite(input.startTime) ||
			!Number.isFinite(input.endTime) ||
			input.startTime < 0 ||
			input.endTime < 0 ||
			(segments !== undefined &&
				(!Array.isArray(segments) ||
					!segments.every((s) => typeof s === "string")))
		)
			throw new Error("Invalid segmentation input");
		const get = globalStore.get;
		const splitEnglish = get(settings.segmentationSplitEnglishAtom);
		const config = createSegmentationConfig({
			splitCJK: get(settings.segmentationSplitCJKAtom),
			splitEnglish,
			punctuationMode: get(settings.segmentationPunctuationModeAtom),
			punctuationWeight: get(settings.segmentationPunctuationWeightAtom),
			removeEmptySegments: get(settings.segmentationRemoveEmptySegmentsAtom),
			ignoreListText: get(settings.segmentationIgnoreListTextAtom),
			customRules: get(settings.segmentationCustomRulesAtom),
		});
		if (segments === undefined && splitEnglish)
			config.hyphenator =
				(await loadHyphenator(get(settings.segmentationLangAtom))) ?? undefined;
		const word = {
			...newLyricWord(),
			word: input.text,
			startTime: input.startTime,
			endTime: input.endTime,
		};
		const result =
			segments === undefined
				? segmentWord(word, config)
				: recalculateWordTime(word, segments, config);
		return result.map(({ word, startTime, endTime }) => ({
			text: word,
			startTime,
			endTime,
		}));
	},
};
