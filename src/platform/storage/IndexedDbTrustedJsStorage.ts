import type { TrustedJsPluginPackageV0 } from "@amll-ttml-tool/plugin-api";
import {
	type ExtensionDatabaseProvider,
	openPluginDatabase,
	pluginNamespaceRange,
} from "./plugin-database";

export interface StoredTrustedJsRecord {
	id: string;
	manifest: TrustedJsPluginPackageV0["manifest"];
	code: Blob;
	sha256: string;
	source: "user" | "dev" | "store";
	installedAt: number;
}

/** Writes deliberately propagate quota/transaction errors to the installer. */
export class IndexedDbTrustedJsStorage {
	constructor(
		private readonly getDatabase: ExtensionDatabaseProvider = openPluginDatabase,
	) {}
	async loadAll(): Promise<StoredTrustedJsRecord[]> {
		return (await this.getDatabase()).getAll("trusted-js");
	}
	async save(record: StoredTrustedJsRecord): Promise<void> {
		await (await this.getDatabase()).put("trusted-js", record);
	}
	/** Package-only removal is also used during a failed installation rollback. */
	async remove(id: string): Promise<void> {
		await (await this.getDatabase()).delete("trusted-js", id);
	}
	async uninstall(id: string): Promise<void> {
		const transaction = (await this.getDatabase()).transaction(
			["trusted-js", "plugin-kv"],
			"readwrite",
		);
		try {
			await transaction.objectStore("trusted-js").delete(id);
			await transaction
				.objectStore("plugin-kv")
				.delete(pluginNamespaceRange(id));
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
