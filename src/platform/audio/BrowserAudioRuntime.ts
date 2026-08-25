import type { AudioRuntimePort } from "$/modules/audio/ports/audio-runtime";
import AnalyzerWorker from "$/modules/ffmpeg/worker/analyzer.worker.ts?worker";
import DecoderWorkerUrl from "$/modules/ffmpeg/worker/decoder.worker.ts?worker&url";
import RendererWorker from "$/modules/ffmpeg/worker/renderer.worker.ts?worker";
import ffmpegWasmUrl from "$/modules/ffmpeg/worker/wasm/ffmpeg/ffmpeg_wasm.wasm?url";
import AudioWorkletUrl from "$/modules/ffmpeg/worklet/audio.worklet.ts?worker&url";
import soundtouchWasmUrl from "$/modules/ffmpeg/worklet/wasm/soundtouch_bg.wasm?url";
import SpectrogramWorkerConstructor from "$/modules/spectrogram/workers/spectrogram.worker.ts?worker";

export const browserAudioRuntime: AudioRuntimePort = {
	createAudioContext: () => new AudioContext({ latencyHint: "interactive" }),
	createAnalyzerWorker: () => new AnalyzerWorker(),
	createWaveformRendererWorker: () => new RendererWorker(),
	createSpectrogramWorker: () => new SpectrogramWorkerConstructor(),
	audioEngineAssets: {
		workerUrl: DecoderWorkerUrl,
		workletUrl: AudioWorkletUrl,
		ffmpegWasmUrl,
		soundtouchWasmUrl,
	},
	analyzerWasmUrl: ffmpegWasmUrl,
};
