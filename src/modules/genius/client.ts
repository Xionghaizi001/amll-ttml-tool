import { isTauri } from "@tauri-apps/api/core";
import type { GeniusError, GeniusResponse } from "./types";

export class GeniusRequestError extends Error {
	constructor(readonly code: GeniusError) {
		super(code);
	}
}

export async function lookupGenius(
	params: { q: string } | { path: string },
	signal: AbortSignal,
): Promise<GeniusResponse> {
	const endpoint =
		import.meta.env.VITE_GENIUS_API_URL ||
		(isTauri() && import.meta.env.PROD
			? "https://amll-ttml-tool-test.vercel.app/api/genius"
			: "/api/genius");
	const url = new URL(endpoint, window.location.origin);
	url.search = new URLSearchParams(params).toString();
	const response = await fetch(url, { signal });
	const result = await response.json();
	if (!response.ok)
		throw new GeniusRequestError(result?.error ?? "connectionFailed");
	return result;
}
