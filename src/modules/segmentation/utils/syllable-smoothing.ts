/**
 * @description Apple Music-like CJK 合并算法
 */

import { uid } from "uid";
import { type LyricLine, type LyricWord, newLyricWord } from "$/types/ttml";

export const SyllableSmoothThreshold = {
	LOW: 5,
	/** 猜测是 Apple Music 所使用的合并阈值 */
	MEDIUM: 15,
	HIGH: 30,
} as const;

export type SyllableSmoothThreshold =
	(typeof SyllableSmoothThreshold)[keyof typeof SyllableSmoothThreshold];

export interface SyllableSmoothingOptions {
	/**
	 * 变异参数阈值
	 *
	 * 当音节间变异参数 < threshold 时判定为满足平滑条件
	 * @defaultValue 15
	 */
	threshold?: SyllableSmoothThreshold | (number & {});
	/**
	 * 是否合并音节文本
	 *
	 * 可以获得 Apple Music 类似的、把 CJK 合并到一起的歌词，但不适合日常使用
	 * - true: 在时间戳平滑后将音节合并为一个音节
	 * - false: 仅平滑重分配时间戳，跳过音节合并步骤
	 * @defaultValue false
	 */
	mergeSyllables?: boolean;
}

const CJK_FULL_REGEX =
	/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]+$/u;

function isSpaceSyllable(word: LyricWord): boolean {
	if (!word?.word) return false;
	return /^\s*$/.test(word.word);
}

/**
 * 判断字符串是否完全由 CJK 字符组成
 */
function isAllCJK(text: string): boolean {
	if (!text || typeof text !== "string") return false;
	const nonSpace = text.replace(/\s+/g, "");
	return nonSpace.length > 0 && CJK_FULL_REGEX.test(nonSpace);
}

/**
 * 检查带有 Ruby 的音节是否可以平滑
 * - 无 Ruby：允许平滑
 * - 单个 base 音节对应单个 ruby 音节：允许平滑
 * - 单个 base 音节对应多个 ruby 音节：不平滑，直接跳过
 *
 * 过滤掉一对多的音节是因为若要合并音节，原音节的 Ruby 会被分配到整个合并后的音节，
 * 导致语义错误，多对多的情况更难处理，所以也过滤掉
 *
 * @param word 待检测音节
 */
function isRubyEligibleForSmoothing(word: LyricWord): boolean {
	if (!word.ruby || word.ruby.length === 0) {
		return true;
	}
	return word.ruby.length === 1;
}

/**
 * 计算两个相邻实体音节之间的变异参数
 * @param w1 前一个音节
 * @param w2 后一个音节
 * @returns 变异参数值 (0 ~ 100)
 */
function calculateSyllableVariation(w1: LyricWord, w2: LyricWord): number {
	const d1 = Math.max(0, (w1.endTime ?? 0) - (w1.startTime ?? 0));
	const d2 = Math.max(0, (w2.endTime ?? 0) - (w2.startTime ?? 0));

	// 字符数计算时过滤掉空格，以保证合并后带有空格的音节依然能准确反映真实 CJK 字符数
	const text1 = (w1.word || "").replace(/\s+/g, "");
	const text2 = (w2.word || "").replace(/\s+/g, "");

	const len1 = Math.max(1, Array.from(text1).length);
	const len2 = Math.max(1, Array.from(text2).length);

	const r1 = d1 / len1;
	const r2 = d2 / len2;

	if (r1 + r2 === 0) {
		return 0;
	}

	return (Math.abs(r1 - r2) / (r1 + r2)) * 100;
}

/**
 * 对音节簇中的实体音节按字数比例均匀平滑重分配时间戳
 * @param cluster 音节簇
 * @returns 时间戳平滑后的音节数组
 */
function smoothClusterTimestamps(cluster: LyricWord[]): LyricWord[] {
	const contentWords = cluster.filter((w) => !isSpaceSyllable(w));
	if (contentWords.length <= 1) {
		return cluster;
	}

	const totalStart = contentWords[0].startTime ?? 0;
	const totalEnd = contentWords[contentWords.length - 1].endTime ?? 0;
	const totalDuration = Math.max(0, totalEnd - totalStart);

	const charCounts = contentWords.map((w) => {
		const clean = (w.word || "").replace(/\s+/g, "");
		return Math.max(1, Array.from(clean).length);
	});
	const totalWeight = charCounts.reduce((sum, c) => sum + c, 0);

	let cursor = totalStart;
	const newContentWords = new Map<LyricWord, LyricWord>();

	for (let j = 0; j < contentWords.length; j++) {
		const originalWord = contentWords[j];
		const weight = charCounts[j];
		const duration =
			totalWeight > 0 ? Math.round((totalDuration * weight) / totalWeight) : 0;
		const wordStart = cursor;
		const wordEnd =
			j === contentWords.length - 1 ? totalEnd : cursor + duration;
		cursor = wordEnd;

		// 平滑完成后把 base 音节的时间戳同步给单个 ruby 音节
		// isRubyEligibleForSmoothing 已阻止复杂的同步需求
		let ruby = originalWord.ruby;
		if (ruby && ruby.length === 1) {
			ruby = [
				{
					...ruby[0],
					startTime: wordStart,
					endTime: wordEnd,
				},
			];
		}

		newContentWords.set(originalWord, {
			...originalWord,
			startTime: wordStart,
			endTime: wordEnd,
			...(ruby ? { ruby } : {}),
		});
	}

	return cluster.map((w) =>
		isSpaceSyllable(w) ? w : (newContentWords.get(w) ?? w),
	);
}

/**
 * 将平滑后的音节簇合并为一个音节
 * @param cluster 平滑后的音节簇
 * @returns 合并后的单个音节
 */
function mergeCluster(cluster: LyricWord[]): LyricWord {
	const contentWords = cluster.filter((w) => !isSpaceSyllable(w));
	const first = contentWords[0] ?? cluster[0];
	const last =
		contentWords[contentWords.length - 1] ?? cluster[cluster.length - 1];

	const word = cluster.map((w) => w.word ?? "").join("");
	const startTime = first.startTime ?? 0;
	const endTime = last.endTime ?? 0;
	const obscene = cluster.some((w) => w.obscene);
	const emptyBeat = cluster.reduce((sum, w) => sum + (w.emptyBeat || 0), 0);

	const romanWord = cluster
		.map((w) => w.romanWord?.trim())
		.filter(Boolean)
		.join(" ");

	const rubies = cluster.flatMap((w) => w.ruby || []);

	return {
		...newLyricWord(),
		id: first.id || uid(),
		word,
		startTime,
		endTime,
		obscene,
		emptyBeat,
		romanWord,
		...(rubies.length > 0 ? { ruby: rubies } : {}),
	};
}

/**
 * 对一行歌词中的音节应用基于变异参数的平滑处理
 * @param line 歌词行对象
 * @param options 配置选项（可配置阈值及是否合并音节）
 * @returns 平滑后的歌词行对象
 */
export function smoothSyllables(
	line: LyricLine,
	options?: SyllableSmoothingOptions,
): LyricLine {
	if (!line.words || line.words.length <= 1) {
		return line;
	}

	const threshold = options?.threshold ?? SyllableSmoothThreshold.MEDIUM;
	const shouldMerge = options?.mergeSyllables ?? false;

	const resultWords: LyricWord[] = [];
	let i = 0;

	while (i < line.words.length) {
		const current = line.words[i];

		if (isSpaceSyllable(current)) {
			resultWords.push(current);
			i++;
			continue;
		}

		const cluster: LyricWord[] = [current];
		let lastContentWord = current;

		while (i + 1 < line.words.length) {
			let nextIndex = i + 1;
			const pendingSpaces: LyricWord[] = [];

			while (
				nextIndex < line.words.length &&
				isSpaceSyllable(line.words[nextIndex])
			) {
				pendingSpaces.push(line.words[nextIndex]);
				nextIndex++;
			}

			if (nextIndex >= line.words.length) {
				break;
			}

			const nextWord = line.words[nextIndex];

			const isCurrentCJK = isAllCJK(lastContentWord.word);
			const isNextCJK = isAllCJK(nextWord.word);
			const isCurrentRubyEligible = isRubyEligibleForSmoothing(lastContentWord);
			const isNextRubyEligible = isRubyEligibleForSmoothing(nextWord);

			if (
				isCurrentCJK &&
				isNextCJK &&
				isCurrentRubyEligible &&
				isNextRubyEligible
			) {
				const variation = calculateSyllableVariation(lastContentWord, nextWord);

				if (variation < threshold) {
					cluster.push(...pendingSpaces, nextWord);
					lastContentWord = nextWord;
					i = nextIndex;
					continue;
				}
			}

			break;
		}

		if (cluster.length === 1) {
			resultWords.push(cluster[0]);
		} else {
			const smoothed = smoothClusterTimestamps(cluster);

			if (shouldMerge) {
				resultWords.push(mergeCluster(smoothed));
			} else {
				resultWords.push(...smoothed);
			}
		}

		i++;
	}

	return {
		...line,
		words: resultWords,
	};
}
