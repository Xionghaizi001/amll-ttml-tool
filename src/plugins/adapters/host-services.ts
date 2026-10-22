import type { EditSource, PluginSelectionV0 } from "@amll-ttml-tool/plugin-api";
import type { TrustedJsAudioStateV0, TrustedJsBpmStateV0, TrustedJsProjectInfoV0 } from "@amll-ttml-tool/plugin-sdk-js";
import type { DocumentChangeSource } from "$/kernel/editor/EditorDocumentService";
import { IndexedDbPluginKvStorage } from "$/platform/storage/IndexedDbPluginKvStorage";
import {
	projectIdAtom,
	saveFileNameAtom,
	selectedLinesAtom,
	selectedWordsAtom,
} from "$/states/main";
import { pluginNetworkOfflineAtom } from "$/states/plugins";
import { globalStore } from "$/states/store";
import { audioEngine } from "$/modules/audio/audio-engine";
import {
	audioEngineStateAtom,
	bpmFollowPlaybackRateAtom,
	bpmScaleAtom,
	bpmStateAtom,
	currentDurationAtom,
	loadedAudioAtom,
	playbackRateAtom,
	tapTimesAtom,
} from "$/modules/audio/states";
import { showBeatLinesAtom } from "$/modules/spectrogram/states";
import { editorDocumentAdapter } from "./editor-document";
import { PluginDocumentGateway } from "./plugin-document";
import {
	createPluginNetworkPort,
	fetchPluginNetworkTransport,
} from "./plugin-network";

/** Shared document, selection, project, network and KV ports for trusted-js plugins. */

export const pluginDocumentGateway = new PluginDocumentGateway(
	editorDocumentAdapter,
);

export const pluginKvStorage = new IndexedDbPluginKvStorage();

export const toEditSource = (source: DocumentChangeSource): EditSource => {
	switch (source) {
		case "plugin":
			return "plugin";
		case "system":
			return "host";
		default:
			return "user";
	}
};

export const getHostSelection = (): PluginSelectionV0 => ({
	lineIds: [...globalStore.get(selectedLinesAtom)],
	wordIds: [...globalStore.get(selectedWordsAtom)],
});

export interface HostDocumentChange {
	revision: number;
	source: EditSource;
	changedLineIds: string[];
	changedWordIds: string[];
	sourcePluginId?: string;
}

/** Document transactions as protocol-shaped change records, any tier. */
export const subscribeHostDocumentChanges = (
	listener: (change: HostDocumentChange) => void,
): (() => void) =>
	editorDocumentAdapter.service.subscribe((event) => {
		listener({
			revision: event.revision,
			source: toEditSource(event.transaction.source),
			changedLineIds: [...event.changedLineIds],
			changedWordIds: [...event.changedWordIds],
			...(event.transaction.pluginId === undefined
				? {}
				: { sourcePluginId: event.transaction.pluginId }),
		});
	});

/** Selection changes as protocol selections, for `selection.onChanged`. */
export const subscribeHostSelectionChanges = (
	listener: (selection: PluginSelectionV0) => void,
): (() => void) => {
	const notify = () => listener(getHostSelection());
	const unsubscribeLines = globalStore.sub(selectedLinesAtom, notify);
	const unsubscribeWords = globalStore.sub(selectedWordsAtom, notify);
	return () => {
		unsubscribeLines();
		unsubscribeWords();
	};
};

/** Read-only project identity exposed as `project.getInfo()`. */
export const getHostProjectInfo = (): TrustedJsProjectInfoV0 => ({
	projectId: globalStore.get(projectIdAtom),
	fileName: globalStore.get(saveFileNameAtom),
});

export const getHostAudioState = (): TrustedJsAudioStateV0 => ({
	engineState: globalStore.get(audioEngineStateAtom) as TrustedJsAudioStateV0["engineState"],
	loaded: globalStore.get(loadedAudioAtom).size > 0,
	durationMs: globalStore.get(currentDurationAtom),
	currentTimeMs: audioEngine.musicCurrentTime * 1000,
	playbackRate: globalStore.get(playbackRateAtom),
});

export const subscribeHostAudioChanges = (listener: (state: TrustedJsAudioStateV0) => void): (() => void) => {
	const notify = () => listener(getHostAudioState());
	const unsubs = [
		globalStore.sub(audioEngineStateAtom, notify),
		globalStore.sub(currentDurationAtom, notify),
		globalStore.sub(playbackRateAtom, notify),
		globalStore.sub(loadedAudioAtom, notify),
	];
	audioEngine.addEventListener("timeupdate", notify);
	return () => {
		for (const unsubscribe of unsubs) unsubscribe();
		audioEngine.removeEventListener("timeupdate", notify);
	};
};

const getBpmState = (): TrustedJsBpmStateV0 => {
	const state = globalStore.get(bpmStateAtom);
	const common = {
		scale: globalStore.get(bpmScaleAtom),
		followPlaybackRate: globalStore.get(bpmFollowPlaybackRateAtom),
		showBeatLines: globalStore.get(showBeatLinesAtom),
	};
	if (state.status === "completed") return { status: "completed", ...state.result, calculationTimeMs: state.calculationTime, ...common };
	return { status: state.status, ...("error" in state ? { error: state.error } : {}), ...common } as TrustedJsBpmStateV0;
};

export const getHostBpmState = getBpmState;
export const subscribeHostBpmChanges = (listener: (state: TrustedJsBpmStateV0) => void): (() => void) => {
	const notify = () => listener(getBpmState());
	const unsubs = [
		globalStore.sub(bpmStateAtom, notify),
		globalStore.sub(bpmScaleAtom, notify),
		globalStore.sub(bpmFollowPlaybackRateAtom, notify),
		globalStore.sub(showBeatLinesAtom, notify),
	];
	return () => unsubs.forEach((unsubscribe) => unsubscribe());
};

export const setHostBpmScale = (scale: number): void => {
	if (!Number.isFinite(scale) || scale <= 0) throw new Error("BPM scale must be positive");
	globalStore.set(bpmScaleAtom, scale);
};
export const setHostBpmFollowPlaybackRate = (value: boolean): void => globalStore.set(bpmFollowPlaybackRateAtom, value);
export const setHostShowBeatLines = (value: boolean): void => globalStore.set(showBeatLinesAtom, value);
export const tapHostBpm = (timeSeconds = audioEngine.musicCurrentTime): void => {
	const next = [...globalStore.get(tapTimesAtom), timeSeconds].slice(-10);
	globalStore.set(tapTimesAtom, next);
	if (next.length < 2) return;
	const bpm = 60 / ((next[next.length - 1] - next[0]) / (next.length - 1));
	if (bpm >= 20 && bpm <= 400) {
		globalStore.set(bpmStateAtom, {
			status: "completed",
			result: { bpm: Math.round(bpm), baseBpm: Math.round(bpm), anchorTick: next[0], confidence: 1, ticks: [] },
			calculationTime: 0,
		});
		globalStore.set(bpmScaleAtom, 1);
	}
};
export const resetHostBpm = (): void => {
	globalStore.set(bpmScaleAtom, 1);
	globalStore.set(tapTimesAtom, []);
};

/**
 * The plugin network port, shared by every tier that gets a network surface
 * (trusted-js today). One port means one URL/header policy, one offline
 * switch and one "no credentials" transport for all plugins.
 */
export const pluginNetworkPort = createPluginNetworkPort({
	transport: fetchPluginNetworkTransport,
	isOffline: () => globalStore.get(pluginNetworkOfflineAtom),
	log: (pluginId, message) =>
		console.warn(`[plugins] network ${pluginId}: ${message}`),
});
