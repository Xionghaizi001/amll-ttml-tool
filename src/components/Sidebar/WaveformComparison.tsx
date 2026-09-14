import { Flex, Text } from "@radix-ui/themes";
import { useAtomValue, useSetAtom } from "jotai";
import { type FC, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { audioEngine } from "$/modules/audio/audio-engine";
import {
	bpmScaleAtom,
	bpmStateAtom,
	currentDurationAtom,
	loadedAudioAtom,
	waveformPcmPeaksAtom,
} from "$/modules/audio/states";
import { buildPcmPeaks } from "$/modules/audio/utils/waveform-analysis";

/**
 * 波形对比校准视图（移植自 osu! 制谱器 WaveformComparisonDisplay）。
 *
 * 8 行画布垂直堆叠，每行显示以「拍网格上的一拍」为中心的 ~300ms 波形切片：
 * 若锚点偏移与 BPM 正确，各行波形中的音乐尖峰（鼓点）会连成一条贯穿的竖线。
 * 调整「锚点偏移」时各行切片实时平移，对齐即完成校准。
 *
 * 数据源：主线程 WebAudio 解码原始音频后按 1ms 粒度聚合的 min/max 峰值
 * （wasm 解码器的帧级 peaks 约 26ms/列，不足以支撑窗口内的细节显示）。
 *
 * - 默认跟随播放/暂停位置所在拍；鼠标悬停可按横轴位置预览任意拍（对齐 osu）；
 * - 单击锁定视图（osu 同款交互），再点解锁；
 * - 超出音频范围（前奏之前/结尾之后）的行以低透明度提示。
 */

const ROW_COUNT = 8;
const ROW_HEIGHT = 26;
const ROW_GAP = 2;
const ROW_PITCH = ROW_HEIGHT + ROW_GAP;
const WINDOW_MS = 300;
const HALF_WINDOW_MS = WINDOW_MS / 2;
/** 当前拍行（前 4 拍之后的那行，对齐 osu 的 total_waveforms / 2）。 */
const MAIN_ROW_INDEX = ROW_COUNT / 2;

export const WaveformComparison: FC = () => {
	const { t } = useTranslation();
	const bpmState = useAtomValue(bpmStateAtom);
	const bpmScale = useAtomValue(bpmScaleAtom);
	const durationMs = useAtomValue(currentDurationAtom);
	const loadedAudio = useAtomValue(loadedAudioAtom);
	const pcmPeaks = useAtomValue(waveformPcmPeaksAtom);
	const setPcmPeaks = useSetAtom(waveformPcmPeaksAtom);

	const [decoding, setDecoding] = useState(false);
	const [decodeError, setDecodeError] = useState(false);
	const [locked, setLocked] = useState(false);
	const lockedBeatRef = useRef(0);
	const hoveredBeatRef = useRef<number | null>(null);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	// 已解码/解码中的音频 Blob 引用：幂等守卫，防止 effect 重建时重复发起
	// 或被 cleanup 误取消（此前 canceled 模式会在 setDecoding 触发重建时
	// 把自己的解码结果丢掉，造成「一直解码音频…」死锁）
	const decodedBlobRef = useRef<Blob | null>(null);

	const active =
		bpmState.status === "completed" && durationMs > 0 && loadedAudio.size > 0;

	// 展开时懒解码：一次性把整条音频聚合为 1ms 粒度峰值并缓存到 atom
	useEffect(() => {
		if (!active || loadedAudio.size === 0) return;
		if (decodedBlobRef.current === loadedAudio) return;
		decodedBlobRef.current = loadedAudio;
		setPcmPeaks(null);
		setDecodeError(false);
		setDecoding(true);
		buildPcmPeaks(loadedAudio, audioEngine.ctx)
			.then((result) => {
				setPcmPeaks(result);
			})
			.catch((err) => {
				console.error("Waveform PCM decode failed:", err);
				setDecodeError(true);
			})
			.finally(() => {
				setDecoding(false);
			});
	}, [active, loadedAudio, setPcmPeaks]);

	// 绘制循环内读取的高频变化值走 ref（渲染后同步），
	// BPM/锚点/缩放/峰值数据变化即时生效，无需重建循环
	const stateRef = useRef({ bpmState, bpmScale, pcmPeaks });
	useEffect(() => {
		stateRef.current = { bpmState, bpmScale, pcmPeaks };
	});

	useEffect(() => {
		if (!active || pcmPeaks === null) return;

		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		let rafId = 0;

		const draw = () => {
			const { bpmState: state, bpmScale: scale, pcmPeaks: pp } =
				stateRef.current;
			const cssWidth = canvas.clientWidth;
			const cssHeight = canvas.clientHeight;
			const dpr = window.devicePixelRatio || 1;
			if (cssWidth > 0 && cssHeight > 0) {
				const targetW = Math.round(cssWidth * dpr);
				const targetH = Math.round(cssHeight * dpr);
				if (canvas.width !== targetW || canvas.height !== targetH) {
					canvas.width = targetW;
					canvas.height = targetH;
				}
			}

			const styles = getComputedStyle(canvas);
			const accentColor =
				styles.getPropertyValue("--accent-11").trim() || "#3e63dd";
			const waveColor = styles.getPropertyValue("--gray-11").trim() || "#888";
			const dimColor = styles.getPropertyValue("--gray-5").trim() || "#eee";
			const textColor = styles.getPropertyValue("--gray-9").trim() || "#666";

			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, cssWidth, cssHeight);

			if (state.status !== "completed" || pp === null) {
				rafId = requestAnimationFrame(draw);
				return;
			}

			const effectiveBpm = state.result.bpm * scale;
			const beatLenMs = effectiveBpm > 0 ? 60000 / effectiveBpm : 0;
			if (!(beatLenMs > 0)) {
				rafId = requestAnimationFrame(draw);
				return;
			}
			const anchorMs = (state.result.anchorTick ?? 0) * 1000;
			const durationLocal = (pp.data.length / 2) * pp.msPerEntry;
			const halfW = cssWidth / 2;
			const halfRowH = ROW_HEIGHT / 2;
			const amplitude = (ROW_HEIGHT - 3) / 2;

			// 参考拍：锁定 > 悬停 > 播放/暂停位置
			let centerBeat: number;
			if (locked) {
				centerBeat = lockedBeatRef.current;
			} else if (hoveredBeatRef.current !== null) {
				centerBeat = hoveredBeatRef.current;
			} else {
				centerBeat = Math.round(
					(audioEngine.musicCurrentTime * 1000 - anchorMs) / beatLenMs,
				);
			}

			const firstBeatIndex = centerBeat - MAIN_ROW_INDEX;

			ctx.textBaseline = "top";
			ctx.font = "9px ui-monospace, monospace";

			for (let row = 0; row < ROW_COUNT; row++) {
				const beatIndex = firstBeatIndex + row;
				const beatTimeMs = anchorMs + beatIndex * beatLenMs;
				const rowTop = row * ROW_PITCH;
				const inRange = beatTimeMs >= -HALF_WINDOW_MS && beatTimeMs <= durationLocal;

				if (row === MAIN_ROW_INDEX) {
					ctx.globalAlpha = 1;
					ctx.fillStyle = dimColor;
					ctx.fillRect(0, rowTop, cssWidth, ROW_HEIGHT);
				}

				// 波形切片：以该拍为中心的 ±150ms，逐毫秒取 min/max 包络
				const from = beatTimeMs - HALF_WINDOW_MS;
				const to = beatTimeMs + HALF_WINDOW_MS;
				const startEntry = Math.max(
					0,
					Math.floor(from / pp.msPerEntry),
				);
				const endEntry = Math.min(
					pp.data.length / 2,
					Math.ceil(to / pp.msPerEntry),
				);

				ctx.globalAlpha = inRange ? 1 : 0.25;
				ctx.fillStyle = waveColor;
				ctx.beginPath();

				let first = true;
				for (let i = startEntry; i < endEntry; i++) {
					const entryMs = i * pp.msPerEntry;
					const x = ((entryMs - from) / WINDOW_MS) * cssWidth;
					const y = rowTop + halfRowH - pp.data[i * 2 + 1] * amplitude;
					if (first) {
						ctx.moveTo(x, y);
						first = false;
					} else {
						ctx.lineTo(x, y);
					}
				}
				for (let i = endEntry - 1; i >= startEntry; i--) {
					const entryMs = i * pp.msPerEntry;
					const x = ((entryMs - from) / WINDOW_MS) * cssWidth;
					ctx.lineTo(x, rowTop + halfRowH - pp.data[i * 2] * amplitude);
				}
				ctx.closePath();
				ctx.fill();

				// 拍号
				ctx.fillStyle = textColor;
				ctx.fillText(String(beatIndex), 4, rowTop + 7);
			}

			// 参考竖线：贯穿全部行，位于容器中心
			ctx.globalAlpha = 0.9;
			ctx.fillStyle = accentColor;
			ctx.fillRect(halfW - 1, 0, 2, cssHeight);
			ctx.globalAlpha = 1;

			rafId = requestAnimationFrame(draw);
		};

		rafId = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(rafId);
	}, [active, locked, pcmPeaks]);

	// 对齐 osu：鼠标横轴位置直接映射到全曲拍号
	const beatAtMouseX = (mouseXRatio: number): number | null => {
		const st = stateRef.current;
		if (st.bpmState.status !== "completed") return null;
		const beatLenMs = 60000 / (st.bpmState.result.bpm * st.bpmScale || 1);
		if (!(beatLenMs > 0)) return null;
		const anchorMs = (st.bpmState.result.anchorTick ?? 0) * 1000;
		const durationLocal =
			st.pcmPeaks !== null ? (st.pcmPeaks.data.length / 2) * st.pcmPeaks.msPerEntry : 0;
		if (durationLocal <= 0) return null;
		return Math.round((mouseXRatio * durationLocal - anchorMs) / beatLenMs);
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (locked) return;
		const rect = e.currentTarget.getBoundingClientRect();
		hoveredBeatRef.current = beatAtMouseX((e.clientX - rect.left) / rect.width);
	};

	const handleClick = () => {
		if (locked) {
			setLocked(false);
			return;
		}
		lockedBeatRef.current = hoveredBeatRef.current ?? beatAtMouseX(0.5) ?? 0;
		setLocked(true);
	};

	if (!active) return null;

	return (
		<Flex direction="column" gap="1">
			<Text size="1" color="gray">
				{t(
					"sidebar.bpm.waveformComparisonHint",
					"悬停预览任意拍，点击锁定视图；调整锚点偏移，使各行波形尖峰与中线对齐",
				)}
				{locked &&
					` · ${t("sidebar.bpm.waveformComparisonLocked", "已锁定，再次点击解锁")}`}
			</Text>
			{decoding && (
				<Text size="1" color="gray">
					{t("sidebar.bpm.waveformComparisonDecoding", "正在解码音频…")}
				</Text>
			)}
			{decodeError && (
				<Text size="1" color="red">
					{t("sidebar.bpm.waveformComparisonDecodeError", "音频解码失败")}
				</Text>
			)}
			<canvas
				ref={canvasRef}
				onMouseMove={handleMouseMove}
				onClick={handleClick}
				onMouseLeave={() => {
					hoveredBeatRef.current = null;
				}}
				style={{
					width: "100%",
					height: ROW_COUNT * ROW_PITCH - ROW_GAP,
					borderRadius: "var(--radius-2)",
					border: locked
						? "2px solid var(--red-9)"
						: "1px solid var(--gray-a5)",
					cursor: locked ? "default" : "crosshair",
					display: "block",
					visibility: pcmPeaks === null ? "hidden" : "visible",
				}}
			/>
		</Flex>
	);
};
