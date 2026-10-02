import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { parseTrustedJsPackage } from "@amll-ttml-tool/plugin-api";
import { unpackPluginContainer } from "$/plugins/store/package-container";
import { installStoreArtifact } from "$/plugins/store/store-install";

const manifest = {
	id: "test.js",
	name: "Test",
	version: "1.0.0",
	apiVersion: 0,
	kind: "function",
	runtime: "trusted-js",
	entry: "index.js",
	capabilities: [],
};
const pkg = {
	packageVersion: 0,
	manifest,
	code: "export function activate() {}",
};
const zip = (source = strToU8(pkg.code)) =>
	zipSync({
		"manifest.json": strToU8(JSON.stringify({ packageVersion: 0, manifest })),
		"assets/index.js": source,
	});

describe("trusted-js installation boundary", () => {
	it("routes zip and JSON to the same semantic gate without executing code", () => {
		for (const bytes of [zip(), strToU8(JSON.stringify(pkg))]) {
			const unpacked = unpackPluginContainer(bytes);
			expect(unpacked).toEqual({ ok: true, kind: "trusted-js", pkg });
			if (unpacked.ok)
				expect(parseTrustedJsPackage(unpacked.pkg).ok).toBe(true);
		}
	});
	it("rejects corrupted UTF-8 instead of changing executable source", () => {
		expect(unpackPluginContainer(zip(new Uint8Array([0xff])))).toMatchObject({
			ok: false,
		});
	});
	it("refuses unavailable execution and mismatched hashes before installation", async () => {
		const install = vi.fn(async () => ({ ok: true as const }));
		const ports = {
			fetchArtifact: vi.fn(async () => zip()),
			digestSha256: async () => "b".repeat(64),
			installThemePackage: install,
		};
		const entry = {
			id: "test.js",
			name: "Test",
			version: "1.0.0",
			apiVersion: 0 as const,
			channel: "trusted-js" as const,
			entry: "test.zip",
			sha256: "a".repeat(64),
		};
		expect(await installStoreArtifact(entry, ports)).toMatchObject({
			ok: false,
		});
		expect(ports.fetchArtifact).not.toHaveBeenCalled();
		expect(
			await installStoreArtifact(entry, {
				...ports,
				installTrustedJsPackage: install,
			}),
		).toMatchObject({ ok: false });
		expect(install).not.toHaveBeenCalled();
		const readyPorts = {
			...ports,
			digestSha256: async () => entry.sha256,
			installTrustedJsPackage: install,
		};
		expect(
			await installStoreArtifact({ ...entry, id: "other.plugin" }, readyPorts),
		).toMatchObject({ ok: false });
		expect(install).not.toHaveBeenCalled();
		expect(await installStoreArtifact(entry, readyPorts)).toEqual({ ok: true });
		expect(install).toHaveBeenCalledExactlyOnceWith(pkg);
	});
});
