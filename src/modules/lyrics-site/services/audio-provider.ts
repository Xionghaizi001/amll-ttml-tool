import { getAudioFileUrl } from "../index";
import { lyricsSiteTokenAtom, audioProxyUrlAtom } from "$/modules/settings/states";
import { globalStore } from "$/states/store";
import type { AppNotification } from "$/states/notifications";
import { audioEngine } from "$/modules/audio/audio-engine";

export const getLyricsSiteAudioSourceInfo = async (audioFileName?: string, audioTitle?: string) => {
	const token = globalStore.get(lyricsSiteTokenAtom)?.trim();
	const available = !!audioFileName && !!token;

	return {
		type: "lyrics-site" as const,
		name: "用户上传音频",
		available,
		description: available ? (audioTitle || audioFileName || "未知") : "无音频或未登录",
	};
};

export const loadLyricsSiteAudio = async (options: {
	audioFileName?: string;
	audioTitle?: string;
	openFile: (file: File) => void;
	pushNotification: (payload: Omit<AppNotification, "id" | "createdAt">) => void;
}) => {
	const { audioFileName, audioTitle, openFile, pushNotification } = options;
	const token = globalStore.get(lyricsSiteTokenAtom)?.trim();

	if (!token) {
		pushNotification({
			title: "请先登录歌词站",
			level: "error",
			source: "review",
		});
		return { success: false, error: "未登录歌词站" };
	}

	if (!audioFileName) {
		pushNotification({
			title: "没有用户上传的音频",
			level: "warning",
			source: "review",
		});
		return { success: false, error: "没有用户上传的音频" };
	}

	try {
		const audioUrl = getAudioFileUrl(audioFileName);
		const proxyBase = globalStore.get(audioProxyUrlAtom)?.trim();
		const fetchUrl = proxyBase
			? `${proxyBase}/?url=${encodeURIComponent(audioUrl)}`
			: audioUrl;

		pushNotification({
			title: `正在加载用户上传音频：${audioTitle || audioFileName}`,
			level: "info",
			source: "audio",
		});

		const response = await fetch(fetchUrl, { mode: "cors" });
		if (!response.ok) {
			throw new Error(`下载失败：${response.status}`);
		}
		const blob = await response.blob();
		const fileName = audioFileName.split("/").pop() ?? audioFileName;
		const file = new File([blob], fileName, { type: blob.type || "audio/*" });

		openFile(file);

		await new Promise<void>((resolve) => {
			audioEngine.addEventListener("music-load", () => resolve(), { once: true });
			audioEngine.addEventListener("music-load-error", () => resolve(), { once: true });
		});

		pushNotification({
			title: `已加载用户上传音频：${audioTitle || fileName}`,
			level: "success",
			source: "audio",
		});

		return { success: true };
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : "未知错误";
		pushNotification({
			title: `加载用户上传音频失败：${errorMsg}`,
			level: "error",
			source: "audio",
		});
		return { success: false, error: errorMsg };
	}
};
