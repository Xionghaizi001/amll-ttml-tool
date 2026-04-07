import type { AudioProvider, AudioProviderOptions, AudioLoadResult, AudioSourceInfo, AudioSourceType } from "./audio-provider";
import type { NeteaseAudioProviderConfig } from "./netease-audio-provider";
import type { LyricsSiteAudioProviderConfig } from "$/modules/lyrics-site";
import { createNeteaseAudioProvider, getNeteaseAudioSourceInfo } from "./netease-audio-provider";
import { createLyricsSiteAudioProvider, getLyricsSiteAudioSourceInfo } from "$/modules/lyrics-site";

export type AudioSelectorConfig = {
	neteaseConfig?: NeteaseAudioProviderConfig;
	lyricsSiteConfig?: LyricsSiteAudioProviderConfig;
};

export type AudioSelectorResult = {
	success: boolean;
	selectedSource?: AudioSourceType;
	error?: string;
};

export const createAudioSelector = (config: AudioSelectorConfig) => {
	const providers: AudioProvider[] = [];

	if (config.lyricsSiteConfig?.audioFileName) {
		providers.push(createLyricsSiteAudioProvider(config.lyricsSiteConfig));
	}

	if (config.neteaseConfig?.ncmIds && config.neteaseConfig.ncmIds.length > 0) {
		providers.push(createNeteaseAudioProvider(config.neteaseConfig));
	}

	const getAvailableProviders = async (): Promise<AudioProvider[]> => {
		const available: AudioProvider[] = [];
		for (const provider of providers) {
			if (await provider.isAvailable()) {
				available.push(provider);
			}
		}
		return available;
	};

	const getAudioSourceInfos = async (): Promise<AudioSourceInfo[]> => {
		const infos: AudioSourceInfo[] = [];

		if (config.lyricsSiteConfig?.audioFileName) {
			const info = await getLyricsSiteAudioSourceInfo(
				config.lyricsSiteConfig.audioFileName,
				config.lyricsSiteConfig.audioTitle,
			);
			infos.push(info);
		}

		if (config.neteaseConfig?.ncmIds && config.neteaseConfig.ncmIds.length > 0) {
			const info = await getNeteaseAudioSourceInfo(config.neteaseConfig.ncmIds);
			infos.push(info);
		}

		return infos;
	};

	const loadFromSource = async (
		sourceType: AudioSourceType,
		options: AudioProviderOptions,
	): Promise<AudioLoadResult> => {
		const provider = providers.find((p) => p.type === sourceType);
		if (!provider) {
			return { success: false, error: `音源 ${sourceType} 不可用` };
		}
		return provider.loadAudio(options);
	};

	const loadFirstAvailable = async (
		options: AudioProviderOptions,
	): Promise<AudioSelectorResult> => {
		const available = await getAvailableProviders();
		
		if (available.length === 0) {
			options.pushNotification({
				title: "没有可用的音源",
				level: "warning",
				source: "review",
			});
			return { success: false, error: "没有可用的音源" };
		}

		for (const provider of available) {
			const result = await provider.loadAudio(options);
			if (result.success) {
				return { success: true, selectedSource: provider.type };
			}
		}

		return { success: false, error: "所有音源加载失败" };
	};

	return {
		providers,
		getAvailableProviders,
		getAudioSourceInfos,
		loadFromSource,
		loadFirstAvailable,
	};
};

export type AudioSelector = ReturnType<typeof createAudioSelector>;
