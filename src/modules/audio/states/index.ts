import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { EngineState } from "$/modules/ffmpeg/types.ts";
import type { BpmAnalysisResult } from "$/modules/ffmpeg/worker/wasm/bpm-analyzer/bpm_analyzer_wasm";
import { DEFAULT_TAP_SETTINGS } from "$/modules/audio/utils/bpm-algorithm";
import type { BpmTapSettings } from "$/modules/audio/utils/bpm-algorithm";

export type BpmState =
	| { status: "idle" }
	| { status: "analyzing" }
	| {
			status: "completed";
			result: BpmAnalysisResult;
			calculationTime: number;
	  }
	| {
			status: "error";
			error: string;
	  };

export const bpmStateAtom = atom<BpmState>({ status: "idle" });
export const bpmScaleAtom = atom<number>(1);
export const bpmFollowPlaybackRateAtom = atomWithStorage(
	"bpmFollowPlaybackRate",
	true,
);

export const audioEngineStateAtom = atom<EngineState>("idle");
export const volumeAtom = atomWithStorage("volume", 0.5);
export const playbackRateAtom = atomWithStorage("playbackRate", 1);
export const audioPlayingAtom = atom(false);
export const loadedAudioAtom = atom(new Blob([]));
export const currentDurationAtom = atom(0);
export const isAuditioningAtom = atom(false);
export const audioErrorAtom = atom<string | null>(null);
export const pcmDataReadyAtom = atom(false);

export type BpmTapMode = "off" | "key" | "spectrogram";
export const bpmTapModeAtom = atom<BpmTapMode>("off");
export const tapTimesAtom = atom<number[]>([]);
export const totalTapCountAtom = atom<number>(0);
export const hasSeenTapWindowTipAtom = atomWithStorage(
	"hasSeenTapWindowTip",
	false,
);

// 打拍测定参数（算法语义见 bpm-algorithm.ts，默认值源自 osu! 制谱器 TapButton）
export const bpmTapSettingsAtom = atomWithStorage<BpmTapSettings>(
	"bpmTapSettings",
	DEFAULT_TAP_SETTINGS,
);

// 参考节拍器（对齐乐曲拍线：anchorTick + 等间隔，跟随播放倍速）
export const metronomeEnabledAtom = atomWithStorage("metronomeEnabled", false);
export const metronomeVolumeAtom = atomWithStorage("metronomeVolume", 0.6);
export const metronomeAccentEnabledAtom = atomWithStorage(
	"metronomeAccent",
	true,
);

// 最近一次「自动」锚点（秒）：打拍/自动分析写入结果时记录，
// 供 offset 数值控件的「恢复自动值」使用。会话级，不持久化。
export const autoAnchorTickAtom = atom<number | null>(null);
