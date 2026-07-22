import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { ReviewSession } from "$/states/main";
import type { TTMLLyric } from "$/types/ttml";
import type { ReviewStructuredSnapshot } from "./structured-snapshot";

const DB_NAME = "amll-review-history-db";
const DB_VERSION = 2;

export type ReviewHistoryRecord = {
	id: string;
	prNumber: number;
	prTitle: string;
	fileName: string;
	source: ReviewSession["source"];
	createdAt: number;
	contentHash: string;
	data: TTMLLyric;
	structure: ReviewStructuredSnapshot;
};

interface ReviewHistoryDBSchema extends DBSchema {
	sessions: {
		key: string;
		value: ReviewHistoryRecord;
		indexes: {
			"by-pr": number;
			"by-pr-date": [number, number];
			"by-created-at": number;
			"by-content-hash": string;
		};
	};
}

let dbPromise: Promise<IDBPDatabase<ReviewHistoryDBSchema>> | null = null;

const getDB = () => {
	if (!dbPromise) {
		dbPromise = openDB<ReviewHistoryDBSchema>(DB_NAME, DB_VERSION, {
			upgrade(db, oldVersion, _newVersion, transaction) {
				const store =
					oldVersion < 1
						? db.createObjectStore("sessions", { keyPath: "id" })
						: transaction.objectStore("sessions");
				if (oldVersion < 1) {
					store.createIndex("by-pr", "prNumber");
					store.createIndex("by-pr-date", ["prNumber", "createdAt"]);
					store.createIndex("by-created-at", "createdAt");
				}
				if (oldVersion < 2) {
					store.createIndex("by-content-hash", "contentHash");
				}
			},
		});
	}
	return dbPromise;
};

export const saveReviewHistory = async (
	record: ReviewHistoryRecord,
): Promise<void> => {
	const db = await getDB();
	await db.put("sessions", record);
};

export const getReviewHistory = async (): Promise<ReviewHistoryRecord[]> => {
	const db = await getDB();
	const records = await db.getAllFromIndex("sessions", "by-created-at");
	return records.reverse();
};

export const getReviewHistoryByPr = async (
	prNumber: number,
): Promise<ReviewHistoryRecord[]> => {
	const db = await getDB();
	const range = IDBKeyRange.bound([prNumber, 0], [prNumber, Infinity]);
	const records = await db.getAllFromIndex("sessions", "by-pr-date", range);
	return records.reverse();
};

export const getReviewHistoryByHash = async (
	contentHash: string,
): Promise<ReviewHistoryRecord[]> => {
	const db = await getDB();
	const records = await db.getAllFromIndex(
		"sessions",
		"by-content-hash",
		contentHash.toLowerCase(),
	);
	return records.sort((a, b) => b.createdAt - a.createdAt);
};

export const deleteReviewHistory = async (id: string): Promise<void> => {
	const db = await getDB();
	await db.delete("sessions", id);
};
