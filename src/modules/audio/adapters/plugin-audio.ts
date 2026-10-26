import type {
	TrustedJsAudioStateV0,
	TrustedJsBpmStateV0,
	TrustedJsBeatResultV0,
	TrustedJsTapModeV0,
} from "@amll-ttml-tool/plugin-sdk-js";
import { audioEngine } from "$/modules/audio/audio-engine";
import {
	audioEngineStateAtom,
	currentDurationAtom,
	playbackRateAtom,
	loadedAudioAtom,
	bpmStateAtom,
	analyzedBpmStateAtom,
	bpmScaleAtom,
	bpmFollowPlaybackRateAtom,
	bpmTapModeAtom,
	bpmSidebarViewAtom,
	totalTapCountAtom,
} from "$/modules/audio/states";
import { showBeatLinesAtom } from "$/modules/spectrogram/states";
import { SyncJudgeMode, syncJudgeModeAtom } from "$/modules/settings/states";
import { keySyncNextAtom } from "$/states/keybindings";
import { globalStore } from "$/states/store";
import { registerKeyBindings, formatKeyBindings } from "$/utils/keybindings";

export const getHostAudioState = (): TrustedJsAudioStateV0 => ({
	engineState: globalStore.get(audioEngineStateAtom),
	loaded: audioEngine.musicLoaded,
	durationMs: globalStore.get(currentDurationAtom),
	currentTimeMs: audioEngine.musicCurrentTime * 1000,
	playbackRate: globalStore.get(playbackRateAtom),
});
export const subscribeHostAudioChanges = (
	listener: (s: TrustedJsAudioStateV0) => void,
) => {
	const notify = () => listener(getHostAudioState());
	const unsubs = [
		globalStore.sub(audioEngineStateAtom, notify),
		globalStore.sub(currentDurationAtom, notify),
		globalStore.sub(playbackRateAtom, notify),
		globalStore.sub(loadedAudioAtom, notify),
	];
	audioEngine.onTimeUpdate(notify);
	return () => {
		unsubs.forEach((fn) => {
			fn();
		});
		audioEngine.offTimeUpdate(notify);
	};
};
export const getHostBpmState = (): TrustedJsBpmStateV0 => {
	const state = globalStore.get(bpmStateAtom);
	const common = {
		tapMode: globalStore.get(bpmTapModeAtom),
		scale: globalStore.get(bpmScaleAtom),
		followPlaybackRate: globalStore.get(bpmFollowPlaybackRateAtom),
		showBeatLines: globalStore.get(showBeatLinesAtom),
	};
	if (state.status === "completed")
		return {
			...common,
			status: "completed",
			...state.result,
			ticks: [...state.result.ticks],
			calculationTimeMs: state.calculationTime,
		};
	return { ...common, ...state };
};
export const subscribeHostBpmChanges = (
	listener: (s: TrustedJsBpmStateV0) => void,
) => {
	const notify = () => listener(getHostBpmState());
	const unsubs = [
		globalStore.sub(bpmStateAtom, notify),
		globalStore.sub(bpmScaleAtom, notify),
		globalStore.sub(bpmFollowPlaybackRateAtom, notify),
		globalStore.sub(showBeatLinesAtom, notify),
		globalStore.sub(keySyncNextAtom, notify),
		globalStore.sub(bpmTapModeAtom, notify),
	];
	return () =>
		unsubs.forEach((fn) => {
			fn();
		});
};
export const setHostBpmScale = (scale: number) => {
	if (!Number.isFinite(scale) || scale < 1 / 64 || scale > 64)
		throw new Error("BPM scale must be between 1/64 and 64");
	globalStore.set(bpmScaleAtom, scale);
};
const booleanValue = (v: boolean) => {
	if (typeof v !== "boolean") throw new Error("Expected boolean");
	return v;
};
export const setHostBpmFollowPlaybackRate = (v: boolean) =>
	globalStore.set(bpmFollowPlaybackRateAtom, booleanValue(v));
export const setHostShowBeatLines = (v: boolean) =>
	globalStore.set(showBeatLinesAtom, booleanValue(v));
export const applyHostBpmCalibration = (result: TrustedJsBeatResultV0) => {
	if (
		!result ||
		!Number.isFinite(result.bpm) ||
		result.bpm < 20 ||
		result.bpm > 400 ||
		!Number.isFinite(result.baseBpm) ||
		result.baseBpm <= 0 ||
		!Number.isFinite(result.anchorTick) ||
		result.anchorTick < 0 ||
		!Number.isFinite(result.confidence) ||
		result.confidence < 0 ||
		result.confidence > 1 ||
		!Array.isArray(result.ticks) ||
		result.ticks.length > 100000 ||
		result.ticks.some(
			(v, i) =>
				!Number.isFinite(v) || v < 0 || (i > 0 && v <= result.ticks[i - 1]),
		)
	)
		throw new Error("Invalid beat result");
	globalStore.set(bpmStateAtom, {
		status: "completed",
		result: { ...result, ticks: [...result.ticks] },
		calculationTime: 0,
	});
	globalStore.set(bpmScaleAtom, 1);
};
export const resetHostBpm = () => {
	globalStore.set(bpmStateAtom, globalStore.get(analyzedBpmStateAtom));
	globalStore.set(bpmScaleAtom, 1);
	globalStore.set(totalTapCountAtom, 0);
};
let lastTapTime: number | undefined;
let tapListener: ((time: number) => void) | undefined;
export const setHostBpmTapMode = (mode: TrustedJsTapModeV0) => {
	if (!["off", "key", "spectrogram"].includes(mode))
		throw new Error("Invalid tap mode");
	if (mode !== "off" && !tapListener) throw new Error("No BPM provider");
	lastTapTime = undefined;
	globalStore.set(bpmTapModeAtom, mode);
	globalStore.set(totalTapCountAtom, 0);
};
export const getHostBpmTapKeyLabel = () =>
	formatKeyBindings(globalStore.get(keySyncNextAtom));
// Keep real-device latency and the user's key-down/up judgment at the input boundary.
export const tapHostBpm = (timeSeconds?: number, downTimeOffset = 0) => {
	let time = timeSeconds;
	if (time === undefined) {
		time = audioEngine.ctxCurrentTime + (audioEngine.ctxOutputLatency || 0);
		if (time <= 0) time = performance.now() / 1000;
		else {
			const mode = globalStore.get(syncJudgeModeAtom);
			if (mode === SyncJudgeMode.FirstKeyDownTime)
				time -= downTimeOffset / 1000;
			else if (mode === SyncJudgeMode.MiddleKeyTime)
				time -= downTimeOffset / 2000;
		}
	}
	if (!Number.isFinite(time) || time < 0) throw new Error("Invalid tap time");
	if (tapListener) {
		tapListener(time);
		globalStore.set(totalTapCountAtom, (n) =>
			lastTapTime === undefined ||
			time <= lastTapTime ||
			time - lastTapTime > 2.5
				? 1
				: n + 1,
		);
		lastTapTime = time;
	}
};
export const connectHostBpm = (
	viewId: string,
	listener: (time: number) => void,
) => {
	if (tapListener) throw new Error("A BPM provider is already connected");
	tapListener = listener;
	globalStore.set(bpmSidebarViewAtom, viewId);
	const bind = () =>
		globalStore.get(bpmTapModeAtom) !== "key"
			? () => {}
			: registerKeyBindings(globalStore.get(keySyncNextAtom), (e) => {
					if (globalStore.get(bpmTapModeAtom) === "key")
						tapHostBpm(undefined, e.downTimeOffset);
				});
	let unbind = bind();
	const unsubscribe = globalStore.sub(keySyncNextAtom, () => {
		unbind();
		unbind = bind();
	});
	const modeSubscription = globalStore.sub(bpmTapModeAtom, () => {
		unbind();
		unbind = bind();
	});
	const resetInput = () => {
		setHostBpmTapMode("off");
		globalStore.set(bpmScaleAtom, 1);
	};
	const audioSubscription = globalStore.sub(loadedAudioAtom, resetInput);
	return () => {
		if (tapListener !== listener) return;
		tapListener = undefined;
		unbind();
		unsubscribe();
		modeSubscription();
		audioSubscription();
		globalStore.set(bpmTapModeAtom, "off");
		globalStore.set(totalTapCountAtom, 0);
		globalStore.set(bpmSidebarViewAtom, null);
	};
};
