import type { TrustedJsPluginPackageV0 } from "@amll-ttml-tool/plugin-api";
import { openPluginDatabase } from "./plugin-database";

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
	async loadAll(): Promise<StoredTrustedJsRecord[]> {
		const db = await openPluginDatabase();
		try {
			return await db.getAll("trusted-js");
		} finally {
			db.close();
		}
	}
	async save(record: StoredTrustedJsRecord): Promise<void> {
		const db = await openPluginDatabase();
		try {
			await db.put("trusted-js", record);
		} finally {
			db.close();
		}
	}
	async remove(id: string): Promise<void> {
		const db = await openPluginDatabase();
		try {
			await db.delete("trusted-js", id);
		} finally {
			db.close();
		}
	}
}
