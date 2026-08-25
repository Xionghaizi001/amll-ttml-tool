import { type IDBPDatabase, openDB } from "idb";
import type { ResourceStoragePort } from "$/kernel/platform";
import { BrowserDataUrlResourceLoader } from "../resources/BrowserDataUrlResourceLoader";
import { browserKeyValueStorage } from "./BrowserKeyValueStorage";

const DATABASE = "amll-custom-background";
const STORE = "background-image";
const RESOURCE_KEY = "main";
const LEGACY_KEY = "customBackgroundImage";

type CustomBackgroundRecord = {
	key: string;
	blob: Blob;
	updatedAt: number;
};

export class IndexedDbCustomBackgroundStorage
	implements ResourceStoragePort<Blob>
{
	private database?: Promise<IDBPDatabase>;

	constructor(
		private readonly legacyStorage: Storage = browserKeyValueStorage,
		private readonly dataUrlLoader = new BrowserDataUrlResourceLoader(),
	) {}

	async read(): Promise<Blob | null> {
		try {
			const record = (await (
				await this.getDatabase()
			).get(STORE, RESOURCE_KEY)) as CustomBackgroundRecord | undefined;
			if (record?.blob instanceof Blob) return record.blob;
		} catch (error) {
			console.warn("Custom background storage read failed", error);
		}
		return this.migrateLegacyResource();
	}

	async write(blob: Blob | null): Promise<void> {
		try {
			const database = await this.getDatabase();
			if (!blob) {
				await database.delete(STORE, RESOURCE_KEY);
				return;
			}
			await database.put(STORE, {
				key: RESOURCE_KEY,
				blob,
				updatedAt: Date.now(),
			} satisfies CustomBackgroundRecord);
		} catch (error) {
			console.warn("Custom background storage write failed", error);
		}
	}

	private getDatabase(): Promise<IDBPDatabase> {
		// A rejected open must not be cached for the rest of the session; a
		// transient failure (locked db, private mode quirk) should retry on
		// the next call. A terminated connection reopens the same way.
		this.database ??= openDB(DATABASE, 1, {
			upgrade(database) {
				if (!database.objectStoreNames.contains(STORE))
					database.createObjectStore(STORE, { keyPath: "key" });
			},
			terminated: () => {
				this.database = undefined;
			},
		}).catch((error) => {
			this.database = undefined;
			throw error;
		});
		return this.database;
	}

	private async migrateLegacyResource(): Promise<Blob | null> {
		try {
			const raw = this.legacyStorage.getItem(LEGACY_KEY);
			if (!raw) return null;
			const dataUrl = JSON.parse(raw) as unknown;
			this.legacyStorage.removeItem(LEGACY_KEY);
			if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:"))
				return null;
			const blob = await this.dataUrlLoader.load(dataUrl);
			await this.write(blob);
			return blob;
		} catch (error) {
			console.warn("Custom background legacy migration failed", error);
			return null;
		}
	}
}
