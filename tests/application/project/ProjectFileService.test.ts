import { describe, expect, it } from "vitest";
import {
	applyDefaultTtmlAuthorMetadata,
	getSuggestedTtmlFileName,
} from "$/application/project/ProjectFileService";

describe("ProjectFileService", () => {
	it("fills both missing author fields without overwriting existing values", () => {
		const metadata = [{ key: "ttmlAuthorGithub", value: ["existing"] }];
		expect(
			applyDefaultTtmlAuthorMetadata(metadata, {
				githubId: "new-id",
				githubLogin: "login",
			}),
		).toBe(true);
		expect(metadata).toEqual([
			{ key: "ttmlAuthorGithub", value: ["existing"] },
			{ key: "ttmlAuthorGithubLogin", value: ["login"] },
		]);
	});

	it("creates a TTML file name only when title and artist are available", () => {
		expect(
			getSuggestedTtmlFileName([
				{ key: "musicName", value: ["Song"] },
				{ key: "artists", value: ["Artist"] },
			]),
		).toEqual({ baseName: "Artist - Song", fileName: "Artist - Song.ttml" });
		expect(getSuggestedTtmlFileName([])).toBeNull();
	});
});
