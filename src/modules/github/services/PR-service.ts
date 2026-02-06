import { githubFetch } from "../api";

const REPO_OWNER = "amll-dev";
const REPO_NAME = "amll-ttml-db";

export type PendingUpdatePullRequest = {
	number: number;
	title: string;
	htmlUrl: string;
};

export type PullRequestDetail = {
	number: number;
	title: string;
	body: string;
	createdAt: string;
	labels: Array<{ name: string; color: string }>;
	htmlUrl?: string;
	headSha?: string | null;
};

export const fetchPendingUpdatePullRequest = async (
	token: string,
	login: string
): Promise<PendingUpdatePullRequest | null> => {
	const trimmedLogin = login.trim();
	if (!token.trim() || !trimmedLogin) return null;
	const headers = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
	};
	const response = await githubFetch("/search/issues", {
		params: {
			q: `repo:amll-dev/amll-ttml-db is:pr is:open label:"待更新" mentions:${trimmedLogin}`,
			per_page: 1,
			sort: "updated",
			order: "desc",
		},
		init: { headers },
	});
	if (!response.ok) return null;
	const data = (await response.json()) as {
		items?: Array<{
			number: number;
			title: string;
			html_url: string;
		}>;
	};
	const item = data.items?.[0];
	if (!item) return null;
	return {
		number: item.number,
		title: item.title,
		htmlUrl: item.html_url,
	};
};

export const fetchOpenPullRequestPage = async (options: {
	token: string;
	perPage: number;
	page: number;
	etag?: string | null;
}) => {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${options.token}`,
	};
	if (options.etag) {
		headers["If-None-Match"] = options.etag;
	}
	return githubFetch(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls`, {
		params: {
			state: "open",
			per_page: options.perPage,
			page: options.page,
		},
		init: { headers },
	});
};

export const fetchPullRequestDetail = async (options: {
	token: string;
	prNumber: number;
}): Promise<PullRequestDetail | null> => {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${options.token}`,
	};
	const response = await githubFetch(
		`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${options.prNumber}`,
		{
			init: { headers },
		},
	);
	if (!response.ok) {
		return null;
	}
	const detail = (await response.json()) as {
		number: number;
		title: string;
		body?: string | null;
		created_at: string;
		html_url?: string;
		head?: { sha?: string | null };
		labels?: Array<{ name: string; color: string }>;
	};
	return {
		number: detail.number,
		title: detail.title ?? "",
		body: detail.body ?? "",
		createdAt: detail.created_at,
		htmlUrl: detail.html_url,
		headSha: detail.head?.sha ?? null,
		labels:
			detail.labels?.map((label) => ({
				name: label.name,
				color: label.color,
			})) ?? [],
	};
};

export const fetchPullRequestComments = async (options: {
	token: string;
	prNumber: number;
	since?: string;
}) => {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${options.token}`,
	};
	const response = await githubFetch(
		`/repos/${REPO_OWNER}/${REPO_NAME}/issues/${options.prNumber}/comments`,
		{
			params: { per_page: 100, since: options.since },
			init: { headers },
		},
	);
	if (!response.ok) {
		throw new Error("load-pr-comments-failed");
	}
	return (await response.json()) as Array<{
		body?: string | null;
		user?: { login?: string | null };
	}>;
};

export const mergePullRequest = async (options: {
	token: string;
	prNumber: number;
	mergeMethod?: "merge" | "squash" | "rebase";
}) =>
	githubFetch(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${options.prNumber}/merge`, {
		init: {
			method: "PUT",
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${options.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				merge_method: options.mergeMethod ?? "squash",
			}),
		},
	});

export const fetchPullRequestStatus = async (options: {
	token: string;
	prNumber: number;
}) => {
	const detail = await fetchPullRequestDetail(options);
	if (!detail) {
		throw new Error("load-pr-detail-failed");
	}
	return {
		headSha: detail.headSha ?? null,
		prUrl:
			detail.htmlUrl ??
			`https://github.com/${REPO_OWNER}/${REPO_NAME}/pull/${options.prNumber}`,
	};
};
