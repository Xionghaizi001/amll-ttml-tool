import type { EngineState, StretchAlgorithm } from "$/modules/ffmpeg/types";

export interface AudioEngineHostPort {
	getStretchAlgorithm(): StretchAlgorithm;
	subscribeStretchAlgorithm(
		listener: (algorithm: StretchAlgorithm) => void,
	): () => void;
	getIsAuditioning(): boolean;
	setIsAuditioning(value: boolean): void;
	setPlaying(value: boolean): void;
	setEngineState(value: EngineState): void;
	setDuration(value: number): void;
	setError(value: string | null): void;
	setLoadedAudio(value: Blob): void;
}
