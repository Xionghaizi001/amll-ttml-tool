import type { IncomingMessage, ServerResponse } from "node:http";
import { Impit } from "impit";
import {
	type GeniusResult,
	parseGeniusAlbum,
	parseGeniusSong,
} from "../src/modules/genius/parser";
import type { GeniusError, GeniusResponse } from "../src/modules/genius/types";
import { GENIUS_ORIGIN, parseGeniusLink } from "../src/modules/genius/urls";

const client = new Impit({
	browser: "firefox",
	timeout: 10_000,
	followRedirects: false,
});

function searchResults(data: unknown): GeniusResult[] {
	const payload = data as {
		response?: {
			sections?: {
				type: string;
				hits?: { result?: Record<string, unknown> }[];
			}[];
		};
	};
	const results = new Map<string, GeniusResult>();
	for (const section of payload?.response?.sections ?? []) {
		if (section.type !== "song" && section.type !== "album") continue;
		for (const { result } of section.hits ?? []) {
			if (!result || typeof result.url !== "string") continue;
			const link = parseGeniusLink(result.url);
			if (link?.kind !== section.type) continue;
			const title = link.kind === "song" ? result.title : result.name;
			const artist = result.artist_names ?? result.primary_artist_names;
			if (typeof title !== "string") continue;
			results.set(link.path, {
				kind: link.kind,
				path: link.path,
				title,
				artist: typeof artist === "string" ? artist : undefined,
			});
		}
	}
	return [...results.values()].slice(0, 30);
}

export default async function geniusHandler(
	req: IncomingMessage,
	res: ServerResponse,
) {
	const send = (
		status: number,
		data: GeniusResponse | { error: GeniusError },
	) => {
		res.statusCode = status;
		res.setHeader("Content-Type", "application/json; charset=utf-8");
		res.setHeader("X-Content-Type-Options", "nosniff");
		res.setHeader("Cache-Control", "no-store");
		// Packaged desktop builds read this public endpoint from the Tauri origin.
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.end(JSON.stringify(data));
	};

	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");
		return send(405, { error: "invalidInput" });
	}

	const params = new URL(req.url ?? "/", "http://localhost").searchParams;
	const q = params.get("q")?.trim();
	const path = params.get("path");
	const link =
		path && path.length <= 512 && path.startsWith("/")
			? parseGeniusLink(GENIUS_ORIGIN + path)
			: undefined;
	if (q ? q.length > 200 || path !== null : !link) {
		return send(400, { error: "invalidInput" });
	}

	try {
		let target = link;
		const url =
			target?.url ??
			`${GENIUS_ORIGIN}/api/search/multi?${new URLSearchParams({ q: q ?? "" })}`;
		let response = await client.fetch(url);
		if (target && [301, 302, 303, 307, 308].includes(response.status)) {
			const location = response.headers.get("location");
			const redirect =
				location && parseGeniusLink(new URL(location, target.url).href);
			if (redirect && redirect.kind === target.kind) {
				target = redirect;
				response = await client.fetch(target.url);
			}
		}
		if (
			response.headers.get("cf-mitigated") === "challenge" ||
			response.status === 403 ||
			response.status === 429
		) {
			return send(503, { error: "unavailable" });
		}
		if (!response.ok) return send(502, { error: "connectionFailed" });
		if (!target)
			return send(200, {
				kind: "search",
				results: searchResults(await response.json()),
			});

		const html = await response.text();
		if (target.kind === "album") {
			return send(200, { kind: "album", results: parseGeniusAlbum(html) });
		}
		const song = parseGeniusSong(html);
		if (!song.lyrics.length) return send(404, { error: "noLyrics" });
		return send(200, { kind: "song", ...song });
	} catch (cause) {
		return send(
			cause instanceof Error && cause.name === "TimeoutError" ? 504 : 502,
			{
				error: "connectionFailed",
			},
		);
	}
}
