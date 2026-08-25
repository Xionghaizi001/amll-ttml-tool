import type { EngineConfig } from "$/modules/ffmpeg/types";
import type { SpectrogramWorker } from "$/modules/spectrogram/workers/types";

/**
 * Browser audio/worker primitives injected into runtime consumers.
 * Worker constructors and bundler resource URLs belong to the platform adapter.
 */
export interface AudioRuntimePort {
	createAudioContext(): AudioContext;
	createAnalyzerWorker(): Worker;
	createWaveformRendererWorker(): Worker;
	createSpectrogramWorker(): SpectrogramWorker;
	readonly audioEngineAssets: EngineConfig["assets"];
	readonly analyzerWasmUrl: string;
}
