import type { AudioProvider, AudioProviderOptions, AudioLoadResult, AudioSourceInfo } from "./audio-provider";
import { loadNeteaseAudio } from "$/modules/ncm/services/audio-service";
import { neteaseCookieAtom } from "$/modules/settings/states";
import { globalStore } from "$/states/store";

export type NeteaseAudioProviderConfig = {
	ncmIds: string[];
	prNumber: number;
	onSelectId?: (ids: string[]) => Promise<string | null>;
};

export const createNeteaseAudioProvider = (config: NeteaseAudioProviderConfig): AudioProvider => {
	const { ncmIds, prNumber, onSelectId } = config;

	return {
		type: "netease",
		name: "网易云音乐",
		isAvailable: async () => {
			const cookie = globalStore.get(neteaseCookieAtom)?.trim();
			return ncmIds.length > 0 && !!cookie;
		},
		loadAudio: async (options: AudioProviderOptions): Promise<AudioLoadResult> => {
			const cookie = globalStore.get(neteaseCookieAtom)?.trim();
			
			if (!cookie) {
				options.pushNotification({
					title: "请先登录网易云音乐",
					level: "error",
					source: "ncm",
				});
				return { success: false, error: "未登录网易云音乐" };
			}

			if (ncmIds.length === 0) {
				options.pushNotification({
					title: "没有可用的网易云音乐 ID",
					level: "warning",
					source: "review",
				});
				return { success: false, error: "没有可用的网易云音乐 ID" };
			}

			let selectedId = ncmIds[0];
			if (ncmIds.length > 1 && onSelectId) {
				const id = await onSelectId(ncmIds);
				if (!id) {
					return { success: false, error: "用户取消选择" };
				}
				selectedId = id;
			}

			try {
				await loadNeteaseAudio({
					prNumber,
					id: selectedId,
					pendingId: null,
					setPendingId: () => {},
					setLastNeteaseIdByPr: () => {},
					openFile: () => {},
					pushNotification: options.pushNotification,
					cookie,
				});
				return { success: true };
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : "未知错误";
				return { success: false, error: errorMsg };
			}
		},
	};
};

export const getNeteaseAudioSourceInfo = async (ncmIds: string[]): Promise<AudioSourceInfo> => {
	const cookie = globalStore.get(neteaseCookieAtom)?.trim();
	const available = ncmIds.length > 0 && !!cookie;

	return {
		type: "netease",
		name: "网易云音乐",
		available,
		description: available ? `共 ${ncmIds.length} 个 ID` : "未登录或无 ID",
	};
};
