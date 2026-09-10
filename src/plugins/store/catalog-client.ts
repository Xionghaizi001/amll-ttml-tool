import type { RemotePluginCatalogV0 } from "@amll-ttml-tool/plugin-api";
import { parseRemotePluginCatalog } from "@amll-ttml-tool/plugin-api";

/**
 * Shared same-origin catalog client for the store thin slice. Startup
 * (trusted-js factory/shadow resolution) and the store page consume the same
 * cached fetch. A missing, unreachable or invalid catalog is null — the
 * store is an optional enhancement whose absence must never degrade the
 * editor, so every failure here is silence or a console warning.
 */

const CATALOG_PATH = "plugins/catalog.json";

let cached: Promise<RemotePluginCatalogV0 | null> | null = null;

const fetchCatalogOnce = async (): Promise<RemotePluginCatalogV0 | null> => {
	let response: Response;
	try {
		const base = import.meta.env.BASE_URL ?? "/";
		// no-store keeps kill-switch style catalog changes a refresh away.
		response = await fetch(`${base}${CATALOG_PATH}`, { cache: "no-store" });
	} catch {
		return null;
	}
	if (!response.ok) return null;
	let json: unknown;
	try {
		json = await response.json();
	} catch {
		console.warn("[plugin-store] plugin catalog is not valid JSON; ignored");
		return null;
	}
	const parsed = parseRemotePluginCatalog(json);
	if (!parsed.ok) {
		console.warn(
			"[plugin-store] plugin catalog failed validation; ignored:",
			parsed.issues
				.map((issue) => `${issue.path || "/"}: ${issue.message}`)
				.join("; "),
		);
		return null;
	}
	return parsed.value;
};

export const loadRemotePluginCatalog = (options?: {
	refresh?: boolean;
}): Promise<RemotePluginCatalogV0 | null> => {
	if (options?.refresh || cached === null) cached = fetchCatalogOnce();
	return cached;
};
