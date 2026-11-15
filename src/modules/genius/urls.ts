export const GENIUS_ORIGIN = "https://genius.com";

export function geniusPageKind(path: string): "album" | "song" | undefined {
	if (/^\/albums\/[\w%-]+\/[\w%-]+\/?$/i.test(path)) return "album";
	if (/^\/[\w%-]+-lyrics\/?$/i.test(path)) return "song";
}

export function parseGeniusLink(input: string) {
	try {
		const url = new URL(
			/^(?:www\.)?genius\.com\//i.test(input) ? `https://${input}` : input,
		);
		if (
			!["http:", "https:"].includes(url.protocol) ||
			!["genius.com", "www.genius.com"].includes(url.hostname) ||
			url.username ||
			url.password ||
			url.port
		)
			return;
		const path = url.pathname.replace(/\/$/, "");
		const kind = geniusPageKind(path);
		if (kind) return { path, kind, url: GENIUS_ORIGIN + path };
	} catch {
		// Not a Genius song or album link.
	}
}
