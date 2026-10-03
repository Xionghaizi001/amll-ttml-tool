import {
	type ExtensionDatabaseProvider,
	openPluginDatabase,
} from "./plugin-database";
import type { ThemeSurfaceNameV0 } from "@amll-ttml-tool/plugin-api";

const STORE = "theme-assets";

export interface ThemeSurfaceImageRecord {
	surface: ThemeSurfaceNameV0;
	blob: Blob;
	/** User-selected overlay color and opacity. */
	scrim?: string;
	opacity?: number;
	updatedAt: number;
}

/** Per-surface background image blobs picked by the user. */
export class IndexedDbThemeSurfaceImageStorage {
	constructor(
		private readonly getDatabase: ExtensionDatabaseProvider = openPluginDatabase,
	) {}

	async readAll(): Promise<ThemeSurfaceImageRecord[]> {
		try {
			const records = (await (
				await this.getDatabase()
			).getAll(STORE)) as ThemeSurfaceImageRecord[];
			return records.filter(
				(record) => record.blob instanceof Blob && !("themeId" in record),
			);
		} catch (error) {
			console.warn("Theme surface image read failed", error);
			return [];
		}
	}

	async write(
		surface: ThemeSurfaceNameV0,
		blob: Blob,
		scrim: string | undefined,
		opacity?: number,
	): Promise<void> {
		try {
			await (await this.getDatabase()).put(STORE, {
				surface,
				blob,
				scrim,
				opacity,
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
}
