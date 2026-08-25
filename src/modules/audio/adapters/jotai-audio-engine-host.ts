import type { AudioEngineHostPort } from "$/modules/audio/ports/audio-engine-host";
import {
	audioEngineStateAtom,
	audioErrorAtom,
	audioPlayingAtom,
	currentDurationAtom,
	isAuditioningAtom,
	loadedAudioAtom,
	stretchAlgorithmAtom,
} from "$/modules/audio/states";
import { globalStore } from "$/states/store";

export const jotaiAudioEngineHost: AudioEngineHostPort = {
	getStretchAlgorithm: () => globalStore.get(stretchAlgorithmAtom),
	subscribeStretchAlgorithm(listener) {
		return globalStore.sub(stretchAlgorithmAtom, () => {
			listener(globalStore.get(stretchAlgorithmAtom));
		});
	},
	getIsAuditioning: () => globalStore.get(isAuditioningAtom),
	setIsAuditioning: (value) => globalStore.set(isAuditioningAtom, value),
	setPlaying: (value) => globalStore.set(audioPlayingAtom, value),
	setEngineState: (value) => globalStore.set(audioEngineStateAtom, value),
	setDuration: (value) => globalStore.set(currentDurationAtom, value),
	setError: (value) => globalStore.set(audioErrorAtom, value),
	setLoadedAudio: (value) => globalStore.set(loadedAudioAtom, value),
};
