import { githubFetch } from "../api";


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
		"Content-Type": "application/json",
	};
	const response = await githubFetch("/gists", {
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
