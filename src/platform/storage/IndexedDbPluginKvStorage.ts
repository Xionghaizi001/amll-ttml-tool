import {
	type ExtensionDatabaseProvider,
	openPluginDatabase,
	pluginNamespaceRange,
} from "./plugin-database";
import type { JsonValue } from "@amll-ttml-tool/plugin-api";

const STORE = "plugin-kv";

interface PluginKvRecord {
	pluginId: string;
	key: string;
	value: JsonValue;
	updatedAt: number;
}

/**
 * Per-plugin isolated key-value persistence. Quotas are enforced by the
 * trusted-js host before changes ever reach this adapter; reads and writes
 * here are namespace-scoped so one plugin can never see another's keys.
 */
export class IndexedDbPluginKvStorage {
	constructor(
		private readonly getDatabase: ExtensionDatabaseProvider = openPluginDatabase,
	) {}

	async read(pluginId: string): Promise<Record<string, JsonValue>> {
		try {
			const records = (await (
				await this.getDatabase()
			).getAll(STORE, pluginNamespaceRange(pluginId))) as PluginKvRecord[];
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
			transaction.store.delete(pluginNamespaceRange(pluginId));
			await transaction.done;
		} catch (error) {
			console.warn("Plugin KV clear failed", error);
		}
	}
}
