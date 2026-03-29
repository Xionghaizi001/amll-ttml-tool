/*
 * Copyright 2023-2025 Steve Xiao (stevexmh@qq.com) and contributors.
 *
 * 本源代码文件是属于 AMLL TTML Tool 项目的一部分。
 * This source code file is a part of AMLL TTML Tool project.
 * 本项目的源代码的使用受到 GNU GENERAL PUBLIC LICENSE version 3 许可证的约束，具体可以参阅以下链接。
 * Use of this source code is governed by the GNU GPLv3 license that can be found through the following link.
 *
 * https://github.com/Steve-xmh/amll-ttml-tool/blob/main/LICENSE
 */

import { log, error } from "$/utils/logging";

const DB_NAME = "AMLLRawLyricsIndexDB";
const DB_VERSION = 1;

// 存储对象名称
const STORE_NAMES = {
	APPLE_MUSIC: "appleMusicId",
	NCM: "ncmMusicId",
	QQ_MUSIC: "qqMusicId",
	SPOTIFY: "spotifyId",
} as const;

interface RawLyricIndexEntry {
	metadata: [string, string[]][];
	rawLyricFile: string;
}

// 打开数据库
function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;

			// 创建存储对象
			if (!db.objectStoreNames.contains(STORE_NAMES.APPLE_MUSIC)) {
				db.createObjectStore(STORE_NAMES.APPLE_MUSIC, { keyPath: "id" });
			}
			if (!db.objectStoreNames.contains(STORE_NAMES.NCM)) {
				db.createObjectStore(STORE_NAMES.NCM, { keyPath: "id" });
			}
			if (!db.objectStoreNames.contains(STORE_NAMES.QQ_MUSIC)) {
				db.createObjectStore(STORE_NAMES.QQ_MUSIC, { keyPath: "id" });
			}
			if (!db.objectStoreNames.contains(STORE_NAMES.SPOTIFY)) {
				db.createObjectStore(STORE_NAMES.SPOTIFY, { keyPath: "id" });
			}
		};
	});
}

// 清空所有存储
async function clearAllStores(db: IDBDatabase): Promise<void> {
	const storeNames = [
		STORE_NAMES.APPLE_MUSIC,
		STORE_NAMES.NCM,
		STORE_NAMES.QQ_MUSIC,
		STORE_NAMES.SPOTIFY,
	];

	for (const storeName of storeNames) {
		const transaction = db.transaction(storeName, "readwrite");
		const store = transaction.objectStore(storeName);
		await new Promise<void>((resolve, reject) => {
			const request = store.clear();
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}
}

// 添加条目到存储
async function addToStore(
	db: IDBDatabase,
	storeName: string,
	id: string,
	entry: RawLyricIndexEntry,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(storeName, "readwrite");
		const store = transaction.objectStore(storeName);
		const request = store.put({ id, entry });

		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

// 检查 ID 是否存在
async function checkIdExists(
	db: IDBDatabase,
	storeName: string,
	id: string,
): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(storeName, "readonly");
		const store = transaction.objectStore(storeName);
		const request = store.get(id);

		request.onsuccess = () => resolve(!!request.result);
		request.onerror = () => reject(request.error);
	});
}

// 解析 metadata 获取指定 key 的值
// 支持两种格式：TTMLMetadata[] {key, value} 或 [string, string[]][] 元组
function getMetadataValue(
	metadata: Array<{ key: string; value: string[] } | [string, string[]]>,
	key: string,
): string[] {
	const entry = metadata.find((item) => {
		if (Array.isArray(item)) {
			return item[0] === key;
		}
		return item.key === key;
	});
	if (!entry) return [];
	if (Array.isArray(entry)) {
		return entry[1];
	}
	return entry.value;
}

// 从 URL 获取并更新索引
export async function fetchAndUpdateRawLyricsIndex(): Promise<boolean> {
	try {
		log("Fetching raw lyrics index from remote...");
		const response = await fetch(
			"https://amlldb.bikonoo.com/metadata/raw-lyrics-index.jsonl",
		);

		if (!response.ok) {
			error(
				`Failed to fetch raw lyrics index: ${response.status} ${response.statusText}`,
			);
			return false;
		}

		const text = await response.text();
		const lines = text.trim().split("\n");

		const db = await openDB();

		// 清空现有数据
		await clearAllStores(db);

		// 解析并存储数据
		for (const line of lines) {
			if (!line.trim()) continue;

			try {
				const entry: RawLyricIndexEntry = JSON.parse(line);

				// 获取各种 ID
				const appleMusicIds = getMetadataValue(entry.metadata, "appleMusicId");
				const ncmMusicIds = getMetadataValue(entry.metadata, "ncmMusicId");
				const qqMusicIds = getMetadataValue(entry.metadata, "qqMusicId");
				const spotifyIds = getMetadataValue(entry.metadata, "spotifyId");

				// 存储到对应的存储对象
				for (const id of appleMusicIds) {
					await addToStore(db, STORE_NAMES.APPLE_MUSIC, id, entry);
				}
				for (const id of ncmMusicIds) {
					await addToStore(db, STORE_NAMES.NCM, id, entry);
				}
				for (const id of qqMusicIds) {
					await addToStore(db, STORE_NAMES.QQ_MUSIC, id, entry);
				}
				for (const id of spotifyIds) {
					await addToStore(db, STORE_NAMES.SPOTIFY, id, entry);
				}
			} catch (e) {
				error("Failed to parse raw lyrics index entry:", e);
			}
		}

		log(`Successfully updated raw lyrics index with ${lines.length} entries`);
		return true;
	} catch (e) {
		error("Failed to fetch and update raw lyrics index:", e);
		return false;
	}
}

// 检查歌曲 ID 是否已存在
export async function checkSongIdsExist(
	metadata: Array<{ key: string; value: string[] } | [string, string[]]>,
): Promise<{
	exists: boolean;
	existingIds: { type: string; id: string }[];
}> {
	const existingIds: { type: string; id: string }[] = [];

	try {
		const db = await openDB();

		// 获取各种 ID
		const appleMusicIds = getMetadataValue(metadata, "appleMusicId");
		const ncmMusicIds = getMetadataValue(metadata, "ncmMusicId");
		const qqMusicIds = getMetadataValue(metadata, "qqMusicId");
		const spotifyIds = getMetadataValue(metadata, "spotifyId");

		// 检查每个 ID
		for (const id of appleMusicIds) {
			if (await checkIdExists(db, STORE_NAMES.APPLE_MUSIC, id)) {
				existingIds.push({ type: "Apple Music", id });
			}
		}
		for (const id of ncmMusicIds) {
			if (await checkIdExists(db, STORE_NAMES.NCM, id)) {
				existingIds.push({ type: "网易云音乐", id });
			}
		}
		for (const id of qqMusicIds) {
			if (await checkIdExists(db, STORE_NAMES.QQ_MUSIC, id)) {
				existingIds.push({ type: "QQ音乐", id });
			}
		}
		for (const id of spotifyIds) {
			if (await checkIdExists(db, STORE_NAMES.SPOTIFY, id)) {
				existingIds.push({ type: "Spotify", id });
			}
		}
	} catch (e) {
		error("Failed to check song IDs:", e);
	}

	return {
		exists: existingIds.length > 0,
		existingIds,
	};
}
