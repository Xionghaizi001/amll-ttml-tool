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

/** 音节自身时长 */
function getDuration(word: LyricWord): number {
	return Math.max(0, (word.endTime ?? 0) - (word.startTime ?? 0));
}

/**
 * 参与时长分配的字符数
 *
 * 过滤掉空格，以保证合并后带有空格的音节依然能准确反映真实 CJK 字符数
 */
function getCharCount(word: LyricWord): number {
	const clean = (word.word || "").replace(/\s+/g, "");
	return Math.max(1, Array.from(clean).length);
}

/**
 * 两个相邻实体音节之间未被任何音节覆盖的空白时长
 *
 * 空格音节自身占用的时间不算间隔
 */
function getGapBetween(
	prev: LyricWord,
	next: LyricWord,
	spacers: LyricWord[],
): number {
	const covered = spacers.reduce((sum, w) => sum + getDuration(w), 0);
	return Math.max(0, (next.startTime ?? 0) - (prev.endTime ?? 0) - covered);
}

/**
 * 变异参数的统一计算式
 *
 * 结果与两参数的公共缩放无关，因此既可比较单字时长，也可比较总时长
 * @returns 变异参数值 (0 ~ 100)
 */
function calculateRateVariation(v1: number, v2: number): number {
	if (v1 + v2 === 0) {
		return 0;
	}
	return (Math.abs(v1 - v2) / (v1 + v2)) * 100;
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
 *
 * 间隔是边界的属性而非音节的属性，只在判定是否跨越该边界时计入左侧音节：
 * 若两侧都用含间隔的时长，间隔前的音节会被从其所属簇中提前切离而无法参与平滑
 *
 * @param w1 前一个音节
 * @param w2 后一个音节
 * @param w1TrailingGap w1 与 w2 之间的间隔时长，计入 w1
 * @returns 变异参数值 (0 ~ 100)
 */
function calculateSyllableVariation(
	w1: LyricWord,
	w2: LyricWord,
	w1TrailingGap = 0,
): number {
	const r1 = (getDuration(w1) + w1TrailingGap) / getCharCount(w1);
	const r2 = getDuration(w2) / getCharCount(w2);
	return calculateRateVariation(r1, r2);
}

/**
 * 计算把候选音节并入簇后的簇级变异参数
 *
 * 逐对判定看不到被吸收间隔的累积量：每个间隔单独都低于阈值，
 * 但重分配用的是整簇 span，多个小间隔累加后会把簇内所有音节一起拉长
 *
 * @param cluster 当前音节簇
 * @param candidate 候选音节
 * @returns 实唱时长与重分配时长（含全部被吸收间隔）之间的变异参数值 (0 ~ 100)
 */
function calculateClusterVariation(
	cluster: LyricWord[],
	candidate: LyricWord,
): number {
	const contentWords = [...cluster, candidate].filter(
		(w) => !isSpaceSyllable(w),
	);
	const sungDuration = contentWords.reduce((sum, w) => sum + getDuration(w), 0);
	const span = Math.max(
		0,
		(contentWords[contentWords.length - 1].endTime ?? 0) -
			(contentWords[0].startTime ?? 0),
	);
	return calculateRateVariation(sungDuration, span);
}

/**
 * 对音节簇中的实体音节按字数比例均匀平滑重分配时间戳
 *
 * 簇内残留的间隔均已被判定为不显著，会一并摊入各音节；
 * 显著间隔在簇划分阶段就成为了簇边界，不会进入这里
 *
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
	const span = Math.max(0, totalEnd - totalStart);

	const reservedTotal = cluster
		.filter(isSpaceSyllable)
		.reduce((sum, w) => sum + getDuration(w), 0);
	const distributable = Math.max(0, span - reservedTotal);

	const charCounts = contentWords.map(getCharCount);
	const totalWeight = charCounts.reduce((sum, c) => sum + c, 0);

	const result: LyricWord[] = [];
	let cursor = totalStart;
	let reserved = 0;
	let cumWeight = 0;
	let contentIndex = 0;

	for (const word of cluster) {
		if (isSpaceSyllable(word)) {
			const spacerDuration = getDuration(word);
			result.push({
				...word,
				startTime: cursor,
				endTime: cursor + spacerDuration,
			});
			reserved += spacerDuration;
			cursor += spacerDuration;
			continue;
		}

		cumWeight += charCounts[contentIndex];
		const isLast = contentIndex === contentWords.length - 1;
		const wordStart = cursor;
		const wordEnd = isLast
			? totalEnd
			: totalStart +
				reserved +
				(totalWeight > 0
					? Math.round((distributable * cumWeight) / totalWeight)
					: 0);
		cursor = wordEnd;
		contentIndex++;

		// 平滑完成后把 base 音节的时间戳同步给单个 ruby 音节
		// isRubyEligibleForSmoothing 已阻止复杂的同步需求
		const originalRuby = word.ruby;
		const ruby =
			originalRuby && originalRuby.length === 1
				? [{ ...originalRuby[0], startTime: wordStart, endTime: wordEnd }]
				: originalRuby;

		result.push({
			...word,
			startTime: wordStart,
			endTime: wordEnd,
			...(ruby ? { ruby } : {}),
		});
	}

	return result;
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
				const gap = getGapBetween(lastContentWord, nextWord, pendingSpaces);

				const variation = calculateSyllableVariation(lastContentWord, nextWord);
				const gapVariation = calculateSyllableVariation(
					lastContentWord,
					nextWord,
					gap,
				);
				const clusterVariation = calculateClusterVariation(cluster, nextWord);

				if (
					variation < threshold &&
					gapVariation < threshold &&
					clusterVariation < threshold
				) {
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
