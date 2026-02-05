const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_PROXY_PATH = "/api/github";

type GithubRequestOptions = {
	params?: Record<string, string | number | boolean | undefined>;
	init?: RequestInit;
};

type GithubRawOptions = {
	init?: RequestInit;
};

const shouldUseProxy = () =>
	import.meta.env.PROD && !import.meta.env.TAURI_ENV_PLATFORM;

const buildGithubUrl = (
	path: string,
	params?: Record<string, string | number | boolean | undefined>,
) => {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	const apiUrl = new URL(normalizedPath, GITHUB_API_BASE);
	if (params) {
		Object.entries(params).forEach(([key, value]) => {
			if (value === undefined) return;
			apiUrl.searchParams.append(key, String(value));
		});
	}
	if (!shouldUseProxy()) {
		return apiUrl;
	}
	const proxyUrl = new URL(GITHUB_PROXY_PATH, window.location.origin);
	proxyUrl.searchParams.set("path", apiUrl.pathname);
	apiUrl.searchParams.forEach((value, key) => {
		proxyUrl.searchParams.append(key, value);
	});
	return proxyUrl;
};

export const githubFetch = (path: string, options: GithubRequestOptions = {}) => {
	const url = buildGithubUrl(path, options.params);
	return fetch(url.toString(), options.init);
};

export const githubFetchRaw = (rawUrl: string, options: GithubRawOptions = {}) => {
	if (!shouldUseProxy()) {
		return fetch(rawUrl, options.init);
	}
	const proxyUrl = new URL(GITHUB_PROXY_PATH, window.location.origin);
	proxyUrl.searchParams.set("url", rawUrl);
	return fetch(proxyUrl.toString(), options.init);
};

export type PendingUpdatePullRequest = {
	number: number;
	title: string;
	htmlUrl: string;
};

export const fetchPendingUpdatePullRequest = async (
	token: string,
	login: string,
): Promise<PendingUpdatePullRequest | null> => {
	const trimmedLogin = login.trim();
	if (!token.trim() || !trimmedLogin) return null;
	const headers = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
	};
	const response = await githubFetch("/search/issues", {
		params: {
			q: `repo:Steve-xmh/amll-ttml-db is:pr is:open label:"待更新" mentions:${trimmedLogin}`,
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

export type GithubGistResponse = {
	id: string;
	html_url: string;
	files?: Record<string, { raw_url?: string | null }>;
};

export const createGithubGist = async (
	token: string,
	payload: {
		description: string;
		isPublic: boolean;
		files: Record<string, { content: string }>;
	},
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
