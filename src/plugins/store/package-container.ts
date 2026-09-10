import { unzipSync } from "fflate";

/**
 * Container stripping for store-distributed plugin artifacts. Two container
 * formats exist by design (goal.md stage 10): hand-written base64-JSON for
 * local settings-page imports, and zip for store distribution. Both paths
 * only peel the container here — the produced package object always flows
 * into the single semantic trust boundary (parseFunctionPluginPackage /
 * parseThemePackage); this module never validates manifest semantics.
 *
 * Fixed zip layout: `manifest.json` at the root (the package JSON without
 * binary payloads) plus `assets/<name>` binary entries. The entry allowlist
 * is derived from the manifest, expanded sizes are capped before inflation,
 * and duplicate or path-escaping entries reject the whole container.
 */

export const PLUGIN_CONTAINER_LIMITS = {
	/** Raw container input bytes (zip or JSON text). */
	maxContainerBytes: 48 * 1024 * 1024,
	/** Sum of declared uncompressed sizes across all zip entries. */
	maxTotalUnpackedBytes: 64 * 1024 * 1024,
	/** One zip entry's declared uncompressed size (wasm modules cap at 32 MiB). */
	maxEntryBytes: 33 * 1024 * 1024,
	/** The root manifest.json descriptor. */
	maxManifestBytes: 4 * 1024 * 1024,
	maxEntries: 64,
} as const;

export type PluginContainerKind = "function" | "theme";

export type PluginContainerResult =
	| { ok: true; kind: PluginContainerKind; pkg: unknown }
	| { ok: false; message: string };

const failed = (message: string): PluginContainerResult => ({
	ok: false,
	message,
});

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/**
 * Container format is decided by magic bytes (PK\x03\x04 vs a leading `{`),
 * never by file extension or user choice.
 */
export const detectPluginContainerFormat = (
	bytes: Uint8Array,
): "zip" | "json" | "unknown" => {
	if (
		bytes.length >= ZIP_MAGIC.length &&
		ZIP_MAGIC.every((byte, index) => bytes[index] === byte)
	)
		return "zip";
	for (const byte of bytes) {
		// Skip UTF-8 BOM and ASCII whitespace before the first JSON character.
		if (
			byte === 0xef ||
			byte === 0xbb ||
			byte === 0xbf ||
			byte === 0x20 ||
			byte === 0x09 ||
			byte === 0x0a ||
			byte === 0x0d
		)
			continue;
		return byte === 0x7b ? "json" : "unknown";
	}
	return "unknown";
};

const BASE64_CHUNK = 0x8000;

const bytesToBase64 = (bytes: Uint8Array): string => {
	let binary = "";
	for (let index = 0; index < bytes.length; index += BASE64_CHUNK) {
		binary += String.fromCharCode(
			...bytes.subarray(index, index + BASE64_CHUNK),
		);
	}
	return btoa(binary);
};

class ContainerEntryError extends Error {}

const isDirectoryMarker = (name: string): boolean => name.endsWith("/");

const validateEntryName = (name: string): void => {
	if (name.length === 0)
		throw new ContainerEntryError("zip contains an entry with an empty name");
	if (name.includes("\\"))
		throw new ContainerEntryError(
			`zip entry "${name}" uses backslash separators`,
		);
	if (name.startsWith("/"))
		throw new ContainerEntryError(`zip entry "${name}" is an absolute path`);
	const segments = name.split("/");
	if (segments.some((segment) => segment === "." || segment === ".."))
		throw new ContainerEntryError(`zip entry "${name}" contains dot segments`);
	if (!isDirectoryMarker(name) && segments.some((segment) => segment === ""))
		throw new ContainerEntryError(`zip entry "${name}" has empty segments`);
};

interface ManifestDescriptor {
	kind: PluginContainerKind;
	descriptor: Record<string, unknown>;
	manifest: Record<string, unknown>;
}

const readDescriptor = (bytes: Uint8Array): ManifestDescriptor => {
	if (bytes.length > PLUGIN_CONTAINER_LIMITS.maxManifestBytes)
		throw new ContainerEntryError("manifest.json exceeds the size limit");
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new ContainerEntryError("manifest.json is not valid JSON");
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
		throw new ContainerEntryError("manifest.json must be a JSON object");
	const descriptor = parsed as Record<string, unknown>;
	const manifest = descriptor.manifest;
	if (
		typeof manifest !== "object" ||
		manifest === null ||
		Array.isArray(manifest)
	)
		throw new ContainerEntryError("manifest.json is missing a manifest object");
	const kind = (manifest as Record<string, unknown>).kind;
	if (kind !== "function" && kind !== "theme")
		throw new ContainerEntryError(
			`manifest kind must be "function" or "theme", got ${JSON.stringify(kind)}`,
		);
	return {
		kind,
		descriptor,
		manifest: manifest as Record<string, unknown>,
	};
};

const assembleFunctionPackage = (
	{ descriptor, manifest }: ManifestDescriptor,
	files: Map<string, Uint8Array>,
): PluginContainerResult => {
	const entry = manifest.entry;
	if (typeof entry !== "string" || entry.length === 0)
		return failed("function manifest is missing an entry file name");
	const assetPath = `assets/${entry}`;
	const wasm = files.get(assetPath);
	if (wasm === undefined)
		return failed(`zip is missing the wasm entry ${assetPath}`);
	const extras = [...files.keys()].filter(
		(name) => name !== "manifest.json" && name !== assetPath,
	);
	if (extras.length > 0)
		return failed(
			`zip contains entries outside the fixed layout: ${extras.join(", ")}`,
		);
	return {
		ok: true,
		kind: "function",
		pkg: {
			...descriptor,
			manifest,
			wasm: bytesToBase64(wasm),
		},
	};
};

const assembleThemePackage = (
	{ descriptor, manifest }: ManifestDescriptor,
	files: Map<string, Uint8Array>,
): PluginContainerResult => {
	const declaredAssets = descriptor.assets;
	const assetNames: string[] = [];
	const mergedAssets: Record<string, unknown> = {};
	if (declaredAssets !== undefined) {
		if (
			typeof declaredAssets !== "object" ||
			declaredAssets === null ||
			Array.isArray(declaredAssets)
		)
			return failed("theme descriptor assets must be an object");
		for (const [name, value] of Object.entries(declaredAssets)) {
			assetNames.push(name);
			const bytes = files.get(`assets/${name}`);
			if (bytes === undefined)
				return failed(`zip is missing the theme asset assets/${name}`);
			mergedAssets[name] = {
				...(typeof value === "object" && value !== null ? value : {}),
				data: bytesToBase64(bytes),
			};
		}
	}
	const expected = new Set([
		"manifest.json",
		...assetNames.map((name) => `assets/${name}`),
	]);
	const extras = [...files.keys()].filter((name) => !expected.has(name));
	if (extras.length > 0)
		return failed(
			`zip contains entries outside the fixed layout: ${extras.join(", ")}`,
		);
	return {
		ok: true,
		kind: "theme",
		pkg: {
			...descriptor,
			manifest,
			...(assetNames.length > 0 ? { assets: mergedAssets } : {}),
		},
	};
};

const unpackZipContainer = (bytes: Uint8Array): PluginContainerResult => {
	const seen = new Set<string>();
	let totalBytes = 0;
	let entryCount = 0;
	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(bytes, {
			filter: (file) => {
				validateEntryName(file.name);
				if (seen.has(file.name))
					throw new ContainerEntryError(
						`zip contains duplicate entry "${file.name}"`,
					);
				seen.add(file.name);
				if (isDirectoryMarker(file.name)) return false;
				entryCount += 1;
				if (entryCount > PLUGIN_CONTAINER_LIMITS.maxEntries)
					throw new ContainerEntryError("zip contains too many entries");
				if (file.originalSize > PLUGIN_CONTAINER_LIMITS.maxEntryBytes)
					throw new ContainerEntryError(
						`zip entry "${file.name}" exceeds the size limit`,
					);
				totalBytes += file.originalSize;
				if (totalBytes > PLUGIN_CONTAINER_LIMITS.maxTotalUnpackedBytes)
					throw new ContainerEntryError(
						"zip expands beyond the total size limit",
					);
				return true;
			},
		});
	} catch (error) {
		if (error instanceof ContainerEntryError) return failed(error.message);
		return failed("zip archive is corrupt or unsupported");
	}
	const fileMap = new Map(Object.entries(files));
	const manifestBytes = fileMap.get("manifest.json");
	if (manifestBytes === undefined)
		return failed("zip is missing manifest.json at the archive root");
	let descriptor: ManifestDescriptor;
	try {
		descriptor = readDescriptor(manifestBytes);
	} catch (error) {
		if (error instanceof ContainerEntryError) return failed(error.message);
		throw error;
	}
	return descriptor.kind === "function"
		? assembleFunctionPackage(descriptor, fileMap)
		: assembleThemePackage(descriptor, fileMap);
};

const unpackJsonContainer = (bytes: Uint8Array): PluginContainerResult => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return failed("package file is not valid JSON");
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
		return failed("package JSON must be an object");
	const manifest = (parsed as Record<string, unknown>).manifest;
	const kind =
		typeof manifest === "object" &&
		manifest !== null &&
		!Array.isArray(manifest)
			? (manifest as Record<string, unknown>).kind
			: undefined;
	if (kind !== "function" && kind !== "theme")
		return failed(
			`manifest kind must be "function" or "theme", got ${JSON.stringify(kind)}`,
		);
	return { ok: true, kind, pkg: parsed };
};

/**
 * Peels a plugin artifact container (zip or JSON, decided by magic bytes)
 * into the package object expected by the semantic parse gates. Never
 * validates package semantics — callers must still run the result through
 * parseFunctionPluginPackage / parseThemePackage.
 */
export const unpackPluginContainer = (
	bytes: Uint8Array,
): PluginContainerResult => {
	if (bytes.length > PLUGIN_CONTAINER_LIMITS.maxContainerBytes)
		return failed("plugin artifact exceeds the container size limit");
	const format = detectPluginContainerFormat(bytes);
	if (format === "zip") return unpackZipContainer(bytes);
	if (format === "json") return unpackJsonContainer(bytes);
	return failed("unrecognized plugin artifact format (expected zip or JSON)");
};
