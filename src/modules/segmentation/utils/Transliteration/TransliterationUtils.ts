import * as wanakana from "wanakana";
import { isPunctuationChar } from "$/application/lyrics/punctuation";

/**
 * 判断字符串是否只包含日文假名（平假名/片假名）
 *
 * 供 `host.segmentation.isKanaOnly` 使用；罗马音分配算法已迁至 builtin.word-tools
 */
export function isKanaOnly(text: string): boolean {
	if (!text) return false;
	const cleanText = Array.from(text)
		.filter(
			(char) =>
				char.trim() !== "" &&
				!isPunctuationChar(char) &&
				!/^\p{P}$/u.test(char),
		)
		.join("");
	if (!cleanText) return false;
	return wanakana.isKana(cleanText);
}
