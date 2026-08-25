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

/**
 * 由宿主 adapter 注入的纯分词算法集合。application service 负责事务和范围，
 * 算法实现继续保留在原纯模块中。
 */
export interface SegmentationEnginePort<TConfig> {
	segmentLines(lines: LyricLine[], config: TConfig): LyricLine[];
	segmentWord(word: LyricWord, config: TConfig): LyricWord[];
	recalculateWordTime(
		word: LyricWord,
		segments: string[],
		config: TConfig,
	): LyricWord[];
	smoothLine(
		line: LyricLine,
		options: { threshold?: number; mergeSyllables?: boolean },
	): LyricLine;
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
	engine: Pick<SegmentationEnginePort<TConfig>, "segmentLines">,
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
			const processed = engine.segmentLines(
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
	engine: Pick<SegmentationEnginePort<TConfig>, "recalculateWordTime">,
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
						return engine.recalculateWordTime(
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
					...engine.recalculateWordTime(word, targetSegments, request.config),
				);
			}
		},
	);
}

export const previewSegmentWord = <TConfig>(
	word: LyricWord,
	config: TConfig,
	engine: Pick<SegmentationEnginePort<TConfig>, "segmentWord">,
) => engine.segmentWord(word, config);

export const previewSegmentLines = <TConfig>(
	lines: LyricLine[],
	config: TConfig,
	engine: Pick<SegmentationEnginePort<TConfig>, "segmentLines">,
) => engine.segmentLines(lines, config);

export function segmentEntireDocument<TConfig>(
	document: SegmentationDocumentPort,
	config: TConfig,
	engine: Pick<SegmentationEnginePort<TConfig>, "segmentLines">,
) {
	return document.transact(
		{
			source: "user",
			label: "Segment all lyric lines",
			expectedRevision: document.getRevision(),
		},
		(draft) => {
			draft.lyricLines = engine.segmentLines(draft.lyricLines, config);
		},
	);
}

export function smoothDocumentLines(
	document: SegmentationDocumentPort,
	lineIds: ReadonlySet<string>,
	options: { threshold?: number; mergeSyllables?: boolean },
	engine: Pick<SegmentationEnginePort<unknown>, "smoothLine">,
) {
	return document.transact(
		{
			source: "user",
			label: "Smooth lyric syllables",
			expectedRevision: document.getRevision(),
		},
		(draft) => {
			draft.lyricLines = draft.lyricLines.map((line) =>
				lineIds.has(line.id) ? engine.smoothLine(line, options) : line,
			);
		},
	);
}

export function applyRubySegmentsToMatchingWords<TConfig>(
	document: SegmentationDocumentPort,
	request: {
		wordId: string;
		wordText: string;
		segments: string[];
		applyToAll: boolean;
		config: TConfig;
	},
	engine: Pick<SegmentationEnginePort<TConfig>, "recalculateWordTime">,
) {
	return document.transact(
		{
			source: "user",
			label: "Apply lyric word ruby segments",
			expectedRevision: document.getRevision(),
		},
		(draft) => {
			for (const line of draft.lyricLines) {
				for (let index = 0; index < line.words.length; index += 1) {
					const word = line.words[index];
					if (
						request.applyToAll
							? word.word !== request.wordText
							: word.id !== request.wordId
					)
						continue;
					const recalculated = engine.recalculateWordTime(
						word,
						request.segments,
						request.config,
					);
					const base = recalculated[0];
					if (!base) continue;
					line.words[index] = {
						...word,
						ruby: recalculated.map((item) => ({
							word: item.word,
							startTime: item.startTime,
							endTime: item.endTime,
							emptyBeat: item.emptyBeat,
						})),
					};
					if (!request.applyToAll) return;
				}
			}
		},
	);
}
