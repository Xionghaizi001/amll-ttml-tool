import type { LyricLine as UpstreamLyricLine } from "@applemusic-like-lyrics/lyric";
import { uid } from "uid";
import type { AmllLyricResult } from "$/modules/ttml-processor/types";
import type { TTMLLyric } from "$/types/ttml";

/**
 * 导入归一化：为解析结果补齐稳定 id 与必填内部字段。
 * provider 必须交付完整的内部文档结构，之后统一走一次导入事务。
 */

export const normalizeUpstreamLyricLines = (
	lyricLines: UpstreamLyricLine[],
): TTMLLyric => ({
	lyricLines: lyricLines.map((line) => ({
		...line,
		words: line.words.map((word) => ({
			...word,
			id: uid(),
			obscene: false,
			emptyBeat: 0,
		})),
		ignoreSync: false,
		id: uid(),
	})),
	metadata: [],
});

export const normalizeAmllLyricResult = (
	amllResult: AmllLyricResult,
): TTMLLyric => ({
	metadata: amllResult.metadata.map((meta) => ({ ...meta })),
	lyricLines: amllResult.lyricLines.map((line) => ({
		...line,
		words: line.words.map((word) => ({
			...word,
			id: uid(),
			obscene: word.obscene ?? false,
			emptyBeat: word.emptyBeat ?? 0,
		})),
		ignoreSync: false,
		id: uid(),
	})),
});
