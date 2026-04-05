import type { AudioProvider, AudioProviderOptions, AudioLoadResult, AudioSourceInfo } from "./audio-provider";
import { fetchAudioFileContent } from "$/modules/review/services/lyrics-site-service";
import { lyricsSiteTokenAtom } from "$/modules/settings/states";
import { globalStore } from "$/states/store";
import { audioEngine } from "$/modules/audio/audio-engine";

export type LyricsSiteAudioProviderConfig = {
	audioFileName?: string;
	audioTitle?: string;
};

export const createLyricsSiteAudioProvider = (config: LyricsSiteAudioProviderConfig): AudioProvider => {
	const { audioFileName, audioTitle } = config;

	return {
		type: "lyrics-site",
		name: "用户上传音频",
		isAvailable: async () => {
			const token = globalStore.get(lyricsSiteTokenAtom)?.trim();
			return !!audioFileName && !!token;
		},
		loadAudio: async (options: AudioProviderOptions): Promise<AudioLoadResult> => {
			const token = globalStore.get(lyricsSiteTokenAtom)?.trim();

			if (!token) {
				options.pushNotification({
					title: "请先登录歌词站",
					level: "error",
					source: "review",
				});
				return { success: false, error: "未登录歌词站" };
			}

			if (!audioFileName) {
				options.pushNotification({
					title: "没有用户上传的音频",
					level: "warning",
					source: "review",
				});
				return { success: false, error: "没有用户上传的音频" };
			}

			try {
				const audioBlob = await fetchAudioFileContent(token, audioFileName);
				if (!audioBlob) {
					throw new Error("无法获取音频文件");
				}

				const audioFile = new File([audioBlob], audioFileName, {
					type: audioBlob.type || "audio/*",
				});

				await audioEngine.loadMusic(audioFile);

				options.pushNotification({
					title: `已加载用户上传音频：${audioTitle || audioFileName}`,
					level: "success",
					source: "audio",
				});

				return { success: true };
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : "未知错误";
				options.pushNotification({
					title: `加载用户上传音频失败：${errorMsg}`,
					level: "error",
					source: "audio",
				});
				return { success: false, error: errorMsg };
			}
		},
	};
};

export const getLyricsSiteAudioSourceInfo = async (audioFileName?: string, audioTitle?: string): Promise<AudioSourceInfo> => {
	const token = globalStore.get(lyricsSiteTokenAtom)?.trim();
	const available = !!audioFileName && !!token;

	return {
		type: "lyrics-site",
		name: "用户上传音频",
		available,
		description: available ? (audioTitle || audioFileName || "未知") : "无音频或未登录",
	};
};
