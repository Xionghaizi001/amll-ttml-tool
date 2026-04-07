import type { AppNotification } from "$/states/notifications";

export type AudioSourceType = "netease" | "lyrics-site";

export type AudioLoadResult = {
	success: boolean;
	error?: string;
};

export type AudioProviderOptions = {
	pushNotification: (payload: Omit<AppNotification, "id" | "createdAt">) => void;
};

export type AudioProvider = {
	type: AudioSourceType;
	name: string;
	isAvailable: () => Promise<boolean> | boolean;
	loadAudio: (options: AudioProviderOptions) => Promise<AudioLoadResult>;
};

export type AudioSourceInfo = {
	type: AudioSourceType;
	name: string;
	available: boolean;
	description?: string;
};
