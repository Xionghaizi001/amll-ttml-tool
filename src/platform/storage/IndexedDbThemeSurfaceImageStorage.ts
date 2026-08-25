import { type IDBPDatabase, openDB } from "idb";
import type { ThemeSurfaceNameV0 } from "@amll-ttml-tool/plugin-api";

const DATABASE = "amll-theme-surfaces";
const STORE = "surface-image";

export interface ThemeSurfaceImageRecord {
	surface: ThemeSurfaceNameV0;
	blob: Blob;
	/** Readability overlay confirmed when the image was chosen. */
	scrim?: string;
	updatedAt: number;
}

/** Per-surface background image blobs picked by the user. */
export class IndexedDbThemeSurfaceImageStorage {
	private database?: Promise<IDBPDatabase>;

	async readAll(): Promise<ThemeSurfaceImageRecord[]> {
		try {
			const records = (await (
				await this.getDatabase()
			).getAll(STORE)) as ThemeSurfaceImageRecord[];
			return records.filter((record) => record.blob instanceof Blob);
		} catch (error) {
			console.warn("Theme surface image read failed", error);
			return [];
		}
	}

	async write(
		surface: ThemeSurfaceNameV0,
		blob: Blob,
		scrim: string | undefined,
	): Promise<void> {
		try {
			await (await this.getDatabase()).put(STORE, {
				surface,
				blob,
				scrim,
				updatedAt: Date.now(),
			} satisfies ThemeSurfaceImageRecord);
		} catch (error) {
			console.warn("Theme surface image write failed", error);
		}
	}

	async delete(surface: ThemeSurfaceNameV0): Promise<void> {
		try {
			await (await this.getDatabase()).delete(STORE, surface);
		} catch (error) {
			console.warn("Theme surface image delete failed", error);
		}
	}

	private getDatabase(): Promise<IDBPDatabase> {
		// A rejected open must not be cached for the rest of the session; a
		// transient failure should retry on the next call, and a terminated
		// connection reopens the same way.
		this.database ??= openDB(DATABASE, 1, {
			upgrade(database) {
				if (!database.objectStoreNames.contains(STORE))
					database.createObjectStore(STORE, { keyPath: "surface" });
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
