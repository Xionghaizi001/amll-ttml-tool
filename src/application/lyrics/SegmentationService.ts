import type { EditorDocumentService } from "../../kernel/editor";
import type { LyricLine, LyricWord } from "../../types/ttml";

export type HyphenatorFunc = (text: string) => string;

export interface ApplicationSegmentationConfig {
	splitCJK: boolean;
	splitEnglish: boolean;
	punctuationMode: "merge" | "standalone";
	punctuationWeight: number;
	removeEmptySegments: boolean;
	ignoreList: Set<string>;
	customRules: Map<string, string[]>;
	hyphenator?: HyphenatorFunc;
}

export interface SegmentationConfigInput {
	splitCJK: boolean;
	splitEnglish: boolean;
	punctuationMode: ApplicationSegmentationConfig["punctuationMode"];
	punctuationWeight: string | number;
	removeEmptySegments: boolean;
	ignoreListText: string;
	customRules: Map<string, string[]>;
	hyphenator?: HyphenatorFunc;
}

export function createSegmentationConfig(
	input: SegmentationConfigInput,
): ApplicationSegmentationConfig {
	const parsedWeight =
		typeof input.punctuationWeight === "number"
			? input.punctuationWeight
			: Number.parseFloat(input.punctuationWeight);
	return {
		splitCJK: input.splitCJK,
		splitEnglish: input.splitEnglish,
		punctuationMode: input.punctuationMode,
		punctuationWeight: Number.isNaN(parsedWeight) ? 0.2 : parsedWeight,
		removeEmptySegments: input.removeEmptySegments,
		ignoreList: new Set(
			input.ignoreListText.split("\n").filter((line) => line.trim()),
		),
		customRules: input.customRules,
		hyphenator: input.hyphenator,
	};
}

export function normalizeSegmentationRange(
	lineCount: number,
	scope: "all" | "range",
	rangeStart: string,
	rangeEnd: string,
) {
	if (scope === "all") return { startIndex: 0, endIndex: lineCount };
	const requestedStart = (Number.parseInt(rangeStart, 10) || 1) - 1;
	const requestedEnd = Number.parseInt(rangeEnd, 10) || lineCount;
	const startIndex = Math.max(0, Math.min(requestedStart, lineCount));
	return {
		startIndex,
		endIndex: Math.max(startIndex, Math.min(requestedEnd, lineCount)),
	};
}

export function buildManualSegments(
	text: string,
	splitIndices: Iterable<number>,
) {
	const parts: string[] = [];
	let lastIndex = 0;
	for (const index of [...splitIndices].sort((a, b) => a - b)) {
		if (index <= lastIndex || index >= text.length) continue;
		parts.push(text.slice(lastIndex, index));
		lastIndex = index;
	}
	parts.push(text.slice(lastIndex));
	return parts.filter(Boolean);
}

type SegmentationDocumentPort = Pick<
	EditorDocumentService,
	"getRevision" | "transact"
>;

export function segmentDocumentRange<TConfig>(
	document: SegmentationDocumentPort,
	request: {
		lineCount: number;
		scope: "all" | "range";
		rangeStart: string;
		rangeEnd: string;
		config: TConfig;
	},
	segment: (lines: LyricLine[], config: TConfig) => LyricLine[],
) {
	const { startIndex, endIndex } = normalizeSegmentationRange(
		request.lineCount,
		request.scope,
		request.rangeStart,
		request.rangeEnd,
	);
	return document.transact(
		{
			source: "user",
			label: "Segment lyric lines",
			expectedRevision: document.getRevision(),
		},
		(draft) => {
			const processed = segment(
				draft.lyricLines.slice(startIndex, endIndex),
				request.config,
			);
			draft.lyricLines.splice(startIndex, endIndex - startIndex, ...processed);
		},
	);
}

export function splitDocumentWord<TConfig>(
	document: SegmentationDocumentPort,
	request: {
		lineIndex: number;
		wordIndex: number;
		targetText: string;
		splitIndices: Iterable<number>;
		applyToAll: boolean;
		ignoreCase: boolean;
		config: TConfig;
	},
	recalculate: (
		word: LyricWord,
		segments: string[],
		config: TConfig,
	) => LyricWord[],
) {
	const targetSegments = buildManualSegments(
		request.targetText,
		request.splitIndices,
	);
	if (!targetSegments.length) return;
	return document.transact(
		{
			source: "user",
			label: "Split lyric word",
			expectedRevision: document.getRevision(),
		},
		(draft) => {
			if (request.applyToAll) {
				const target = request.ignoreCase
					? request.targetText.toLowerCase()
					: request.targetText;
				for (const line of draft.lyricLines) {
					line.words = line.words.flatMap((word) => {
						const candidate = request.ignoreCase
							? word.word.toLowerCase()
							: word.word;
						if (candidate !== target) return word;
						const segments = request.ignoreCase
							? buildManualSegments(word.word, request.splitIndices)
							: targetSegments;
						return recalculate(
							word,
							segments.length ? segments : targetSegments,
							request.config,
						);
					});
				}
				return;
			}
			const line = draft.lyricLines[request.lineIndex];
			const word = line?.words[request.wordIndex];
			if (line && word?.word === request.targetText) {
				line.words.splice(
					request.wordIndex,
					1,
					...recalculate(word, targetSegments, request.config),
				);
			}
		},
	);
}
