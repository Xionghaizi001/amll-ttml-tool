/**
 * 从音频文件解码出固定毫秒粒度的波形峰值（[min, max] 交织数组），
 * 供波形对比校准视图绘制切片。
 *
 * 粒度取 ~4ms：足以平滑掉采样级噪声、凸显音乐包络（鼓点尖峰），
 * 同时 300ms 窗口约 75 列，与视图像素密度匹配。
 * wasm 解码器的帧级 peaks（~26ms/列）过粗，故用 WebAudio 解码原始 PCM。
 */

export interface PcmPeaks {
	/** [min0, max0, min1, max1, ...] 交织数组，长度 = 条目数 × 2。 */
	data: Float32Array;
	/** 每个条目覆盖的毫秒数。 */
	msPerEntry: number;
}

export async function buildPcmPeaks(
	audioFile: Blob,
	ctx: AudioContext,
	msPerEntry = 4,
): Promise<PcmPeaks> {
	const arrayBuffer = await audioFile.arrayBuffer();
	const buffer = await ctx.decodeAudioData(arrayBuffer);

	const channels = Math.min(buffer.numberOfChannels, 2);
	const ch0 = buffer.getChannelData(0);
	const ch1 = channels > 1 ? buffer.getChannelData(1) : null;
	const samplesPerEntry = (buffer.sampleRate / 1000) * msPerEntry;
	const entryCount = Math.max(
		1,
		Math.ceil((buffer.duration * 1000) / msPerEntry),
	);
	const data = new Float32Array(entryCount * 2);

	for (let entry = 0; entry < entryCount; entry++) {
		const from = Math.floor(entry * samplesPerEntry);
		const to = Math.min(
			buffer.length,
			Math.floor((entry + 1) * samplesPerEntry),
		);
		let min = Number.POSITIVE_INFINITY;
		let max = Number.NEGATIVE_INFINITY;
		for (let s = from; s < to; s++) {
			const v = ch1 ? (ch0[s] + ch1[s]) * 0.5 : ch0[s];
			if (v < min) min = v;
			if (v > max) max = v;
		}
		if (to <= from || min === Number.POSITIVE_INFINITY) {
			min = 0;
			max = 0;
		}
		data[entry * 2] = min;
		data[entry * 2 + 1] = max;
	}

	return { data, msPerEntry };
}
