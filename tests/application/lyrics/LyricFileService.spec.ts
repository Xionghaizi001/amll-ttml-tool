import { describe, expect, it } from "vitest";
import type { TTMLLyric } from "$/types/ttml";
import type { ProjectInfo } from "$/application/project/ProjectHistoryService";
import {
	getExportedContentIssues,
	getFileExtension,
	getLyricExportIssues,
	mergeExtractedLyricMetadata,
	resolveImportedFileName,
	resolveImportedProjectId,
} from "$/application/lyrics/LyricFileService";

const lyricWithMetadata = (metadata: TTMLLyric["metadata"]): TTMLLyric => ({
	lyricLines: [],
	metadata,
});

const projectInfo = (
	id: string,
	metadata: TTMLLyric["metadata"],
): ProjectInfo => ({
	id,
	name: id,
	lastModified: 0,
	latestState: { lyricLines: [], metadata },
});

describe("LyricFileService", () => {
	it("extracts lowercase file extensions", () => {
		expect(getFileExtension("Song.TTML")).toBe("ttml");
		expect(getFileExtension("archive.tar.lrc")).toBe("lrc");
		expect(getFileExtension("noext")).toBe("noext");
	});

	it("reuses a matching autosave project id", async () => {
		const metadata = [{ key: "musicName", value: ["Song"] }];
		const matched: string[] = [];
		const projectId = await resolveImportedProjectId({
			lyric: lyricWithMetadata(metadata),
			listProjects: async () => [
				projectInfo("other", [{ key: "musicName", value: ["Another"] }]),
				projectInfo("match", metadata),
			],
			generateProjectId: () => "generated",
			onMatched: (project) => matched.push(project.id),
		});
		expect(projectId).toBe("match");
		expect(matched).toEqual(["match"]);
	});

	it("generates a fresh project id without metadata or matches", async () => {
		await expect(
			resolveImportedProjectId({
				lyric: lyricWithMetadata([]),
				listProjects: async () => {
					throw new Error("must not be called for empty metadata");
				},
				generateProjectId: () => "generated",
			}),
		).resolves.toBe("generated");

		const errors: unknown[] = [];
		await expect(
			resolveImportedProjectId({
				lyric: lyricWithMetadata([{ key: "musicName", value: ["Song"] }]),
				listProjects: async () => {
					throw new Error("storage broken");
				},
				generateProjectId: () => "generated",
				onLookupError: (error) => errors.push(error),
			}),
		).resolves.toBe("generated");
		expect(errors).toHaveLength(1);
	});

	it("derives the imported file name from metadata unless native", () => {
		const metadata = [
			{ key: "musicName", value: ["Song"] },
			{ key: "artists", value: ["Artist"] },
		];
		expect(
			resolveImportedFileName({
				metadata,
				importedFileName: "input.lrc",
			}),
		).toBe("Artist - Song.ttml");
		expect(
			resolveImportedFileName({
				metadata,
				importedFileName: "input.ttml",
				keepImportedFileName: true,
			}),
		).toBe("input.ttml");
		expect(
			resolveImportedFileName({ metadata: [], importedFileName: "input.lrc" }),
		).toBe("input.lrc");
		expect(resolveImportedFileName({ metadata: [] })).toBeNull();
	});

	it("merges extracted audio metadata without overwriting user values", () => {
		const current = [
			{ key: "musicName", value: ["Kept"] },
			{ key: "artists", value: [" "] },
		];
		const changed = mergeExtractedLyricMetadata(current, [
			{ key: "musicName", value: ["Ignored"] },
			{ key: "artists", value: [" Artist "] },
			{ key: "album", value: ["Album"] },
			{ key: "empty", value: ["  "] },
		]);
		expect(changed).toBe(true);
		expect(current).toEqual([
			{ key: "musicName", value: ["Kept"] },
			{ key: "artists", value: ["Artist"] },
			{ key: "album", value: ["Album"] },
		]);
		expect(mergeExtractedLyricMetadata(current, [])).toBe(false);
	});

	it("validates export input and output", () => {
		expect(getLyricExportIssues({ lyricLines: [], metadata: [] })).toEqual([
			"empty-document",
		]);
		expect(
			getLyricExportIssues({
				lyricLines: [{ words: [] } as never],
				metadata: [],
			}),
		).toEqual([]);
		expect(getExportedContentIssues("")).toEqual(["empty-output"]);
		expect(getExportedContentIssues(undefined)).toEqual(["empty-output"]);
		expect(getExportedContentIssues("[00:00.00]a")).toEqual([]);
	});
});
