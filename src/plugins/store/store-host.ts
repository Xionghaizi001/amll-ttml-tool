import type { RemotePluginCatalogEntryV0 } from "@amll-ttml-tool/plugin-api";
import { themeService } from "$/plugins/adapters/theme-host";
import { installPluginPackage } from "$/plugins/ui/plugin-install-service";
import {
	installStoreArtifact,
	type StoreArtifactInstallPorts,
	type StoreInstallOutcome,
} from "./store-install";

/**
 * Browser assembly of the store install pipeline. Both byte-shaped shelves
 * end in their existing single install gates: installPluginPackage (with its
 * capability grant prompt) for extism-wasm, themeService.importThemePackage
 * (parseThemePackage) for themes. The store never adds a second loader path.
 */

const fetchArtifact = async (path: string): Promise<Uint8Array> => {
	const base = import.meta.env.BASE_URL ?? "/";
	const response = await fetch(`${base}${path}`);
	if (!response.ok)
		throw new Error(`artifact request failed with status ${response.status}`);
	return new Uint8Array(await response.arrayBuffer());
};

const digestSha256 = async (bytes: Uint8Array): Promise<string> => {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		bytes.slice().buffer as ArrayBuffer,
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
};

const storeInstallPorts: StoreArtifactInstallPorts = {
	fetchArtifact,
	digestSha256,
	installFunctionPackage: async (pkg): Promise<StoreInstallOutcome> => {
		const result = await installPluginPackage(pkg, "store");
		if (result.ok) return { ok: true };
		return result.cancelled
			? { ok: false, cancelled: true }
			: { ok: false, message: result.message };
	},
	installThemePackage: async (pkg): Promise<StoreInstallOutcome> => {
		const result = themeService.importThemePackage(pkg);
		if (result.ok) return { ok: true };
		return {
			ok: false,
			message: result.issues
				.map((issue) => `${issue.path || "/"}: ${issue.message}`)
				.join("\n"),
		};
	},
};

/** Store page action: install or update one catalog artifact entry. */
export const installStoreEntry = (
	entry: RemotePluginCatalogEntryV0,
): Promise<StoreInstallOutcome> =>
	installStoreArtifact(entry, storeInstallPorts);
