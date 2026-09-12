import { describe, expect, it } from "vitest";
import type { TTMLLyric } from "$/types/ttml";
import {
	ProjectHistoryService,
	type ProjectHistoryStoragePort,
	type ProjectInfo,
	type ProjectSnapshotWrite,
	type ProjectVersion,
} from "$/application/project/ProjectHistoryService";

class MemoryProjectHistoryStorage implements ProjectHistoryStoragePort {
	readonly writes: ProjectSnapshotWrite[] = [];
	latestVersionTimestamp: number | undefined;

	async getLatestVersionTimestamp() {
		return this.latestVersionTimestamp;
	}

	async writeSnapshot(snapshot: ProjectSnapshotWrite) {
		this.writes.push(snapshot);
		if (snapshot.version)
			this.latestVersionTimestamp = snapshot.version.timestamp;
	}

	async listProjects(): Promise<ProjectInfo[]> {
		return [];
	}

	async listVersions(): Promise<ProjectVersion[]> {
		return [];
	}

	async getLatestState(): Promise<TTMLLyric | undefined> {
		return undefined;
	}

	async deleteProject(): Promise<void> {}
}

const createDocument = (): TTMLLyric => ({
	metadata: [
		{ key: "musicName", value: ["Song"] },
		{ key: "artists", value: ["Artist"] },
	],
	lyricLines: [
		{
			id: "line-1",
			startTime: 0,
			endTime: 1000,
			translatedLyric: "",
			romanLyric: "",
			isBG: false,
			isDuet: false,
			ignoreSync: false,
			words: [
				{
					id: "word-1",
					startTime: 0,
					endTime: 1000,
					word: "Hello",
					obscene: false,
					emptyBeat: 0,
					romanWord: "",
				},
			],
		},
	],
});

describe("ProjectHistoryService", () => {
	it("updates the latest project while applying version interval policy", async () => {
		const storage = new MemoryProjectHistoryStorage();
		const service = new ProjectHistoryService(storage);
		const document = createDocument();

		await service.saveSnapshot({
			projectId: "project-1",
			lyrics: document,
			versionLimit: 5,
			versionIntervalMs: 1000,
			now: 2000,
		});
		await service.saveSnapshot({
			projectId: "project-1",
			lyrics: document,
			versionLimit: 5,
			versionIntervalMs: 1000,
			now: 2500,
		});

		expect(storage.writes).toHaveLength(2);
		expect(storage.writes[0].project).toMatchObject({
			id: "project-1",
			name: "Song - Artist",
			preview: "Hello",
			lastModified: 2000,
		});
		expect(storage.writes[0].version?.timestamp).toBe(2000);
		expect(storage.writes[1].version).toBeUndefined();
	});

	it("snapshots mutable input before handing it to storage", async () => {
		const storage = new MemoryProjectHistoryStorage();
		const service = new ProjectHistoryService(storage);
		const document = createDocument();
		await service.saveSnapshot({
			projectId: "project-1",
			lyrics: document,
			versionLimit: 3,
			versionIntervalMs: 0,
			now: 1,
		});
		document.metadata[0].value[0] = "Changed";
		expect(storage.writes[0].project.latestState.metadata[0].value[0]).toBe(
			"Song",
		);
	});
});
