import { forceInvokeKeyBindingAtom } from "$/utils/keybindings";
import { keySyncNextAtom } from "$/states/keybindings";
import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("$/modules/audio/audio-engine", () => ({
	audioEngine: {
		musicLoaded: true,
		musicCurrentTime: 2,
		ctxCurrentTime: 10,
		ctxOutputLatency: 0.05,
		onTimeUpdate: vi.fn(),
		offTimeUpdate: vi.fn(),
	},
}));
import { globalStore } from "$/states/store";
import {
	bpmStateAtom,
	analyzedBpmStateAtom,
	bpmSidebarViewAtom,
	bpmTapModeAtom,
	loadedAudioAtom,
} from "$/modules/audio/states";
import { syncJudgeModeAtom, SyncJudgeMode } from "$/modules/settings/states";
import {
	connectHostBpm,
	tapHostBpm,
	setHostBpmTapMode,
	getHostBpmState,
	applyHostBpmCalibration,
	resetHostBpm,
	setHostBpmScale,
	subscribeHostAudioChanges,
} from "$/modules/audio/adapters/plugin-audio";
import { audioEngine } from "$/modules/audio/audio-engine";
describe("audio and BPM bridge", () => {
	beforeEach(() => {
		globalStore.set(bpmStateAtom, { status: "idle" });
		globalStore.set(analyzedBpmStateAtom, { status: "idle" });
	});
	it("retains latency compensation, refuses competing providers, releases input and survives reconnect", () => {
		const tap = vi.fn();
		const release = connectHostBpm("p.panel", tap);
		expect(() => connectHostBpm("other.panel", vi.fn())).toThrow();
		setHostBpmTapMode("key");
		globalStore.set(syncJudgeModeAtom, SyncJudgeMode.FirstKeyDownTime);
		tapHostBpm(undefined, 100);
		expect(tap.mock.calls.at(-1)?.[0]).toBeCloseTo(9.95);
		globalStore.set(syncJudgeModeAtom, SyncJudgeMode.MiddleKeyTime);
		tapHostBpm(undefined, 100);
		expect(tap).toHaveBeenLastCalledWith(10);
		tapHostBpm(1.5);
		expect(tap).toHaveBeenLastCalledWith(1.5);
		globalStore.set(loadedAudioAtom, new Blob(["new"]));
		expect(globalStore.get(bpmTapModeAtom)).toBe("off");
		release();
		release();
		expect(globalStore.get(bpmSidebarViewAtom)).toBeNull();
		tapHostBpm(2);
		expect(tap).toHaveBeenCalledTimes(3);
		connectHostBpm("p.panel", tap)();
	});
	it("validates calibration, clones snapshots and resets the original analysis", () => {
		const result = {
			bpm: 120,
			baseBpm: 120,
			anchorTick: 0,
			confidence: 1,
			ticks: [0, 0.5],
		};
		globalStore.set(analyzedBpmStateAtom, {
			status: "completed",
			result: { ...result, bpm: 100 },
			calculationTime: 20,
		});
		applyHostBpmCalibration(result);
		result.ticks.push(9);
		const snapshot = getHostBpmState();
		if (snapshot.status !== "completed") throw Error();
		snapshot.ticks.push(11);
		expect(getHostBpmState()).toMatchObject({
			ticks: [0, 0.5],
			calculationTimeMs: 0,
		});
		expect(() =>
			applyHostBpmCalibration({ ...result, bpm: Infinity }),
		).toThrow();
		expect(() => setHostBpmScale(0)).toThrow();
		expect(() => tapHostBpm(NaN)).toThrow();
		resetHostBpm();
		expect(getHostBpmState()).toMatchObject({
			bpm: 100,
			calculationTimeMs: 20,
			scale: 1,
		});
	});
	it("removes the audio time listener", () => {
		const release = subscribeHostAudioChanges(vi.fn());
		expect(audioEngine.onTimeUpdate).toHaveBeenCalled();
		release();
		expect(audioEngine.offTimeUpdate).toHaveBeenCalledWith(
			vi.mocked(audioEngine.onTimeUpdate).mock.calls[0][0],
		);
	});
});

it("does not consume the user shortcut outside key calibration and releases it on disconnect", () => {
	const tap = vi.fn();
	const release = connectHostBpm("p.panel", tap);
	const event = {
		preventDefault: vi.fn(),
		stopPropagation: vi.fn(),
		stopImmediatePropagation: vi.fn(),
	} as unknown as MouseEvent;
	forceInvokeKeyBindingAtom(globalStore, keySyncNextAtom, event);
	expect(event.preventDefault).not.toHaveBeenCalled();
	setHostBpmTapMode("key");
	forceInvokeKeyBindingAtom(globalStore, keySyncNextAtom, event);
	expect(tap).toHaveBeenCalledTimes(1);
	release();
	forceInvokeKeyBindingAtom(globalStore, keySyncNextAtom, event);
	expect(tap).toHaveBeenCalledTimes(1);
	expect(event.preventDefault).toHaveBeenCalledTimes(1);
});
