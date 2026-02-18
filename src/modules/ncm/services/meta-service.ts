import { extractLyricMetadata } from "$/modules/project/utils/metadata-matcher";
import { requestNetease } from "./index";

type RawNeteaseSongMeta = {
	name: string;
	alia?: string[];
	tns?: string[];
	ar?: { name: string }[];
	al?: { name: string };
};

type RawNeteaseLyric = {
	lrc?: { lyric?: string };
};

export type NeteaseSongMeta = {
	name: string;
	aliases: string[];
	translations: string[];
	artists: string[];
	album: string | null;
	lyricMetadata: Record<string, string[]>;
};

const normalizeStringList = (items: unknown): string[] => {
	if (!Array.isArray(items)) return [];
	const result: string[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		if (typeof item !== "string") continue;
		const trimmed = item.trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(trimmed);
	}
	return result;
};

export const fetchNeteaseSongMeta = async (
	id: string,
	cookie?: string,
): Promise<NeteaseSongMeta | null> => {
	const [songRes, lyricRes] = await Promise.all([
		requestNetease<{ songs?: RawNeteaseSongMeta[] }>("/song/detail", {
			params: { ids: id },
			cookie,
		}),
		requestNetease<RawNeteaseLyric>("/lyric/new", {
			params: { id },
			cookie,
		}).catch(() => null),
	]);
	const song = songRes.songs?.[0];
	if (!song) return null;
	const lyricMetadata = extractLyricMetadata(lyricRes?.lrc?.lyric ?? "");
	return {
		name: song.name,
		aliases: normalizeStringList(song.alia),
		translations: normalizeStringList(song.tns),
		artists: normalizeStringList(song.ar?.map((artist) => artist.name)),
		album: song.al?.name ?? null,
		lyricMetadata,
	};
};
