/** 左标点：通常不与前面的词粘连。 */
export const PUNCT_LEFT = new Set([
	"(",
	"[",
	"{",
	"<",
	"「",
	"『",
	"（",
	"【",
	"《",
	"〈",
	"〔",
	"｢",
	"“",
	"‘",
	"«",
	"‹",
	"¿",
	"¡",
]);

/**
 * 右标点：通常不与后面的词粘连
 */
export const PUNCT_RIGHT = new Set([
	")",
	"]",
	"}",
	">",
	"」",
	"』",
	"）",
	"】",
	"》",
	"〉",
	"〕",
	"｣",
	"”",
	"’",
	"»",
	"›",
]);

/**
 * 容易引起歧义的引号 (分词时需特殊处理)
 */
export const PUNCT_AMBIGUOUS_QUOTES = new Set(['"']);

/**
 * 其他标点 (句号、逗号、连字符等)
 */
export const PUNCT_EXTRA = new Set([
	",",
	"，",
	"。",
	"．",
	".",
	"?",
	"!",
	"！",
	"？",
	"、",
	"；",
	";",
	":",
	"：",
	"'",
	"’",
	"〜",
	"～",
	"-",
	"—",
	"…",
	"⋯",
	"·",
	"♪",
]);

export const ALL_PUNCTUATION = new Set([
	...PUNCT_LEFT,
	...PUNCT_RIGHT,
	...PUNCT_AMBIGUOUS_QUOTES,
	...PUNCT_EXTRA,
]);

/**
 * 一个字符是否是标点符号
 */
export function isPunctuationChar(char: string): boolean {
	return ALL_PUNCTUATION.has(char);
}

/**
 * 一个字符串是否完全由标点符号组成
 */
export function isPunctuationOnly(text: string): boolean {
	if (!text) return false;
	for (const char of text) {
		if (!isPunctuationChar(char)) {
			return false;
		}
	}
	return true;
}
