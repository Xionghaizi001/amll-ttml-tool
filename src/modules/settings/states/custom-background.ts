import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { browserKeyValueStorage } from "$/platform/storage/BrowserKeyValueStorage";
import { customBackgroundResource } from "../adapters/custom-background-resource";

const settingsStorage = createJSONStorage<number>(() => browserKeyValueStorage);

const customBackgroundImageValueAtom = atom<string | null>(null);

export const customBackgroundImageAtom = atom(
	(get) => get(customBackgroundImageValueAtom),
	async (_get, set, next: File | Blob | null) => {
		set(
			customBackgroundImageValueAtom,
			await customBackgroundResource.set(next),
		);
	},
);

export const customBackgroundImageInitAtom = atom(null, async (_get, set) => {
	set(
		customBackgroundImageValueAtom,
		await customBackgroundResource.initialize(),
	);
});

export const customBackgroundImageDisposeAtom = atom(null, (_get, set) => {
	customBackgroundResource.dispose();
	set(customBackgroundImageValueAtom, null);
});

export const customBackgroundOpacityAtom = atomWithStorage(
	"customBackgroundOpacity",
	0.4,
	settingsStorage,
);

export const customBackgroundMaskAtom = atomWithStorage(
	"customBackgroundMask",
	0.2,
	settingsStorage,
);

export const customBackgroundBlurAtom = atomWithStorage(
	"customBackgroundBlur",
	0,
	settingsStorage,
);

export const customBackgroundBrightnessAtom = atomWithStorage(
	"customBackgroundBrightness",
	1,
	settingsStorage,
);
