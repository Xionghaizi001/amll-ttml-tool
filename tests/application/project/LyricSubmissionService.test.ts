import { describe, expect, it } from "vitest";
import type { HttpClientPort, HttpRequest } from "$/kernel/platform";
import type { TTMLLyric } from "$/types/ttml";
import {
	getLyricSubmissionIssues,
	LyricSubmissionService,
	LyricSubmissionValidationError,
} from "$/application/project/LyricSubmissionService";

const document: TTMLLyric = {
	metadata: [
		{ key: "musicName", value: ["Song"] },
		{ key: "artists", value: ["Artist"] },
		{ key: "album", value: ["Album"] },
		{ key: "isrc", value: ["ISRC-1"] },
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
			words: [],
		},
	],
};

describe("LyricSubmissionService", () => {
	it("validates document requirements without UI dependencies", () => {
		expect(getLyricSubmissionIssues({ metadata: [], lyricLines: [] })).toEqual([
			"missing-music-name",
			"missing-artists",
			"missing-album",
			"missing-music-id",
			"empty-lyrics",
		]);
	});

	it("generates TTML, uploads through the port and returns an issue URL", async () => {
		let request: HttpRequest | undefined;
		const http: HttpClientPort = {
			async request<T>(nextRequest: HttpRequest) {
				request = nextRequest;
				return {
					ok: true,
					status: 200,
					statusText: "OK",
					data: { id: "upload-1" } as T,
				};
			},
		};
		const service = new LyricSubmissionService(
			{ generate: () => ({ success: true, data: "<tt></tt>" }) },
			http,
			{
				uploadEndpoint: "https://upload.example/api",
				issueEndpoint: "https://issues.example/new",
			},
		);

		const result = await service.submit(document, {
			reason: "New lyric",
			comment: "Looks good",
			label: "submission",
			issueTitle: "Submit Artist - Song",
		});

		expect(request).toMatchObject({
			url: "https://upload.example/api",
			method: "POST",
			body: { kind: "form-data" },
		});
		const issueUrl = new URL(result.issueUrl);
		expect(issueUrl.searchParams.get("labels")).toBe("submission");
		expect(issueUrl.searchParams.get("title")).toBe("Submit Artist - Song");
		expect(issueUrl.searchParams.get("body")).toContain("upload-1");
	});

	it("does not call generator or network for an invalid document", async () => {
		const service = new LyricSubmissionService(
			{
				generate: () => {
					throw new Error("generator should not run");
				},
			},
			{
				request: () => Promise.reject(new Error("network should not run")),
			},
			{ uploadEndpoint: "upload", issueEndpoint: "issue" },
		);
		await expect(
			service.submit(
				{ metadata: [], lyricLines: [] },
				{ reason: "", comment: "", label: "", issueTitle: "" },
			),
		).rejects.toBeInstanceOf(LyricSubmissionValidationError);
	});
});
