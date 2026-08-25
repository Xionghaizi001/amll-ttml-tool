import type { TTMLLyric } from "../../types/ttml";
import { identifyProject } from "./ProjectIdentity";

/**
 * @description 项目基本信息，用于快速恢复最新版本
 */
export interface ProjectInfo {
	/**
	 * @description 项目唯一标识符
	 */
	id: string;
	/**
	 * @description 项目显示名称，通常由 `identifyProject` 生成
	 */
	name: string;
	/**
	 * @description 最后修改时间戳
	 */
	lastModified: number;
	/**
	 * @description 歌词预览文本
	 */
	preview?: string;
	/**
	 * @description 项目的最新版本
	 */
	latestState: TTMLLyric;
}

/**
 * @description 项目的历史版本
 */
export interface ProjectVersion {
	/**
	 * @description 自增主键 ID
	 */
	id?: number;
	/**
	 * @description 关联的项目 ID (外键)
	 */
	projectId: string;
	/**
	 * @description 保存时的时间戳
	 */
	timestamp: number;
	/**
	 * @description 该版本的歌词数据
	 */
	data: TTMLLyric;
}

export interface ProjectSnapshotWrite {
	project: ProjectInfo;
	version?: Omit<ProjectVersion, "id">;
	versionLimit: number;
}

export interface ProjectHistoryStoragePort {
	getLatestVersionTimestamp(projectId: string): Promise<number | undefined>;
	writeSnapshot(snapshot: ProjectSnapshotWrite): Promise<void>;
	listProjects(): Promise<ProjectInfo[]>;
	listVersions(projectId: string): Promise<ProjectVersion[]>;
	getLatestState(projectId: string): Promise<TTMLLyric | undefined>;
	deleteProject(projectId: string): Promise<void>;
}

export interface SaveProjectSnapshotOptions {
	projectId: string;
	lyrics: TTMLLyric;
	versionLimit: number;
	versionIntervalMs: number;
	now?: number;
}

const clone = <T>(value: T): T => structuredClone(value);

export class ProjectHistoryService {
	constructor(private readonly storage: ProjectHistoryStoragePort) {}

	async saveSnapshot({
		projectId,
		lyrics,
		versionLimit,
		versionIntervalMs,
		now = Date.now(),
	}: SaveProjectSnapshotOptions): Promise<void> {
		const latestVersionTimestamp =
			(await this.storage.getLatestVersionTimestamp(projectId)) ?? 0;
		const document = clone(lyrics);
		const identity = identifyProject(document);
		const shouldCreateVersion =
			now - latestVersionTimestamp > Math.max(0, versionIntervalMs);

		await this.storage.writeSnapshot({
			project: {
				id: projectId,
				name: identity.displayName,
				lastModified: now,
				latestState: document,
				preview:
					document.lyricLines[0]?.words.map((word) => word.word).join("") ?? "",
			},
			version: shouldCreateVersion
				? { projectId, timestamp: now, data: clone(document) }
				: undefined,
			versionLimit: Math.max(0, Math.floor(versionLimit)),
		});
	}

	listProjects(): Promise<ProjectInfo[]> {
		return this.storage.listProjects();
	}

	listVersions(projectId: string): Promise<ProjectVersion[]> {
		return this.storage.listVersions(projectId);
	}

	getLatestState(projectId: string): Promise<TTMLLyric | undefined> {
		return this.storage.getLatestState(projectId);
	}

	deleteProject(projectId: string): Promise<void> {
		return this.storage.deleteProject(projectId);
	}
}
