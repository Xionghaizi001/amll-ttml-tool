import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { EngineState } from "$/modules/ffmpeg/types.ts";

export interface BpmAnalysisResult {
	bpm: number;
	anchorTick: number;
	confidence: number;
	ticks: number[];
}

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
