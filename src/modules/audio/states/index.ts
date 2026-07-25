import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { EngineState } from "$/modules/ffmpeg/types.ts";
import type { BpmAnalysisResult } from "$/modules/ffmpeg/worker/wasm/bpm-analyzer/bpm_analyzer_wasm";

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
