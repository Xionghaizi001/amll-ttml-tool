import { openDB } from "idb";
import type { Dispatch, SetStateAction } from "react";
import type { AppNotification } from "$/states/notifications";
import { requestNetease } from "./index";
import { audioProxyUrlAtom, neteaseCookieAtom } from "$/modules/settings/states";
import { globalStore } from "$/states/store";
import { audioEngine } from "$/modules/audio/audio-engine";

const AUDIO_CACHE_DB = "amll-audio-cache";
const AUDIO_CACHE_STORE = "audio-files";
const AUDIO_CACHE_KEY = "last-audio";

type AudioCacheRecord = {
	key: string;
	file: Blob;
	name: string;
	type: string;
	updatedAt: number;
	sourceId?: string;
};

type RawNeteaseSong = {
	id: number;
	name: string;
	ar: { id: number; name: string }[];
	al: { id: number; name: string; picUrl: string };
	dt: number;
	fee: number;
};

type NeteaseSongDetail = {
	id: number;
	name: string;
	artists: { id: number; name: string }[];
	album: { id: number; name: string; picUrl: string };
	duration: number;
	fee: number;
};

const audioCacheDbPromise = openDB(AUDIO_CACHE_DB, 1, {
	upgrade(db) {
		if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
			db.createObjectStore(AUDIO_CACHE_STORE, { keyPath: "key" });
		}
	},
});

const writeAudioCache = async (file: File, key: string, sourceId?: string) => {
	try {
		const db = await audioCacheDbPromise;
		const payload: AudioCacheRecord = {
			key,
			file,
			name: file.name,
			type: file.type,
			updatedAt: Date.now(),
			sourceId,
		};
		await db.put(AUDIO_CACHE_STORE, payload);
	} catch {}
};

const isImageContentType = (value: string | null) =>
	(value ?? "").toLowerCase().startsWith("image/");

const readAudioCache = async (id: string) => {
	try {
		const db = await audioCacheDbPromise;
		const idKey = `netease-${id}`;
		const idRecord = (await db.get(AUDIO_CACHE_STORE, idKey)) as
			| AudioCacheRecord
			| undefined;
		const lastRecord = idRecord
			? undefined
			: ((await db.get(AUDIO_CACHE_STORE, AUDIO_CACHE_KEY)) as
					| AudioCacheRecord
					| undefined);
		const record = idRecord ?? lastRecord;
		if (!record) return null;
		if (isImageContentType(record.type)) return null;
		if (record.key !== idKey && record.sourceId !== id) return null;
		const fileName = record.name || `netease-${id}.mp3`;
		const fileType = record.type || record.file.type || "audio/*";
		return new File([record.file], fileName, { type: fileType });
	} catch {
		return null;
	}
};


const fetchNeteaseSongDetail = async (id: string, cookie?: string) => {
	const res = await requestNetease<{ songs?: RawNeteaseSong[] }>("/song/detail", {
		params: { ids: id },
		cookie,
	});
	const song = res.songs?.[0];
	if (!song) return null;
	return {
		id: song.id,
		name: song.name,
		artists: song.ar.map((artist) => ({
			id: artist.id,
			name: artist.name,
		})),
		album: {
			id: song.al.id,
			name: song.al.name,
			picUrl: song.al.picUrl,
		},
		duration: song.dt,
		fee: song.fee,
	};
};

const fetchNeteaseAudioUrl = async (id: string, cookie?: string) => {
	const res = await requestNetease<{
		data: { url: string | null; size: number; code: number }[];
	}>("/song/url/v1", {
		params: { id, level: "lossless" },
		cookie,
	});
	const originUrl = res.data?.[0]?.url ?? null;
	return originUrl ? originUrl.replace(/^http:/, "https:") : null;
};

const sanitizeFileName = (value: string) => {
	const sanitized = value.replace(/[\\/:*?"<>|]+/g, "_").trim();
	return sanitized.length > 0 ? sanitized : "netease-audio";
};

const resolveAudioExtension = (contentType: string | null) => {
	const type = contentType?.toLowerCase() ?? "";
	if (type.includes("audio/mpeg")) return "mp3";
	if (type.includes("audio/flac")) return "flac";
	if (type.includes("audio/wav")) return "wav";
	if (type.includes("audio/ogg")) return "ogg";
	if (type.includes("audio/mp4") || type.includes("audio/aac")) return "m4a";
	return "mp3";
};

const buildAudioFileName = (
	detail: NeteaseSongDetail | null,
	fallbackId: string,
	contentType: string | null,
) => {
	const artistText = detail?.artists?.map((artist) => artist.name).join(", ");
	const baseName =
		detail && artistText
			? `${artistText} - ${detail.name}`
			: detail?.name || `netease-${fallbackId}`;
	const ext = resolveAudioExtension(contentType);
	return `${sanitizeFileName(baseName)}.${ext}`;
};

export const getNeteaseAudioUrl = async (
	id: string,
	cookie?: string,
): Promise<string | null> => {
	const audioUrl = await fetchNeteaseAudioUrl(id, cookie);
	if (!audioUrl) return null;
	
	const proxyBase = globalStore.get(audioProxyUrlAtom)?.trim();
	return proxyBase
		? `${proxyBase}/?url=${encodeURIComponent(audioUrl)}`
		: audioUrl;
};

export const cacheNeteaseAudioToIndexedDb = async (
	id: string,
	cookie?: string,
) => {
	const cached = await readAudioCache(id);
	if (cached) return cached;
	const [detail, audioUrl] = await Promise.all([
		fetchNeteaseSongDetail(id, cookie).catch(() => null),
		fetchNeteaseAudioUrl(id, cookie),
	]);
	if (!audioUrl) {
		throw new Error("找不到音频 URL，可能需要 VIP？");
	}
	const proxyBase = globalStore.get(audioProxyUrlAtom)?.trim();
	const fetchUrl = proxyBase
		? `${proxyBase}/?url=${encodeURIComponent(audioUrl)}`
		: audioUrl;
	
	let response: Response;
	try {
		response = await fetch(fetchUrl, {
			mode: 'cors',
			cache: 'no-cache',
		});
	} catch (fetchError) {
		throw new Error(`网络请求失败: ${fetchError instanceof Error ? fetchError.message : '未知错误'}`);
	}
	
	if (!response.ok) {
		throw new Error(`音频下载失败：${response.status}`);
	}
	
	let blob: Blob;
	try {
		blob = await response.blob();
	} catch (blobError) {
		throw new Error(`读取响应失败: ${blobError instanceof Error ? blobError.message : '未知错误'}`);
	}
	const responseType = response.headers.get("content-type");
	const contentType = blob.type || responseType;
	if (isImageContentType(contentType) || isImageContentType(responseType)) {
		return null;
	}
	const fileName = buildAudioFileName(detail, id, contentType);
	const file = new File([blob], fileName, {
		type: contentType || "audio/*",
	});
	await Promise.all([
		writeAudioCache(file, `netease-${id}`, id),
		writeAudioCache(file, AUDIO_CACHE_KEY, id),
	]);
	return file;
};

export const loadNeteaseAudio = async (options: {
	prNumber: number;
	id: string;
	pendingId: string | null;
	setPendingId: (value: string | null) => void;
	setLastNeteaseIdByPr: Dispatch<SetStateAction<Record<number, string>>>;
	openFile: (file: File) => void;
	pushNotification: (
		payload: Omit<AppNotification, "id" | "createdAt">,
	) => void;
	cookie: string;
}) => {
	if (!options.id) return;
	if (options.pendingId) return;
	options.setPendingId(options.id);
	options.setLastNeteaseIdByPr((prev) => ({
		...prev,
		[options.prNumber]: options.id,
	}));
	try {
		const trimmedCookie = options.cookie.trim();
		const cached = await readAudioCache(options.id);
		if (cached) {
			options.openFile(cached);
			options.pushNotification({
				title: `已从缓存加载音频：${cached.name}`,
				level: "success",
				source: "audio",
			});
			return;
		}

		const audioUrl = await getNeteaseAudioUrl(
			options.id,
			trimmedCookie.length > 0 ? trimmedCookie : undefined,
		);
		if (!audioUrl) {
			throw new Error("找不到音频 URL，可能需要 VIP？");
		}

		await audioEngine.loadMusicFromUrl(audioUrl);
		options.pushNotification({
			title: `已加载音频`,
			level: "success",
			source: "audio",
		});
	} catch (error) {
		options.pushNotification({
			title: `加载音频失败：${
				error instanceof Error ? error.message : "未知错误"
			}`,
			level: "error",
			source: "audio",
		});
	} finally {
		options.setPendingId(null);
	}
};

export const getNeteaseAudioSourceInfo = async (ncmIds: string[]) => {
	const cookie = globalStore.get(neteaseCookieAtom)?.trim();
	const available = ncmIds.length > 0 && !!cookie;

	return {
		type: "netease" as const,
		name: "网易云音乐",
		available,
		description: available ? `共 ${ncmIds.length} 个 ID` : "未登录或无 ID",
	};
};
