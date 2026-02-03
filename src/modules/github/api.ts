const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_PROXY_PATH = "/api/github";

type GithubRequestOptions = {
	params?: Record<string, string | number | boolean | undefined>;
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
