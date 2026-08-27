import { type IDBPDatabase, openDB } from "idb";

const DATABASE = "amll-theme-packages";
const STORE = "packages";

export interface StoredThemePackageRecord {
	id: string;
	/** Raw ThemePackageV0 JSON; re-validated with parseThemePackage on load. */
	pkg: unknown;
	installedAt: number;
}

/**
 * Installed theme packages. Replaces the legacy localStorage store, whose
 * ~5MB quota base64 assets blew through; ThemeService migrates the old key
 * into this database once and then removes it.
 */
export class IndexedDbThemePackageStorage {
	private database?: Promise<IDBPDatabase>;

	async loadAll(): Promise<StoredThemePackageRecord[]> {
		try {
			const records = (await (
				await this.getDatabase()
			).getAll(STORE)) as StoredThemePackageRecord[];
			return records.filter((record) => typeof record.id === "string");
		} catch (error) {
			console.warn("Theme package read failed", error);
			return [];
		}
	}

	async save(id: string, pkg: unknown): Promise<void> {
		try {
			await (await this.getDatabase()).put(STORE, {
				id,
				pkg,
				installedAt: Date.now(),
			} satisfies StoredThemePackageRecord);
		} catch (error) {
			console.warn("Theme package write failed", error);
		}
	}

	async remove(id: string): Promise<void> {
		try {
			await (await this.getDatabase()).delete(STORE, id);
		} catch (error) {
			console.warn("Theme package delete failed", error);
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
