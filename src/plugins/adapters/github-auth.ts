import type {
	GithubIdentityV0,
	TrustedJsGithubV0,
} from "@amll-ttml-tool/plugin-sdk-js";
import type { HostResult, HttpResponseV0 } from "@amll-ttml-tool/plugin-api";
import {
	createNetworkService,
	type NetworkServicePorts,
} from "$/platform/network/NetworkService";

const TOKEN_KEY = "amll-host-github-pat";
const failure = (
	code: "invalid-params" | "network-unavailable" | "cancelled",
	message: string,
): HostResult<HttpResponseV0> => ({ ok: false, error: { code, message } });

/** Host-owned credential storage, separate from plugin KV and package snapshots. */
export function createGithubAuth(
	ports: NetworkServicePorts & {
		storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
	},
	signal: AbortSignal,
): TrustedJsGithubV0 {
	const network = createNetworkService(ports);
	let generation = 0;
	let account = new AbortController();
	const resetAccount = () => {
		generation++;
		account.abort();
		account = new AbortController();
	};
	const request = async (
		token: string,
		path: string,
		body?: string,
	): Promise<HostResult<HttpResponseV0>> => {
		if (signal.aborted) return failure("cancelled", "Plugin unloaded");
		try {
			const response = await network.request({
				url: `https://api.github.com${path}`,
				method: body === undefined ? "GET" : "POST",
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${token}`,
					"X-GitHub-Api-Version": "2022-11-28",
					...(body === undefined ? {} : { "Content-Type": "application/json" }),
				},
				body,
				signal: AbortSignal.any([signal, account.signal]),
			});
			return {
				ok: true,
				value: {
					...response,
					headers: Object.fromEntries(response.headers),
					body: new TextDecoder().decode(response.body),
				},
			};
		} catch {
			return failure(
				signal.aborted ? "cancelled" : "network-unavailable",
				"GitHub request unavailable",
			);
		}
	};
	const identity = async (token: string | null): Promise<GithubIdentityV0> => {
		if (signal.aborted) return { status: "cancelled" };
		if (!token) return { status: "missing-token" };
		const current = generation;
		const result = await request(token, "/user");
		if (signal.aborted || current !== generation)
			return { status: "cancelled" };
		if (!result.ok) return { status: "network-error" };
		if (result.value.status === 401) return { status: "invalid-token" };
		if (!result.value.ok)
			return { status: "user-error", code: result.value.status };
		try {
			const user = JSON.parse(result.value.body);
			if (
				typeof user?.login !== "string" ||
				!user.login ||
				!Number.isSafeInteger(user.id) ||
				user.id <= 0
			)
				return { status: "user-missing" };
			return { status: "ok", profile: { login: user.login, id: user.id } };
		} catch {
			return { status: "user-missing" };
		}
	};
	return {
		async authenticate(input) {
			if (
				typeof input !== "string" ||
				!/^[A-Za-z0-9_]{1,255}$/.test(input.trim())
			)
				return { status: "invalid-token" };
			const token = input.trim();
			resetAccount();
			const current = generation;
			const result = await identity(token);
			if (signal.aborted || current !== generation)
				return { status: "cancelled" };
			if (result.status === "ok") ports.storage.setItem(TOKEN_KEY, token);
			return result;
		},
		getIdentity: () => identity(ports.storage.getItem(TOKEN_KEY)),
		logout() {
			ports.storage.removeItem(TOKEN_KEY);
			resetAccount();
		},
		async post(path, body) {
			// Only canonical relative REST paths; encoded separators/dot segments cannot escape the origin.
			if (
				typeof path !== "string" ||
				!/^\/[A-Za-z0-9_./-]+$/.test(path) ||
				path.includes("//") ||
				path.split("/").some((p) => p === "." || p === "..")
			)
				return failure(
					"invalid-params",
					"Expected a GitHub API path without query or fragment",
				);
			let json: string | undefined;
			try {
				json = JSON.stringify(body);
			} catch {
				return failure("invalid-params", "Expected JSON body");
			}
			if (
				json === undefined ||
				new TextEncoder().encode(json).length > 1024 * 1024
			)
				return failure(
					"invalid-params",
					"JSON body exceeds 1 MiB or is missing",
				);
			const token = ports.storage.getItem(TOKEN_KEY);
			if (!token)
				return failure("network-unavailable", "GitHub authentication required");
			return request(token, path, json);
		},
	};
}
