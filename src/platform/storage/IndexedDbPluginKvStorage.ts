import { type IDBPDatabase, openDB } from "idb";
import type { JsonValue } from "@amll-ttml-tool/plugin-api";

const DATABASE = "amll-plugin-kv";
const STORE = "kv";

interface PluginKvRecord {
	pluginId: string;
	key: string;
	value: JsonValue;
	updatedAt: number;
}

const namespaceRange = (pluginId: string): IDBKeyRange =>
	// Composite keys sort arrays after strings, so [pluginId, []] is an upper
	// bound covering every string key in the namespace.
	IDBKeyRange.bound([pluginId, ""], [pluginId, []]);

/**
 * Per-plugin isolated key-value persistence. Quotas are enforced by the
 * worker turn host before changes ever reach this adapter; reads and writes
 * here are namespace-scoped so one plugin can never see another's keys.
 */
export class IndexedDbPluginKvStorage {
	private database?: Promise<IDBPDatabase>;

	async read(pluginId: string): Promise<Record<string, JsonValue>> {
		try {
			const records = (await (
				await this.getDatabase()
			).getAll(STORE, namespaceRange(pluginId))) as PluginKvRecord[];
			return Object.fromEntries(
				records.map((record) => [record.key, record.value]),
			);
		} catch (error) {
			console.warn("Plugin KV read failed", error);
			return {};
		}
	}

	async apply(
		pluginId: string,
		changes: { set: Record<string, JsonValue>; deleted: string[] },
	): Promise<void> {
		try {
			const database = await this.getDatabase();
			const transaction = database.transaction(STORE, "readwrite");
			for (const [key, value] of Object.entries(changes.set))
				transaction.store.put({
					pluginId,
					key,
					value,
					updatedAt: Date.now(),
				} satisfies PluginKvRecord);
			for (const key of changes.deleted)
				transaction.store.delete([pluginId, key]);
			await transaction.done;
		} catch (error) {
			console.warn("Plugin KV write failed", error);
		}
	}

	async clear(pluginId: string): Promise<void> {
		try {
			const database = await this.getDatabase();
			const transaction = database.transaction(STORE, "readwrite");
			transaction.store.delete(namespaceRange(pluginId));
			await transaction.done;
		} catch (error) {
			console.warn("Plugin KV clear failed", error);
		}
	}

	private getDatabase(): Promise<IDBPDatabase> {
		this.database ??= openDB(DATABASE, 1, {
			upgrade(database) {
				if (!database.objectStoreNames.contains(STORE))
					database.createObjectStore(STORE, { keyPath: ["pluginId", "key"] });
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
