import {
	HTTP_REQUEST_SCHEMA,
	HTTP_REQUEST_MAX_BODY_BYTES_V0,
} from "./schema/schemas";
import { validate } from "./schema/validator";
import type { HttpRequestV0, ParseIssue, ParseResult } from "./types";

/**
 * Headers a plugin may never set through `network.http`. Credentials are a
 * host concern (trust-model red line: identities stay behind host ports), and
 * hop-by-hop / origin-controlled headers belong to the transport.
 */
export const HTTP_FORBIDDEN_REQUEST_HEADERS_V0 = [
	"authorization",
	"cookie",
	"cookie2",
	"proxy-authorization",
	"host",
	"origin",
	"referer",
	"connection",
	"content-length",
	"transfer-encoding",
	"upgrade",
	"via",
] as const;

const forbiddenHeaders = new Set<string>(HTTP_FORBIDDEN_REQUEST_HEADERS_V0);

/**
 * URL policy for plugin HTTP: absolute `https:` only, plus plain-http
 * loopback for local development servers. No credentials in the URL, no
 * other schemes (`file:`, `blob:`, `data:` would bypass the network port).
 */
export const isAllowedHttpRequestUrl = (url: string): boolean => {
	// Keep plugin-api portable to guests without DOM/WHATWG URL globals.
	// Transport performs full URL parsing; this gate accepts a conservative
	// authority syntax and refuses credentials, escapes and control characters.
	// biome-ignore lint/suspicious/noControlCharactersInRegex: explicitly reject URL control characters
	if (/[\\\s\u0000-\u001f\u007f]/.test(url)) return false;
	const match = /^(https?):\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(url);
	if (!match) return false;
	const authority = /^(\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?$/i.exec(
		match[2],
	);
	if (!authority || (authority[2] && Number(authority[2]) > 65535))
		return false;
	const host = authority[1].toLowerCase();
	return (
		match[1].toLowerCase() === "https" ||
		host === "localhost" ||
		host === "127.0.0.1" ||
		host === "[::1]"
	);
};

/**
 * Validates one `network.http` request before it reaches the host transport:
 * schema (shape, caps), URL policy and the forbidden header list. Every host
 * implementation runs this first; there is no unchecked path to `fetch`.
 */
export function parseHttpRequest(input: unknown): ParseResult<HttpRequestV0> {
	const parsed = validate<HttpRequestV0>(HTTP_REQUEST_SCHEMA, input);
	if (!parsed.ok) return parsed;
	const issues: ParseIssue[] = [];
	let bodyBytes = 0;
	for (const character of parsed.value.body ?? "") {
		const point = character.codePointAt(0) ?? 0;
		bodyBytes +=
			point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
	}
	if (bodyBytes > HTTP_REQUEST_MAX_BODY_BYTES_V0)
		issues.push({ path: "/body", message: "body exceeds UTF-8 byte limit" });
	if (!isAllowedHttpRequestUrl(parsed.value.url))
		issues.push({
			path: "/url",
			message: "must be an absolute https URL (or http on localhost)",
		});
	for (const name of Object.keys(parsed.value.headers ?? {})) {
		if (forbiddenHeaders.has(name.toLowerCase()))
			issues.push({
				path: `/headers/${name}`,
				message: "header is reserved for the host",
			});
	}
	return issues.length > 0 ? { ok: false, issues } : parsed;
}
