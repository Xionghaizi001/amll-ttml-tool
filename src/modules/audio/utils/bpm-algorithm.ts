/**
 * BPM 打拍测定算法内核（从 UI/hook 中剥离的纯函数层）。
 *
 * 算法对齐 osu! 制谱器 `TapButton.cs` 的做法：
 * - 预热：前 `ignoreCount` 拍只记录不参与计算，累计 `ignoreCount * 2` 拍前仅显示占位；
 * - 窗口：最多保留 `ignoreCount + windowSize` 个时间戳，超出丢弃最旧；
 * - 平均：取第 `ignoreCount + 1` 个到最新一个的首尾差平均；
 * - 倍速归一化：真实时间轴测得的拍间隔除以播放倍速，还原原曲 BPM；
 * - 取整：刻意用取整后的整数 BPM 反算拍长。
 */

export interface BpmTapSettings {
	/** 预热忽略拍数（源自 osu `initial_taps_to_ignore`）。 */
	ignoreCount: number;
	/** 取样窗口拍数（源自 osu `max_taps_to_consider`）。 */
	windowSize: number;
	/** 合法 BPM 下限，超出范围的结果直接丢弃。 */
	minBpm: number;
	/** 合法 BPM 上限，超出范围的结果直接丢弃。 */
	maxBpm: number;
	/** 空闲重置秒数：停顿超过该时长后，下一次打拍将开启新会话。 */
	idleResetSeconds: number;
	/** 是否按播放倍速归一化（把打拍结果换算回原曲速度）。 */
	normalizePlaybackRate: boolean;
}

export const DEFAULT_TAP_SETTINGS: BpmTapSettings = {
	ignoreCount: 4,
	windowSize: 128,
	minBpm: 20,
	maxBpm: 400,
	idleResetSeconds: 2.5,
	normalizePlaybackRate: true,
};

/** 单个打拍时间戳及其采样时的时间基准（rate=1 表示本身就是音乐时间轴，如频谱图点击）。 */
export interface TapEntry {
	time: number;
	rate: number;
}

/** 预热期是否已结束，可以对外回报 BPM 数值（对齐 osu `initial_taps_to_ignore * 2`）。 */
export function isTapWarmupComplete(
	tapCount: number,
	settings: BpmTapSettings,
): boolean {
	return tapCount >= settings.ignoreCount * 2;
}

export interface TapBpmEstimate {
	/** 原曲 BPM（整数，已按倍速归一化）。 */
	bpm: number;
	/** 由取整后的 BPM 反算的拍长（秒）。 */
	beatLengthSeconds: number;
	/** 打拍稳定度 0-1（拍间隔标准差与均值之比）。 */
	confidence: number;
}

/**
 * 由打拍时间戳估算原曲 BPM。
 *
 * @param tapTimes 打拍时间戳（秒），升序，应为同一时间基准（同一 rate）下的连续会话，
 *   至多 `ignoreCount + windowSize` 个。
 * @param playbackRate 采样时使用的倍速快照（时间戳本身为音乐时间轴时传 1）。
 * @param settings 打拍参数。
 * @returns 预热未完成、间隔非法或结果超出合法范围时返回 `null`。
 */
export function estimateBpmFromTaps(
	tapTimes: number[],
	playbackRate: number,
	settings: BpmTapSettings,
): TapBpmEstimate | null {
	if (!isTapWarmupComplete(tapTimes.length, settings)) return null;

	const start = settings.ignoreCount;
	const end = tapTimes.length - 1;

	// 对齐 osu: (last - taps[ignoreCount]) / (count - ignoreCount - 1)
	const averageBeatLengthReal = (tapTimes[end] - tapTimes[start]) / (end - start);
	if (!(averageBeatLengthReal > 0)) return null;

	// 对齐 osu 的 `/ clockRate`：把真实时间轴上的间隔换算回原曲速度
	const rate = settings.normalizePlaybackRate ? playbackRate : 1;
	if (!(rate > 0)) return null;

	const bpm = Math.round(60 / averageBeatLengthReal / rate);
	if (bpm < settings.minBpm || bpm > settings.maxBpm) return null;

	return {
		bpm,
		beatLengthSeconds: 60 / bpm,
		confidence: computeTapConfidence(tapTimes),
	};
}

/**
 * 打拍稳定度：`clamp(1 - stdev(intervals) / mean(intervals), 0, 1)`。
 * 拍间隔越均匀越接近 1。
 */
export function computeTapConfidence(tapTimes: number[]): number {
	if (tapTimes.length < 2) return 0;

	const intervals: number[] = [];
	for (let i = 1; i < tapTimes.length; i++) {
		intervals.push(tapTimes[i] - tapTimes[i - 1]);
	}

	const mean = intervals.reduce((sum, d) => sum + d, 0) / intervals.length;
	if (!(mean > 0)) return 0;

	const variance =
		intervals.reduce((sum, d) => sum + (d - mean) ** 2, 0) / intervals.length;
	const stdev = Math.sqrt(variance);

	return Math.min(1, Math.max(0, 1 - stdev / mean));
}

/**
 * 由打拍时间戳与 BPM 估算最优锚点（中位数法）。
 * 返回值与 `tapTimes` 同一时间基准（同域）。
 */
export function computeOptimalAnchorTick(
	tapTimes: number[],
	bpm: number,
): number {
	if (tapTimes.length === 0) return 0;
	if (tapTimes.length === 1) return tapTimes[0];

	const period = 60 / bpm;
	if (period <= 0) return tapTimes[0];

	const t0 = tapTimes[0];
	const stableTaps = tapTimes.length >= 4 ? tapTimes.slice(1) : tapTimes;

	const offsets: number[] = stableTaps.map((t) => {
		const diff = (t - t0) % period;
		let normalizedDiff = diff;
		if (normalizedDiff > period / 2) {
			normalizedDiff -= period;
		} else if (normalizedDiff < -period / 2) {
			normalizedDiff += period;
		}
		return normalizedDiff;
	});

	offsets.sort((a, b) => a - b);
	const mid = Math.floor(offsets.length / 2);
	const medianOffset =
		offsets.length % 2 !== 0
			? offsets[mid]
			: (offsets[mid - 1] + offsets[mid]) / 2;

	let optimalAnchor = t0 + medianOffset;
	while (optimalAnchor < 0) {
		optimalAnchor += period;
	}

	return optimalAnchor;
}

/** 对齐 osu 刻意取整：拍长由取整后的 BPM 反算。 */
export function bpmToBeatLengthSeconds(bpm: number): number {
	return 60 / bpm;
}
