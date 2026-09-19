import type { RemotePluginCatalogEntryV0 } from "@amll-ttml-tool/plugin-api";
import { parseTrustedJsPackage } from "@amll-ttml-tool/plugin-api";
import semverGt from "semver/functions/gt";
import semverValid from "semver/functions/valid";
import {
	type PluginContainerKind,
	unpackPluginContainer,
} from "./package-container";

/**
 * Store artifact install pipeline: fetch → content-hash verification →
 * container stripping → the existing semantic install gate of the matching
 * tier. All three channels are byte-shaped here: extism-wasm and theme zips
 * as before, and trusted-js zips (manifest.json + assets/<entry>.js) whose
 * source is handed — unevaluated — to the injected `installTrustedJsPackage`
 * port, which must run `parseTrustedJsPackage`, consent and persistence
 * before the single `TrustedJsPluginService.load()` gate. Same-origin
 * catalog entries that point at a bare ES module keep using the loader's
 * import path (`applyTrustedJsUpdate`), not this pipeline.
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
	/**
	 * Persists and activates a trusted-js package through the same loader
	 * gate. Optional until the host wires local trusted-js execution
	 * (goal.md milestone-4 prerequisite 3); without it trusted-js artifacts
	 * are refused before any download.
	 */
	installTrustedJsPackage?(pkg: unknown): Promise<StoreInstallOutcome>;
}

const CHANNEL_CONTAINER_KIND: Record<
	RemotePluginCatalogEntryV0["channel"],
	PluginContainerKind
> = {
	"extism-wasm": "function",
	theme: "theme",
	"trusted-js": "trusted-js",
};

export const installStoreArtifact = async (
	entry: RemotePluginCatalogEntryV0,
	ports: StoreArtifactInstallPorts,
): Promise<StoreInstallOutcome> => {
	const expectedKind = CHANNEL_CONTAINER_KIND[entry.channel];
	if (expectedKind === undefined)
		return {
			ok: false,
			message: `channel ${entry.channel} is not installed through artifacts`,
		};
	const installTrustedJs = ports.installTrustedJsPackage;
	if (expectedKind === "trusted-js" && installTrustedJs === undefined)
		return {
			ok: false,
			message: "trusted-js installation is unavailable on this host",
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
	if (unpacked.kind !== expectedKind)
		return {
			ok: false,
			message: `artifact is a ${unpacked.kind} package but the catalog entry is ${entry.channel}`,
		};
	switch (unpacked.kind) {
		case "trusted-js":
			{
				const parsed = parseTrustedJsPackage(unpacked.pkg);
				if (!parsed.ok)
					return { ok: false, message: "invalid trusted-js package" };
				if (
					parsed.value.manifest.id !== entry.id ||
					parsed.value.manifest.version !== entry.version ||
					parsed.value.manifest.apiVersion !== entry.apiVersion
				)
					return {
						ok: false,
						message:
							"trusted-js manifest does not match catalog identity/version",
					};
			}
			return (installTrustedJs as NonNullable<typeof installTrustedJs>)(
				unpacked.pkg,
			);
		case "function":
			return ports.installFunctionPackage(unpacked.pkg);
		default:
			return ports.installThemePackage(unpacked.pkg);
	}
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
