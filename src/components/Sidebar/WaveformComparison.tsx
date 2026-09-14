import { Flex, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { type FC, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { audioEngine } from "$/modules/audio/audio-engine";
import {
	bpmScaleAtom,
	bpmStateAtom,
	currentDurationAtom,
	waveformPeaksAtom,
} from "$/modules/audio/states";

/**
 * 波形对比校准视图（移植自 osu! 制谱器 WaveformComparisonDisplay）。
 *
 * 8 行画布垂直堆叠，每行显示以「拍网格上的一拍」为中心的 ~300ms 波形切片：
 * 若锚点偏移与 BPM 正确，各行波形中的音乐尖峰（鼓点）会连成一条贯穿的竖线。
 * 调整「锚点偏移」时各行切片实时平移，对齐即完成校准。
 *
 * - 默认跟随播放/暂停位置所在拍；鼠标悬停可按横轴位置预览任意拍（对齐 osu）；
 * - 单击锁定视图（osu 同款交互），再点解锁；
 * - 超出音频范围（前奏之前/结尾之后）的行以低透明度提示。
 */

const ROW_COUNT = 8;
const ROW_HEIGHT = 20;
const WINDOW_MS = 300;
const HALF_WINDOW_MS = WINDOW_MS / 2;
/** 当前拍行（前 4 拍之后的那行，对齐 osu 的 total_waveforms / 2）。 */
const MAIN_ROW_INDEX = ROW_COUNT / 2;

export const WaveformComparison: FC = () => {
	const { t } = useTranslation();
	const bpmState = useAtomValue(bpmStateAtom);
	const bpmScale = useAtomValue(bpmScaleAtom);
	const durationMs = useAtomValue(currentDurationAtom);
	const peaks = useAtomValue(waveformPeaksAtom);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [locked, setLocked] = useState(false);
	const lockedBeatRef = useRef(0);
	const hoveredBeatRef = useRef<number | null>(null);

	// 绘制循环内读取的高频变化值走 ref（渲染后同步），
	// BPM/锚点/缩放/波形快照变化即时生效，无需重建循环
	const stateRef = useRef({ bpmState, bpmScale, durationMs, peaks });
	useEffect(() => {
		stateRef.current = { bpmState, bpmScale, durationMs, peaks };
	});

	const active =
		bpmState.status === "completed" && peaks !== null && durationMs > 0;

	useEffect(() => {
		if (!active) return;

		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		let rafId = 0;

		const draw = () => {
			const { bpmState: state, bpmScale: scale, durationMs: dur, peaks: pk } =
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

			if (state.status !== "completed" || pk === null || dur <= 0) {
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
			const tripletCount = Math.floor(pk.length / 3);
			const msPerTriplet = dur / tripletCount;
			const halfW = cssWidth / 2;
			const halfRowH = ROW_HEIGHT / 2;
			const amplitude = ROW_HEIGHT * 0.42;

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
				const rowTop = row * ROW_HEIGHT;
				const inRange = beatTimeMs >= -HALF_WINDOW_MS && beatTimeMs <= dur;

				if (row === MAIN_ROW_INDEX) {
					ctx.globalAlpha = 1;
					ctx.fillStyle = dimColor;
					ctx.fillRect(0, rowTop, cssWidth, ROW_HEIGHT);
				}

				// 波形切片：以该拍为中心的 ±150ms
				const from = beatTimeMs - HALF_WINDOW_MS;
				const to = beatTimeMs + HALF_WINDOW_MS;
				const startTriplet = Math.max(0, Math.floor(from / msPerTriplet));
				const endTriplet = Math.min(tripletCount, Math.ceil(to / msPerTriplet));

				ctx.globalAlpha = inRange ? 1 : 0.25;
				ctx.fillStyle = waveColor;
				ctx.beginPath();

				let first = true;
				for (let i = startTriplet; i < endTriplet; i++) {
					const pMs = pk[i * 3] * dur;
					const x = ((pMs - from) / WINDOW_MS) * cssWidth;
					const y = rowTop + halfRowH - pk[i * 3 + 2] * amplitude;
					if (first) {
						ctx.moveTo(x, y);
						first = false;
					} else {
						ctx.lineTo(x, y);
					}
				}
				for (let i = endTriplet - 1; i >= startTriplet; i--) {
					const pMs = pk[i * 3] * dur;
					const x = ((pMs - from) / WINDOW_MS) * cssWidth;
					ctx.lineTo(x, rowTop + halfRowH - pk[i * 3 + 1] * amplitude);
				}
				ctx.closePath();
				ctx.fill();

				// 拍号
				ctx.fillStyle = textColor;
				ctx.fillText(String(beatIndex), 4, rowTop + 5);
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
	}, [active, locked]);

	// 对齐 osu：鼠标横轴位置直接映射到全曲拍号
	const beatAtMouseX = (mouseXRatio: number): number | null => {
		const st = stateRef.current;
		if (st.bpmState.status !== "completed" || st.durationMs <= 0) return null;
		const beatLenMs = 60000 / (st.bpmState.result.bpm * st.bpmScale || 1);
		if (!(beatLenMs > 0)) return null;
		const anchorMs = (st.bpmState.result.anchorTick ?? 0) * 1000;
		return Math.round((mouseXRatio * st.durationMs - anchorMs) / beatLenMs);
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
		lockedBeatRef.current =
			hoveredBeatRef.current ??
			beatAtMouseX(0.5) ??
			0;
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
			<canvas
				ref={canvasRef}
				onMouseMove={handleMouseMove}
				onClick={handleClick}
				onMouseLeave={() => {
					hoveredBeatRef.current = null;
				}}
				style={{
					width: "100%",
					height: ROW_COUNT * ROW_HEIGHT,
					borderRadius: "var(--radius-2)",
					border: locked
						? "2px solid var(--red-9)"
						: "1px solid var(--gray-a5)",
					cursor: locked ? "default" : "crosshair",
					display: "block",
				}}
			/>
		</Flex>
	);
};
