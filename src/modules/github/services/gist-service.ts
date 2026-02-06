import { githubFetchRaw } from "../api";
export type GithubGistResponse = {
	id: string;
	html_url: string;
	files?: Record<string, { raw_url?: string | null; }>;
};

export const createGithubGist = async (
	token: string,
	payload: {
		description: string;
		isPublic: boolean;
		files: Record<string, { content: string; }>;
	}
): Promise<GithubGistResponse> => {
	const headers = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
		"X-GitHub-Api-Version": "2022-11-28",
		"Content-Type": "application/json",
	};
	const response = await githubFetchRaw("https://api.github.com/gists", {
		init: {
			method: "POST",
			headers,
			body: JSON.stringify({
				description: payload.description,
				public: payload.isPublic,
				files: payload.files,
			}),
		},
	});
	if (!response.ok) {
		throw new Error("create-gist-failed");
	}
	return (await response.json()) as GithubGistResponse;
};

export const pushFileUpdateToGist = async (options: {
	token: string;
	prNumber: number;
	prTitle: string;
	fileName: string;
	content: string;
}) => {
	const trimmedFileName = options.fileName.trim() || "lyric.ttml";
	const result = await createGithubGist(options.token, {
		description: `AMLL TTML Tool update for PR #${options.prNumber} ${options.prTitle}`,
		isPublic: false,
		files: {
			[trimmedFileName]: {
				content: options.content,
			},
		},
	});
	const rawUrl =
		result.files?.[trimmedFileName]?.raw_url ??
		Object.values(result.files ?? {})[0]?.raw_url;
	if (!rawUrl) {
		throw new Error("gist-raw-url-missing");
	}
	return {
		gistId: result.id,
		rawUrl,
		fileName: trimmedFileName,
	};
};
