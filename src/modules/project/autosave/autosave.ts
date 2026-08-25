import {
	ProjectHistoryService,
	type ProjectInfo,
	type ProjectVersion,
} from "$/application/project";
import { IndexedDbProjectHistoryStorage } from "$/platform/storage/IndexedDbProjectHistoryStorage";
import type { TTMLLyric } from "$/types/ttml";

export type { ProjectInfo, ProjectVersion };

export const projectHistoryService = new ProjectHistoryService(
	new IndexedDbProjectHistoryStorage(),
);

export const autoSaveProject = (
	projectId: string,
	lyrics: TTMLLyric,
	limit: number,
	saveInterval: number,
) =>
	projectHistoryService.saveSnapshot({
		projectId,
		lyrics,
		versionLimit: limit,
		versionIntervalMs: saveInterval,
	});

export const getProjectList = () => projectHistoryService.listProjects();
export const getProjectVersions = (projectId: string) =>
	projectHistoryService.listVersions(projectId);
export const getProjectLatestState = (projectId: string) =>
	projectHistoryService.getLatestState(projectId);
export const deleteProject = (projectId: string) =>
	projectHistoryService.deleteProject(projectId);
