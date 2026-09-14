import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { audioEngine } from "$/modules/audio/audio-engine";
import {
	audioPlayingAtom,
	bpmScaleAtom,
	bpmStateAtom,
	bpmTapModeAtom,
	metronomeAccentEnabledAtom,
	metronomeEnabledAtom,
	metronomeVolumeAtom,
} from "$/modules/audio/states";

/**
 * 参考节拍器：按 `anchorTick + k * beatLength` 对齐乐曲时间轴发声。
 *
 * 与 LatencyTest 的自由计时不同（该实现为朴素 while 循环，长期会累积漂移），
 * 这里采用前瞻调度（lookahead scheduling）：
 * - 每帧把「未来 ~200ms（真实时间）」内到期的拍点以绝对 `when` 提交给 Web Audio；
 * - `when = ctxNow + (beatMusic - musicNow) / rate`，天然跟随播放倍速；
 * - 检测到 seek（帧间音乐时间跳变）时停止已排程节点并重新锚定，避免漂移与错位。
 * - 打拍模式下自动静音（对齐 osu! TapTimingControl 打拍时关闭节拍器点击）。
 */
export function useMetronome() {
	const enabled = useAtomValue(metronomeEnabledAtom);
	const volume = useAtomValue(metronomeVolumeAtom);
	const accentEnabled = useAtomValue(metronomeAccentEnabledAtom);
	const audioPlaying = useAtomValue(audioPlayingAtom);
	const tapMode = useAtomValue(bpmTapModeAtom);
	const bpmState = useAtomValue(bpmStateAtom);
	const bpmScale = useAtomValue(bpmScaleAtom);

	// 循环内读取的高频变化值走 ref，避免每拍/每帧重建调度循环
	const stateRef = useRef({ bpmState, bpmScale, volume, accentEnabled });
	stateRef.current = { bpmState, bpmScale, volume, accentEnabled };

	useEffect(() => {
		if (!enabled || !audioPlaying || tapMode !== "off") {
			return;
		}

		const LOOKAHEAD_REAL_SECONDS = 0.2;
		const CLICK_DURATION_SECONDS = 0.05;
		const scheduled: AudioScheduledSourceNode[] = [];
		let rafId = 0;
		let lastMusicTime = audioEngine.musicCurrentTime;
		let nextBeatIndex: number | null = null;
		let nextBeatTime: number | null = null;

		const stopAllScheduled = () => {
			for (const node of scheduled) {
				try {
					node.stop();
				} catch {
					// 节点可能已自然结束
				}
			}
			scheduled.length = 0;
		};

		const playClick = (when: number, isAccent: boolean) => {
			const ctx = audioEngine.ctx;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = "sine";
			osc.frequency.value = isAccent ? 880 : 440;
			gain.gain.value = stateRef.current.volume;
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start(when);
			osc.stop(when + CLICK_DURATION_SECONDS);
			osc.addEventListener("ended", () => {
				gain.disconnect();
				const idx = scheduled.indexOf(osc);
				if (idx >= 0) scheduled.splice(idx, 1);
			});
			scheduled.push(osc);
		};

		const tick = () => {
			const { bpmState, bpmScale } = stateRef.current;
			const musicNow = audioEngine.musicCurrentTime;
			const ctxNow = audioEngine.ctxCurrentTime;
			const rate = audioEngine.musicPlayBackRate || 1;

			// seek 检测：正常播放每帧推进约 rate * frameTime，
			// 超出合理范围的跳变视为 seek，取消已排程节点并重新锚定
			if (Math.abs(musicNow - lastMusicTime) > rate * 0.15 + 0.02) {
				stopAllScheduled();
				nextBeatIndex = null;
				nextBeatTime = null;
			}
			lastMusicTime = musicNow;

			if (!audioEngine.musicPlaying || bpmState.status !== "completed") {
				rafId = requestAnimationFrame(tick);
				return;
			}

			const effectiveBpm = bpmState.result.bpm * bpmScale;
			const beatLength = effectiveBpm > 0 ? 60 / effectiveBpm : 0;
			if (!(beatLength > 0)) {
				rafId = requestAnimationFrame(tick);
				return;
			}
			const anchor = bpmState.result.anchorTick ?? 0;

			if (nextBeatTime === null || nextBeatIndex === null) {
				const k = Math.ceil((musicNow - anchor) / beatLength - 1e-9);
				nextBeatIndex = k;
				nextBeatTime = anchor + k * beatLength;
			}

			const windowEnd = musicNow + LOOKAHEAD_REAL_SECONDS * rate;
			while (nextBeatTime < windowEnd) {
				if (nextBeatTime > musicNow) {
					const when = ctxNow + (nextBeatTime - musicNow) / rate;
					if (when > ctxNow) {
						const isAccent =
							stateRef.current.accentEnabled && nextBeatIndex % 4 === 0;
						playClick(when, isAccent);
					}
				}
				nextBeatIndex += 1;
				nextBeatTime += beatLength;
			}

			rafId = requestAnimationFrame(tick);
		};

		rafId = requestAnimationFrame(tick);

		return () => {
			cancelAnimationFrame(rafId);
			stopAllScheduled();
		};
	}, [enabled, audioPlaying, tapMode]);
}
