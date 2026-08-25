import type {
	LyricLine as AppLyricLine,
	LyricWord as AppLyricWord,
	TTMLLyric as AppTTMLLyric,
	TTMLMetadata as AppTTMLMetadata,
} from "../../types/ttml";

export interface LyricWordBase {
	startTime: number;
	endTime: number;
	word: string;
}

export interface AmllLyricWord {
	startTime: number;
	endTime: number;
	word: string;
	romanWord?: string;
	obscene?: boolean;
	emptyBeat?: number;
	ruby?: LyricWordBase[];
}

export interface AmllLyricLine {
	words: AmllLyricWord[];
	translatedLyric: string;
	romanLyric: string;
	isBG: boolean;
	isDuet: boolean;
	startTime: number;
	endTime: number;
}

export interface AmllMetadata {
	key: string;
	value: string[];
}

export interface AmllLyricResult {
	lyricLines: AmllLyricLine[];
	metadata: AmllMetadata[];
}

export interface TtmlToAmllOptions {
	translationLanguage?: string;
	romanizationLanguage?: string;
}

export interface AmllToTtmlOptions {
	translationLanguage?: string;
	romanizationLanguage?: string;
}

export interface GeneratorConfig {
	useAppleFormatRules: boolean;
	format: boolean;
}

export interface TtmlResult {
	metadata: unknown;
	lines: unknown[];
}

export interface TtmlFormatPort {
	parseTtml(content: string): unknown;
	generateTtml(result: unknown, config?: Partial<GeneratorConfig>): unknown;
	ttmlToAmll(content: string, options?: Partial<TtmlToAmllOptions>): unknown;
	amllToTtml(
		result: AmllLyricResult,
		options?: Partial<AmllToTtmlOptions>,
		config?: Partial<GeneratorConfig>,
	): unknown;
	ttmlResultToAmll(
		result: unknown,
		options?: Partial<TtmlToAmllOptions>,
	): unknown;
	amllToTtmlResult(
		result: AmllLyricResult,
		options?: Partial<AmllToTtmlOptions>,
	): unknown;
}

export type Result<T, TError = unknown> =
	| { success: true; data: T }
	| { success: false; error: TError };

const IGNORED_METADATA_KEYS = new Set(["timingMode", "language"]);
const RENAMED_METADATA_KEYS: Record<string, string> = {
	songwriters: "songwriter",
	title: "musicName",
};
const EXPORT_RENAMED_METADATA_KEYS: Record<string, string> = {
	songwriter: "songwriters",
};

const normalizeExportWord = (word: AppLyricWord): AmllLyricWord => ({
	startTime: word.startTime,
	endTime: word.endTime,
	word: word.word,
	romanWord: word.romanWord,
	obscene: word.obscene,
	emptyBeat: word.emptyBeat,
	ruby: word.ruby,
});

const normalizeExportLine = (line: AppLyricLine): AmllLyricLine => ({
	words: line.words.map(normalizeExportWord),
	translatedLyric: line.translatedLyric,
	romanLyric: line.romanLyric,
	isBG: line.isBG,
	isDuet: line.isDuet,
	startTime: line.startTime,
	endTime: line.endTime,
});

const normalizeExportMetadata = (metadata: AppTTMLMetadata[]): AmllMetadata[] =>
	metadata.map((meta) => ({
		key: EXPORT_RENAMED_METADATA_KEYS[meta.key] ?? meta.key,
		value: [...meta.value],
	}));

export function ttmlLyricToAmllResult(
	ttmlLyric: AppTTMLLyric,
): AmllLyricResult {
	return {
		lyricLines: ttmlLyric.lyricLines.map(normalizeExportLine),
		metadata: normalizeExportMetadata(ttmlLyric.metadata),
	};
}

function postProcessLyricLines(amllResult: AmllLyricResult): AmllLyricResult {
	return {
		...amllResult,
		lyricLines: amllResult.lyricLines.map((line) => ({
			...line,
			startTime: Math.round(line.startTime),
			endTime: Math.round(line.endTime),
			words: line.words.map((word) => ({
				...word,
				startTime: Math.round(word.startTime),
				endTime: Math.round(word.endTime),
				ruby: word.ruby?.map((ruby) => ({
					...ruby,
					startTime: Math.round(ruby.startTime),
					endTime: Math.round(ruby.endTime),
				})),
				emptyBeat: word.emptyBeat ? word.emptyBeat : undefined,
				romanWord: word.romanWord?.trim() ? word.romanWord : undefined,
			})),
		})),
	};
}

export function createTtmlFormatService(
	port: TtmlFormatPort,
	defaultConfig: Partial<GeneratorConfig> = {},
) {
	const withConfig = (config?: Partial<GeneratorConfig>) => ({
		...defaultConfig,
		...config,
	});

	return {
		parseTTML(content: string) {
			return port.parseTtml(content) as Result<TtmlResult>;
		},
		generateTTML(result: TtmlResult, config?: Partial<GeneratorConfig>) {
			return port.generateTtml(result, withConfig(config)) as Result<string>;
		},
		ttmlToAmll(content: string, options?: Partial<TtmlToAmllOptions>) {
			const result = port.ttmlToAmll(
				content,
				options,
			) as Result<AmllLyricResult>;
			if (!result.success) return result;
			return {
				success: true as const,
				data: {
					...result.data,
					lyricLines: result.data.lyricLines.map((line) => ({
						...line,
						words: line.words.flatMap((word) => {
							const match = word.word.match(/(\s+)$/);
							if (!match || word.word === match[0]) return [word];
							return [
								{ ...word, word: word.word.slice(0, -match[0].length) },
								{ startTime: 0, endTime: 0, word: match[0] },
							];
						}),
					})),
					metadata: result.data.metadata
						.filter((meta) => !IGNORED_METADATA_KEYS.has(meta.key))
						.map((meta) => ({
							...meta,
							key: RENAMED_METADATA_KEYS[meta.key] ?? meta.key,
						})),
				},
			};
		},
		ttmlLyricToAmllResult,
		amllToTTML(
			result: AmllLyricResult,
			options?: Partial<AmllToTtmlOptions>,
			config?: Partial<GeneratorConfig>,
		) {
			return port.amllToTtml(
				postProcessLyricLines(result),
				options,
				withConfig(config),
			) as Result<string>;
		},
		ttmlResultToAmll(result: TtmlResult, options?: Partial<TtmlToAmllOptions>) {
			return port.ttmlResultToAmll(result, options) as Result<AmllLyricResult>;
		},
		amllToTTMLResult(
			result: AmllLyricResult,
			options?: Partial<AmllToTtmlOptions>,
		) {
			return port.amllToTtmlResult(
				postProcessLyricLines(result),
				options,
			) as Result<TtmlResult>;
		},
	};
}
