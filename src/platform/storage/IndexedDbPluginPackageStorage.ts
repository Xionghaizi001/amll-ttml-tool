import { type IDBPDatabase, openDB } from "idb";

const DATABASE = "amll-plugins";
const STORE = "packages";

export interface StoredPluginPackageRecord {
	id: string;
	/** Raw manifest JSON; re-validated with parseManifest on every load. */
	manifest: unknown;
	wasm: ArrayBuffer;
	granted: string[];
	enabled: boolean;
	source: "user" | "sample";
	installedAt: number;
}

/**
 * Installed WASM plugin packages (manifest + module bytes + grant state).
 * IndexedDB from day one: wasm modules routinely exceed the localStorage
 * quota, and records are re-validated at the single parse gate on load.
 */
export class IndexedDbPluginPackageStorage {
	private database?: Promise<IDBPDatabase>;

	async loadAll(): Promise<StoredPluginPackageRecord[]> {
		try {
			const records = (await (
				await this.getDatabase()
			).getAll(STORE)) as StoredPluginPackageRecord[];
			return records.filter(
				(record) =>
					typeof record.id === "string" && record.wasm instanceof ArrayBuffer,
			);
		} catch (error) {
			console.warn("Plugin package read failed", error);
			return [];
		}
	}

	async save(record: StoredPluginPackageRecord): Promise<void> {
		try {
			await (await this.getDatabase()).put(STORE, record);
		} catch (error) {
			console.warn("Plugin package write failed", error);
		}
	}

	async remove(id: string): Promise<void> {
		try {
			await (await this.getDatabase()).delete(STORE, id);
		} catch (error) {
			console.warn("Plugin package delete failed", error);
		}
	}

	private getDatabase(): Promise<IDBPDatabase> {
		this.database ??= openDB(DATABASE, 1, {
			upgrade(database) {
				if (!database.objectStoreNames.contains(STORE))
					database.createObjectStore(STORE, { keyPath: "id" });
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
}
