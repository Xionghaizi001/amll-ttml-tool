import type { HttpClientPort } from "../../kernel/platform/HttpClient";
import type { TTMLLyric, TTMLMetadata } from "../../types/ttml";

export type SubmissionIssue =
	| "missing-music-name"
	| "missing-artists"
	| "missing-album"
	| "missing-music-id"
	| "empty-lyrics";

export interface TtmlGeneratorPort {
	generate(
		document: TTMLLyric,
	): { success: true; data: string } | { success: false; error: unknown };
}

export interface LyricSubmissionOptions {
	reason: string;
	comment: string;
	label: string;
	issueTitle: string;
}

export interface LyricSubmissionServiceConfig {
	uploadEndpoint: string;
	issueEndpoint: string;
}

export class LyricSubmissionValidationError extends Error {
	constructor(readonly issues: readonly SubmissionIssue[]) {
		super(`Lyric submission validation failed: ${issues.join(", ")}`);
		this.name = "LyricSubmissionValidationError";
	}
}

export class LyricSubmissionGenerationError extends Error {
	constructor(readonly generationError: unknown) {
		super("Failed to generate TTML for submission");
		this.name = "LyricSubmissionGenerationError";
	}
}

export class LyricSubmissionUploadError extends Error {
	constructor(
		readonly status: number,
		readonly statusText: string,
	) {
		super(`Failed to upload TTML: ${status} ${statusText}`);
		this.name = "LyricSubmissionUploadError";
	}
}

const hasMetadataValue = (metadata: TTMLMetadata[], key: string) =>
	metadata.some(
		(item) =>
			item.key === key && item.value.some((value) => value.trim().length > 0),
	);

export function getLyricSubmissionIssues(
	document: Pick<TTMLLyric, "metadata" | "lyricLines">,
): SubmissionIssue[] {
	const issues: SubmissionIssue[] = [];
	if (!hasMetadataValue(document.metadata, "musicName"))
		issues.push("missing-music-name");
	if (!hasMetadataValue(document.metadata, "artists"))
		issues.push("missing-artists");
	if (!hasMetadataValue(document.metadata, "album"))
		issues.push("missing-album");
	if (
		!["ncmMusicId", "qqMusicId", "spotifyId", "appleMusicId", "isrc"].some(
			(key) => hasMetadataValue(document.metadata, key),
		)
	)
		issues.push("missing-music-id");
	if (!document.lyricLines.length) issues.push("empty-lyrics");
	return issues;
}

export function createSubmissionName(
	metadata: TTMLMetadata[],
	unknownTitle: string,
	unknownArtist: string,
) {
	const title =
		metadata.find((item) => item.key === "musicName")?.value.join(", ") ||
		unknownTitle;
	const artists =
		metadata.find((item) => item.key === "artists")?.value.join(", ") ||
		unknownArtist;
	return `${artists} - ${title}`;
}

export class LyricSubmissionService {
	constructor(
		private readonly generator: TtmlGeneratorPort,
		private readonly http: HttpClientPort,
		private readonly config: LyricSubmissionServiceConfig,
	) {}

	async submit(document: TTMLLyric, options: LyricSubmissionOptions) {
		const issues = getLyricSubmissionIssues(document);
		if (issues.length) throw new LyricSubmissionValidationError(issues);
		const generated = this.generator.generate(document);
		if (!generated.success)
			throw new LyricSubmissionGenerationError(generated.error);

		const response = await this.http.request<{ id: string }>({
			url: this.config.uploadEndpoint,
			method: "POST",
			body: {
				kind: "form-data",
				fields: {
					file: {
						kind: "file",
						fileName: "lyrics.ttml",
						contentType: "text/xml",
						data: generated.data,
					},
				},
			},
		});
		if (!response.ok)
			throw new LyricSubmissionUploadError(
				response.status,
				response.statusText,
			);

		const issueUrl = new URL(this.config.issueEndpoint);
		issueUrl.searchParams.set("labels", options.label);
		issueUrl.searchParams.set("title", options.issueTitle);
		issueUrl.searchParams.set(
			"body",
			`${options.reason}\n\n${options.comment}\n\n<!-- AMLL TTML DB File ID: ${response.data.id} -->`,
		);
		return { issueUrl: issueUrl.toString(), uploadId: response.data.id };
	}
}
