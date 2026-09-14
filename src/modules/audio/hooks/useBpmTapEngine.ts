import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef, useState } from "react";
import { audioEngine } from "$/modules/audio/audio-engine";
import {
	bpmScaleAtom,
	bpmStateAtom,
	bpmTapModeAtom,
	bpmTapSettingsAtom,
	tapTimesAtom,
	totalTapCountAtom,
} from "$/modules/audio/states";
import {
	computeOptimalAnchorTick,
	estimateBpmFromTaps,
} from "$/modules/audio/utils/bpm-algorithm";
import { SyncJudgeMode, syncJudgeModeAtom } from "$/modules/settings/states";
import { globalStore } from "$/states/store";

export function useBpmTapEngine() {
	const [tapMode, setTapMode] = useAtom(bpmTapModeAtom);
	const [tapTimes, setTapTimes] = useAtom(tapTimesAtom);
	const [totalTapCount, setTotalTapCount] = useAtom(totalTapCountAtom);
	const setBpmState = useSetAtom(bpmStateAtom);
	const setScale = useSetAtom(bpmScaleAtom);
	const syncJudgeMode = useAtomValue(syncJudgeModeAtom);
	const tapSettings = useAtomValue(bpmTapSettingsAtom);

	// 会话倍速快照：同一会话内所有时间戳必须处于同一时间基准，
	// 中途变速（或从键盘拍切换到频谱拍）会导致窗口内数据混域，必须重置。
	const sessionRateRef = useRef<number | null>(null);

	const [isHighlighted, setIsHighlighted] = useState(false);

	const isKeyTapMode = tapMode === "key";
	const isSpectrogramTapMode = tapMode === "spectrogram";
	const isTapModeActive = tapMode !== "off";

	const triggerHighlight = useCallback(() => {
		setIsHighlighted(true);
		setTimeout(() => {
			setIsHighlighted(false);
		}, 100);
	}, []);

	const triggerTap = useCallback(
		(customTimeSeconds?: number, downTimeOffset = 0) => {
			triggerHighlight();

			let hitTime = 0;
			// 时间基准：频谱图点击传入的是音乐时间轴（rate=1）；
			// 键盘打拍采样 ctx 时钟，是真实世界时间，需除以播放倍速归一化。
			let hitRate = 1;
			if (typeof customTimeSeconds === "number") {
				hitTime = customTimeSeconds;
			} else {
				hitRate = audioEngine.musicPlayBackRate;
				hitTime = audioEngine.ctxCurrentTime + audioEngine.ctxOutputLatency;
				if (hitTime <= 0) {
					hitTime = performance.now() / 1000;
				} else {
					switch (syncJudgeMode) {
						case SyncJudgeMode.FirstKeyDownTime:
							hitTime -= downTimeOffset / 1000;
							break;
						case SyncJudgeMode.LastKeyUpTime:
							break;
						case SyncJudgeMode.MiddleKeyTime:
							hitTime -= downTimeOffset / 2000;
							break;
					}
				}
			}

			const settings = tapSettings;

			setTapTimes((prev) => {
				const now = hitTime;
				let nextTapTimes: number[];
				if (
					prev.length > 0 &&
					sessionRateRef.current !== null &&
					sessionRateRef.current === hitRate &&
					now - prev[prev.length - 1] <= settings.idleResetSeconds
				) {
					nextTapTimes = [...prev, now];
					setTotalTapCount((c) => c + 1);
				} else {
					// 空闲超时、会话倍速变化或全新会话：重置
					nextTapTimes = [now];
					setTotalTapCount(1);
				}
				sessionRateRef.current = hitRate;

				const maxTapHistory = settings.ignoreCount + settings.windowSize;
				if (nextTapTimes.length > maxTapHistory) {
					nextTapTimes = nextTapTimes.slice(-maxTapHistory);
				}

				const estimate = estimateBpmFromTaps(
					nextTapTimes,
					sessionRateRef.current,
					settings,
				);
				if (estimate) {
					// 锚点必须处于音乐时间轴：键盘打拍采样的是真实时间（rate≠1），
					// 无法精确换算为音乐时间，此时保留既有锚点（首次则置 0，仅更新 BPM）。
					const prevResult = globalStore.get(bpmStateAtom);
					const canUpdateAnchor = sessionRateRef.current === 1;
					const optimalAnchor = canUpdateAnchor
						? computeOptimalAnchorTick(nextTapTimes, estimate.bpm)
						: prevResult.status === "completed"
							? prevResult.result.anchorTick
							: 0;
					setBpmState({
						status: "completed",
						result: {
							bpm: estimate.bpm,
							baseBpm: estimate.bpm,
							anchorTick: optimalAnchor,
							confidence: estimate.confidence,
							ticks: [],
						},
						calculationTime: 0,
					});
					setScale(1);
				}

				return nextTapTimes;
			});
		},
		[
			syncJudgeMode,
			tapSettings,
			setBpmState,
			setScale,
			setTapTimes,
			setTotalTapCount,
			triggerHighlight,
		],
	);

	const resetTapTimes = useCallback(() => {
		setTapTimes([]);
		setTotalTapCount(0);
		sessionRateRef.current = null;
	}, [setTapTimes, setTotalTapCount]);

	return {
		tapMode,
		setTapMode,
		isKeyTapMode,
		isSpectrogramTapMode,
		isTapModeActive,
		tapTimes,
		totalTapCount,
		triggerTap,
		resetTapTimes,
		isHighlighted,
	};
}
