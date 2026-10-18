import type { TrustedJsPluginPackageV0 } from "@amll-ttml-tool/plugin-api";
import type { StoreInstallationProvenance } from "$/kernel/extensions/installation-provenance";
import {
	type ExtensionDatabaseProvider,
	openPluginDatabase,
	pluginNamespaceRange,
} from "./plugin-database";

export interface StoredTrustedJsRecord {
	id: string;
	manifest: TrustedJsPluginPackageV0["manifest"];
	code: Blob;
	resources?: TrustedJsPluginPackageV0["resources"];
	sha256: string;
	source: "user" | "dev" | "store";
	installedAt: number;
	store?: StoreInstallationProvenance;
}

/** Writes deliberately propagate quota/transaction errors to the installer. */
export class IndexedDbTrustedJsStorage {
	constructor(
		private readonly getDatabase: ExtensionDatabaseProvider = openPluginDatabase,
	) { }
	async loadAll(): Promise<StoredTrustedJsRecord[]> {
		return (await this.getDatabase()).getAll("trusted-js");
	}
	async save(record: StoredTrustedJsRecord): Promise<void> {
		await (await this.getDatabase()).put("trusted-js", record);
	}
	/** Snapshot the release and its data before activation or a batch install. */
	async checkpoint(id: string): Promise<() => Promise<void>> {
		const db = await this.getDatabase();
		const read = db.transaction(["trusted-js", "plugin-kv"]);
		const [record, values] = await Promise.all([
			read.objectStore("trusted-js").get(id),
			read.objectStore("plugin-kv").getAll(pluginNamespaceRange(id)),
			read.done,
		]);
		return async () => {
			const tx = db.transaction(["trusted-js", "plugin-kv"], "readwrite");
			try {
				if (record) await tx.objectStore("trusted-js").put(record);
				else await tx.objectStore("trusted-js").delete(id);
				await tx.objectStore("plugin-kv").delete(pluginNamespaceRange(id));
				for (const value of values)
					await tx.objectStore("plugin-kv").put(value);
				await tx.done;
			} catch (error) {
				try {
					tx.abort();
				} catch {
					/* Already aborted. */
				}
				await tx.done.catch(() => undefined);
				throw error;
			}
		};
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
