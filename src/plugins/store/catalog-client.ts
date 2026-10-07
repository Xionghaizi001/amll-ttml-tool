import type { RemotePluginCatalogV0 } from "@amll-ttml-tool/plugin-api";
import { StoreProviderClient } from "./store-providers";

const origin =
	typeof window === "undefined" ? "http://localhost/" : window.location.href;
const base = new URL(import.meta.env.BASE_URL ?? "/", origin);
let storage: Storage | undefined;
try {
	storage = globalThis.localStorage;
} catch {
	/* Session cache only. */
}
export const storeProviderClient = new StoreProviderClient(
	{
		id: "official",
		name: "官方商店",
		catalogUrl: new URL("plugins/catalog.json", base).href,
		official: true,
	},
	storage,
);
let snapshot: RemotePluginCatalogV0 | null = null;
const rebuild = () => {
	const shelf = storeProviderClient.list()[0];
	// Only official entries enter automatic runtime/factory resolution.
	snapshot = shelf?.catalog
		? {
				catalogVersion: 0,
				plugins: shelf.catalog.plugins.map((entry) => ({
					...entry,
					entry: new URL(entry.entry, shelf.provider.catalogUrl).href,
				})),
			}
		: null;
};
rebuild();
storeProviderClient.subscribe(rebuild);
export const getRemotePluginCatalogSnapshot = () => snapshot;
export const subscribeRemotePluginCatalog = storeProviderClient.subscribe;
/** Ordinary reads use the local snapshot; only the user's refresh contacts providers. */
export const loadRemotePluginCatalog = async (options?: {
	refresh?: boolean;
}): Promise<RemotePluginCatalogV0 | null> => {
	if (options?.refresh) await storeProviderClient.refresh();
	return snapshot;
};
