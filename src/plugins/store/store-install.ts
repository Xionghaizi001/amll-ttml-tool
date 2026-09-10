import type { RemotePluginCatalogEntryV0 } from "@amll-ttml-tool/plugin-api";
import semverGt from "semver/functions/gt";
import semverValid from "semver/functions/valid";
import { unpackPluginContainer } from "./package-container";

/**
 * Store artifact install pipeline for the byte-shaped shelves (extism-wasm
 * and theme): fetch → content-hash verification → container stripping →
 * the existing semantic install gate. trusted-js entries never come through
 * here — they are ES modules loaded by TrustedJsPluginService.
 */

export type StoreInstallOutcome =
	| { ok: true }
	| { ok: false; cancelled?: boolean; message?: string };

export interface StoreArtifactInstallPorts {
	/** Fetches a same-origin catalog-relative artifact path. */
	fetchArtifact(path: string): Promise<Uint8Array>;
	digestSha256(bytes: Uint8Array): Promise<string>;
	/** The single WASM package install gate (installPluginPackage). */
	installFunctionPackage(pkg: unknown): Promise<StoreInstallOutcome>;
	/** The single theme package install gate (themeService.importThemePackage). */
	installThemePackage(pkg: unknown): Promise<StoreInstallOutcome>;
}

export const installStoreArtifact = async (
	entry: RemotePluginCatalogEntryV0,
	ports: StoreArtifactInstallPorts,
): Promise<StoreInstallOutcome> => {
	if (entry.channel !== "extism-wasm" && entry.channel !== "theme")
		return {
			ok: false,
			message: `channel ${entry.channel} is not installed through artifacts`,
		};
	let bytes: Uint8Array;
	try {
		bytes = await ports.fetchArtifact(entry.entry);
	} catch (error) {
		return {
			ok: false,
			message: `artifact download failed: ${String(
				error instanceof Error ? error.message : error,
			)}`,
		};
	}
	if (entry.sha256 !== undefined) {
		// Content-addressing red line: the catalog names the exact bytes it
		// distributes; anything else is rejected before any parsing runs.
		const digest = (await ports.digestSha256(bytes)).toLowerCase();
		if (digest !== entry.sha256)
			return {
				ok: false,
				message: `artifact content hash mismatch for ${entry.id}`,
			};
	}
	const unpacked = unpackPluginContainer(bytes);
	if (!unpacked.ok) return { ok: false, message: unpacked.message };
	const expectedKind = entry.channel === "extism-wasm" ? "function" : "theme";
	if (unpacked.kind !== expectedKind)
		return {
			ok: false,
			message: `artifact is a ${unpacked.kind} package but the catalog entry is ${entry.channel}`,
		};
	return unpacked.kind === "function"
		? ports.installFunctionPackage(unpacked.pkg)
		: ports.installThemePackage(unpacked.pkg);
};

/** True when the catalog version is strictly newer than the installed one. */
export const isStoreUpdateAvailable = (
	catalogVersion: string,
	installedVersion: string | null,
): boolean =>
	installedVersion !== null &&
	semverValid(catalogVersion) !== null &&
	semverValid(installedVersion) !== null &&
	semverGt(catalogVersion, installedVersion);
