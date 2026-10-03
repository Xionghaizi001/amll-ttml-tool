import {
	type ExtensionDatabaseProvider,
	openPluginDatabase,
} from "./plugin-database";

const STORE = "theme-packages";
const ASSETS = "theme-assets";

export interface StoredThemePackageRecord {
	id: string;
	/** Raw ThemePackageV0 JSON; re-validated with parseThemePackage on load. */
	pkg: unknown;
	installedAt: number;
}
interface ThemeAssetRecord {
	surface: string;
	themeId: string;
	name: string;
	blob: Blob;
}

/** Installed theme metadata and separately stored binary image assets. */
export class IndexedDbThemePackageStorage {
	constructor(
		private readonly getDatabase: ExtensionDatabaseProvider = openPluginDatabase,
	) {}
	async loadAll(): Promise<StoredThemePackageRecord[]> {
		const transaction = (await this.getDatabase()).transaction([STORE, ASSETS]);
		const [records, assets] = await Promise.all([
			transaction.objectStore(STORE).getAll() as Promise<
				StoredThemePackageRecord[]
			>,
			transaction.objectStore(ASSETS).getAll() as Promise<ThemeAssetRecord[]>,
			transaction.done,
		]);
		return Promise.all(
			records
				.filter((record) => typeof record.id === "string")
				.map(async (record) => {
					const owned = assets.filter((asset) => asset.themeId === record.id);
					if (owned.length === 0) return record;
					const decoded = await Promise.all(
						owned.map(async (asset) => {
							const bytes = new Uint8Array(await asset.blob.arrayBuffer());
							let binary = "";
							for (const byte of bytes) binary += String.fromCharCode(byte);
							return [
								asset.name,
								{ mime: asset.blob.type, data: btoa(binary) },
							];
						}),
					);
					return {
						...record,
						pkg: {
							...(record.pkg as object),
							assets: Object.fromEntries(decoded),
						},
					};
				}),
		);
	}
	async save(id: string, pkg: unknown): Promise<void> {
		const { assets, ...metadata } = pkg as {
			assets?: Record<string, { mime: string; data: string }>;
		};
		const blobs = Object.entries(assets ?? {}).map(
			([name, asset]) =>
				({
					surface: `theme:${id}:${name}`,
					themeId: id,
					name,
					blob: new Blob(
						[Uint8Array.from(atob(asset.data), (char) => char.charCodeAt(0))],
						{ type: asset.mime },
					),
				}) satisfies ThemeAssetRecord,
		);
		const transaction = (await this.getDatabase()).transaction(
			[STORE, ASSETS],
			"readwrite",
		);
		const assetStore = transaction.objectStore(ASSETS);
		try {
			const oldKeys = await assetStore.index("themeId").getAllKeys(id);
			for (const key of oldKeys) await assetStore.delete(key);
			for (const asset of blobs) await assetStore.put(asset);
			await transaction
				.objectStore(STORE)
				.put({
					id,
					pkg: metadata,
					installedAt: Date.now(),
				} satisfies StoredThemePackageRecord);
			await transaction.done;
		} catch (error) {
			try {
				transaction.abort();
			} catch {
				/* Already completed or aborted. */
			}
			await transaction.done.catch(() => undefined);
			throw error;
		}
	}
	/** User surface images have no themeId and survive removal of an installed theme. */
	async remove(id: string): Promise<void> {
		const transaction = (await this.getDatabase()).transaction(
			[STORE, ASSETS],
			"readwrite",
		);
		const assetStore = transaction.objectStore(ASSETS);
		try {
			const keys = await assetStore.index("themeId").getAllKeys(id);
			for (const key of keys) await assetStore.delete(key);
			await transaction.objectStore(STORE).delete(id);
			await transaction.done;
		} catch (error) {
			try {
				transaction.abort();
			} catch {
				/* Already completed or aborted. */
			}
			await transaction.done.catch(() => undefined);
			throw error;
		}
	}
}
