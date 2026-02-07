import { githubFetch } from "$/modules/github/api";
import type { ReviewLabel } from "$/modules/settings/states";

export type GithubIdentityResult =
	| { status: "missing-token" }
	| { status: "invalid-token" }
	| { status: "user-error"; code: number }
	| { status: "user-missing" }
	| { status: "permission-denied" }
	| { status: "authorized"; login: string; labels: ReviewLabel[] }
	| { status: "unauthorized"; login: string }
	| { status: "network-error" };

const buildHeaders = (token: string) => ({
	Accept: "application/vnd.github+json",
	Authorization: `Bearer ${token}`,
});

export const fetchReviewLabels = async (
	token: string,
	repoOwner: string,
	repoName: string,
) => {
	const response = await githubFetch(
		`/repos/${repoOwner}/${repoName}/labels`,
		{
			params: { per_page: 100 },
			init: { headers: buildHeaders(token) },
		},
	);
	if (!response.ok) {
		return [];
	}
	const data = (await response.json()) as ReviewLabel[];
	return [...data].sort((a, b) => a.name.localeCompare(b.name));
};

export const verifyGithubAccess = async (
	token: string,
	repoOwner: string,
	repoName: string,
): Promise<GithubIdentityResult> => {
	const trimmedToken = token.trim();
	if (!trimmedToken) {
		return { status: "missing-token" };
	}
	try {
		const userResponse = await githubFetch("/user", {
			init: { headers: buildHeaders(trimmedToken) },
		});
		if (!userResponse.ok) {
			if (userResponse.status === 401) {
				return { status: "invalid-token" };
			}
			return { status: "user-error", code: userResponse.status };
		}
		const userData = (await userResponse.json()) as { login?: string };
		const userLogin = userData.login ?? "";
		if (!userLogin) {
			return { status: "user-missing" };
		}

		const isOwner = userLogin.toLowerCase() === repoOwner.toLowerCase();

		const collaboratorResponse = await githubFetch(
			`/repos/${repoOwner}/${repoName}/collaborators/${userLogin}`,
			{ init: { headers: buildHeaders(trimmedToken) } },
		);
		const isCollaborator = collaboratorResponse.status === 204;
		const allowed = isOwner || isCollaborator;

		if (!allowed) {
			return { status: "unauthorized", login: userLogin };
		}

		const labels = await fetchReviewLabels(trimmedToken, repoOwner, repoName);
		return { status: "authorized", login: userLogin, labels };
	} catch {
		return { status: "network-error" };
	}
};
