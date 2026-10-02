import type { RemotePluginCatalogEntryV0 } from "@amll-ttml-tool/plugin-api";
import { themeService } from "$/plugins/adapters/theme-host";
import { installTrustedJsPackage } from "$/plugins/trusted/trusted-js-host";
import {
	installStoreArtifact,
	type StoreArtifactInstallPorts,
	type StoreInstallOutcome,
} from "./store-install";

/** Browser assembly of the shared trusted-js and theme install gates. */

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
	installTrustedJsPackage: (pkg) => installTrustedJsPackage(pkg, "store"),
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
