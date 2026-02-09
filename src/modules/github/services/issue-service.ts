import { githubFetch } from "$/modules/github/api";

type PushIssueBoyOptions = {
	token: string;
	repoOwner: string;
	repoName: string;
	filePath: string;
	jsonContent: string;
	commitMessage: string;
	branch?: string;
};

type PushIssueBoyResult = {
	ok: boolean;
	status?: number;
	contentSha?: string;
};

const encodeBase64 = (value: string) =>
	btoa(String.fromCharCode(...new TextEncoder().encode(value)));

const normalizePath = (value: string) =>
	value
		.split("/")
		.filter((segment) => segment.length > 0)
		.map((segment) => encodeURIComponent(segment))
		.join("/");

export const pushIssueBoyJson = async (
	options: PushIssueBoyOptions,
): Promise<PushIssueBoyResult> => {
	const path = normalizePath(options.filePath);
	const baseHeaders = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${options.token}`,
	};
	const detailResponse = await githubFetch(
		`/repos/${options.repoOwner}/${options.repoName}/contents/${path}`,
		{
			params: options.branch ? { ref: options.branch } : undefined,
			init: { headers: baseHeaders },
		},
	);
	let sha: string | undefined;
	if (detailResponse.ok) {
		const detail = (await detailResponse.json()) as { sha?: string };
		sha = detail.sha;
	} else if (detailResponse.status !== 404) {
		return { ok: false, status: detailResponse.status };
	}

	const response = await githubFetch(
		`/repos/${options.repoOwner}/${options.repoName}/contents/${path}`,
		{
			init: {
				method: "PUT",
				headers: {
					...baseHeaders,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					message: options.commitMessage,
					content: encodeBase64(options.jsonContent),
					...(options.branch ? { branch: options.branch } : {}),
					...(sha ? { sha } : {}),
				}),
			},
		},
	);
	if (!response.ok) {
		return { ok: false, status: response.status };
	}
	const data = (await response.json()) as { content?: { sha?: string } };
	return { ok: true, contentSha: data.content?.sha };
};
