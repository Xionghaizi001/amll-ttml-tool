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
