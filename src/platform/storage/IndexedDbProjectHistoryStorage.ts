import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type {
	ProjectHistoryStoragePort,
	ProjectInfo,
	ProjectSnapshotWrite,
	ProjectVersion,
} from "../../application/project/ProjectHistoryService";
import type { TTMLLyric } from "../../types/ttml";

const DB_NAME = "amll-autosave-db";
const DB_VERSION = 2;

/**
 * @description 旧版快照结构，仅用于数据迁移
 * @internal
 */
interface LegacySnapshot {
	id?: number;
	timestamp: number;
	lyrics: TTMLLyric;
}

/**
 * @description 数据库 Schema 定义
 */
interface AutosaveDBSchema extends DBSchema {
	/**
	 * @description 用来存储每个项目的元信息 (元数据只存最新的) 和状态
	 */
	projects: {
		key: string;
		value: ProjectInfo;
		indexes: { "by-last-modified": number };
	};
	/**
	 * @description 用来存储所有项目的历史记录
	 */
	versions: {
		key: number;
		value: ProjectVersion;
		indexes: {
			/**
			 * @description 用于查找某项目的所有版本
			 */
			"by-project": string;
			/**
			 * @description 用于查找某项目最新版本
			 */
			"by-project-date": [string, number];
		};
	};
}

export class IndexedDbProjectHistoryStorage
	implements ProjectHistoryStoragePort
{
	private dbPromise: Promise<IDBPDatabase<AutosaveDBSchema>> | null = null;

	private getDB() {
		if (!this.dbPromise) {
			this.dbPromise = openDB<AutosaveDBSchema>(DB_NAME, DB_VERSION, {
				async upgrade(db, oldVersion, _newVersion, transaction) {
					if (!db.objectStoreNames.contains("projects")) {
						const projects = db.createObjectStore("projects", {
							keyPath: "id",
						});
						projects.createIndex("by-last-modified", "lastModified");
					}
					if (!db.objectStoreNames.contains("versions")) {
						const versions = db.createObjectStore("versions", {
							keyPath: "id",
							autoIncrement: true,
						});
						versions.createIndex("by-project", "projectId");
						versions.createIndex("by-project-date", ["projectId", "timestamp"]);
					}
					if (
						oldVersion < 2 &&
						// biome-ignore lint/suspicious/noExplicitAny: legacy schema migration
						db.objectStoreNames.contains("snapshots" as any)
					) {
						const legacyProjectId = "legacy_autosave_archive";
						// biome-ignore lint/suspicious/noExplicitAny: legacy schema migration
						const legacyStore = transaction.objectStore("snapshots" as any);
						const snapshots = (await legacyStore.getAll()) as LegacySnapshot[];
						if (snapshots.length) {
							snapshots.sort((left, right) => left.timestamp - right.timestamp);
							const latest = snapshots[snapshots.length - 1];
							await transaction.objectStore("projects").put({
								id: legacyProjectId,
								name: "Legacy Snapshots Archive",
								lastModified: latest.timestamp,
								latestState: latest.lyrics,
								preview: "(来自旧版自动保存的历史数据)",
							});
							for (const snapshot of snapshots) {
								await transaction.objectStore("versions").add({
									projectId: legacyProjectId,
									timestamp: snapshot.timestamp,
									data: snapshot.lyrics,
								});
							}
						}
						// biome-ignore lint/suspicious/noExplicitAny: legacy schema migration
						db.deleteObjectStore("snapshots" as any);
					}
				},
			});
		}
		return this.dbPromise;
	}

	async getLatestVersionTimestamp(
		projectId: string,
	): Promise<number | undefined> {
		const db = await this.getDB();
		const range = IDBKeyRange.bound([projectId, 0], [projectId, Infinity]);
		const cursor = await db
			.transaction("versions")
			.objectStore("versions")
			.index("by-project-date")
			.openCursor(range, "prev");
		return cursor?.value.timestamp;
	}

	async writeSnapshot({
		project,
		version,
		versionLimit,
	}: ProjectSnapshotWrite): Promise<void> {
		const db = await this.getDB();
		const transaction = db.transaction(["projects", "versions"], "readwrite");
		await transaction.objectStore("projects").put(project);
		if (version) {
			const versions = transaction.objectStore("versions");
			await versions.add(version);
			const range = IDBKeyRange.bound([project.id, 0], [project.id, Infinity]);
			const keys = await versions.index("by-project-date").getAllKeys(range);
			const deleteCount = Math.max(0, keys.length - versionLimit);
			await Promise.all(
				keys.slice(0, deleteCount).map((key) => versions.delete(key)),
			);
		}
		await transaction.done;
	}

	async listProjects(): Promise<ProjectInfo[]> {
		const db = await this.getDB();
		return (await db.getAllFromIndex("projects", "by-last-modified")).reverse();
	}

	async listVersions(projectId: string): Promise<ProjectVersion[]> {
		const db = await this.getDB();
		const range = IDBKeyRange.bound([projectId, 0], [projectId, Infinity]);
		return (
			await db.getAllFromIndex("versions", "by-project-date", range)
		).reverse();
	}

	async getLatestState(projectId: string): Promise<TTMLLyric | undefined> {
		const db = await this.getDB();
		return (await db.get("projects", projectId))?.latestState;
	}

	async deleteProject(projectId: string): Promise<void> {
		const db = await this.getDB();
		const transaction = db.transaction(["projects", "versions"], "readwrite");
		await transaction.objectStore("projects").delete(projectId);
		const versions = transaction.objectStore("versions");
		const keys = await versions.index("by-project").getAllKeys(projectId);
		await Promise.all(keys.map((key) => versions.delete(key)));
		await transaction.done;
	}
}
