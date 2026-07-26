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

export type GithubUserProfile = {
	login: string;
	id?: number;
};

export type GithubUserProfileResult =
	| { status: "missing-token" }
	| { status: "invalid-token" }
	| { status: "user-error"; code: number }
	| { status: "user-missing" }
	| { status: "network-error" }
	| { status: "ok"; profile: GithubUserProfile };

const buildHeaders = (token: string) => ({
	Accept: "application/vnd.github+json",
	Authorization: `Bearer ${token}`,
});

/** 身份校验的失败分支（两个结果联合共有的部分）。 */
export type GithubIdentityFailure =
	| Exclude<
			GithubIdentityResult,
			{ status: "authorized" } | { status: "unauthorized" }
	  >
	| Exclude<GithubUserProfileResult, { status: "ok" }>;

/**
 * 失败状态 → i18n key + 兜底中文。
 * 返回 key/fallback 而不是成品文案，调用方各自 t()，避免在服务层依赖 i18n。
 */
export const describeGithubIdentityError = (
	failure: GithubIdentityFailure,
): { key: string; fallback: string; values: Record<string, unknown> } => {
	switch (failure.status) {
		case "missing-token":
			return {
				key: "settings.connect.missingPat",
				fallback: "请先在「连接」中填写 GitHub PAT",
				values: {},
			};
		case "invalid-token":
			return {
				key: "settings.connect.invalidPat",
				fallback: "PAT 无效或已过期，请检查后重试",
				values: {},
			};
		case "user-error":
			return {
				key: "settings.connect.userError",
				fallback: "GitHub 接口返回错误：{code}",
				values: { code: failure.code },
			};
		case "user-missing":
			return {
				key: "settings.connect.userMissing",
				fallback: "无法获取用户信息",
				values: {},
			};
		case "permission-denied":
			return {
				key: "settings.connect.permissionDenied",
				fallback: "PAT 权限不足，无法检查协作者关系",
				values: {},
			};
		default:
			return {
				key: "settings.connect.networkError",
				fallback: "网络请求失败",
				values: {},
			};
	}
};

export const fetchGithubUserProfile = async (
	token: string,
): Promise<GithubUserProfileResult> => {
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
		const userData = (await userResponse.json()) as {
			login?: string;
			id?: number;
		};
		const userLogin = userData.login ?? "";
		if (!userLogin) {
			return { status: "user-missing" };
		}
		const profile: GithubUserProfile = { login: userLogin };
		if (typeof userData.id === "number") {
			profile.id = userData.id;
		}
		return { status: "ok", profile };
	} catch {
		return { status: "network-error" };
	}
};

export const fetchReviewLabels = async (
	token: string,
	repoOwner: string,
	repoName: string,
) => {
	const response = await githubFetch(`/repos/${repoOwner}/${repoName}/labels`, {
		params: { per_page: 100 },
		init: { headers: buildHeaders(token) },
	});
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
		const userResult = await fetchGithubUserProfile(trimmedToken);
		if (userResult.status !== "ok") {
			if (userResult.status === "missing-token") {
				return { status: "missing-token" };
			}
			if (userResult.status === "invalid-token") {
				return { status: "invalid-token" };
			}
			if (userResult.status === "user-error") {
				return { status: "user-error", code: userResult.code };
			}
			if (userResult.status === "user-missing") {
				return { status: "user-missing" };
			}
			return { status: "network-error" };
		}
		const userLogin = userResult.profile.login;

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
