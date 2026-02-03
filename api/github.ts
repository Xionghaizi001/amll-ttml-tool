const GITHUB_API_BASE = "https://api.github.com";

const buildTargetUrl = (path: string, query: Record<string, string>) => {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	const url = new URL(normalizedPath, GITHUB_API_BASE);
	Object.entries(query).forEach(([key, value]) => {
		if (key === "path") return;
		url.searchParams.append(key, value);
	});
	return url;
};

const normalizeQuery = (query: Record<string, string | string[] | undefined>) => {
	const result: Record<string, string> = {};
	Object.entries(query).forEach(([key, value]) => {
		if (value === undefined) return;
		if (Array.isArray(value)) {
			if (value.length > 0) {
				result[key] = value[value.length - 1] ?? "";
			}
		} else {
			result[key] = value;
		}
	});
	return result;
};

const buildRequestBody = (body: unknown) => {
	if (body === undefined || body === null) return undefined;
	if (typeof body === "string") return body;
	if (body instanceof Uint8Array) return body;
	return JSON.stringify(body);
};

export default async function handler(
	req: { method?: string; headers: Record<string, string | string[] | undefined>; query: Record<string, string | string[] | undefined>; body?: unknown },
	res: { status: (code: number) => void; setHeader: (key: string, value: string) => void; send: (body: string) => void },
) {
	const rawQuery = normalizeQuery(req.query ?? {});
	const path = rawQuery.path ?? "";
	if (!path) {
		res.status(400);
		res.send("Missing path");
		return;
	}
	const targetUrl = buildTargetUrl(path, rawQuery);
	const method = req.method ?? "GET";
	const headers: Record<string, string> = {
		Accept: String(req.headers.accept ?? "application/vnd.github+json"),
		"User-Agent": String(req.headers["user-agent"] ?? "amll-ttml-tool"),
	};
	const authorization = req.headers.authorization;
	if (authorization) {
		headers.Authorization = String(authorization);
	}
	const contentType = req.headers["content-type"];
	if (contentType) {
		headers["Content-Type"] = String(contentType);
	}
	const body = method === "GET" || method === "HEAD" ? undefined : buildRequestBody(req.body);
	try {
		const response = await fetch(targetUrl.toString(), {
			method,
			headers,
			body,
		});
		const text = await response.text();
		res.status(response.status);
		const responseType = response.headers.get("content-type") ?? "application/json";
		res.setHeader("content-type", responseType);
		res.send(text);
	} catch (error) {
		res.status(502);
		res.send(error instanceof Error ? error.message : "Proxy error");
	}
}
