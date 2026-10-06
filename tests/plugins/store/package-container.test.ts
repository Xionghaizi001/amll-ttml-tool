import { parseTrustedJsPackage } from "@amll-ttml-tool/plugin-api";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import type { ThemeServiceState } from "$/kernel/theme/types";
import type { StoredTrustedJsRecord } from "$/platform/storage/IndexedDbTrustedJsStorage";
import { unpackPluginContainer } from "$/plugins/store/package-container";
import {
	type InstallationPorts,
	installStoreArtifact,
	PluginInstallationService,
} from "$/plugins/store/store-install";

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

// Unified installation directory contracts.

const installationFixture = () => {
	const record = {
		id: "example.plugin",
		manifest: {
			id: "example.plugin",
			name: "Updated",
			version: "2.0.0",
			apiVersion: 0,
		},
		code: new Blob(["code"]),
		sha256: "abc",
		source: "user",
		installedAt: 123,
	} as StoredTrustedJsRecord;
	const listeners = new Set<() => void>();
	const calls: unknown[][] = [];
	const ports: InstallationPorts = {
		factory: () => [
			{
				id: "example.plugin",
				name: "Factory",
				version: "1.0.0",
				apiVersion: 0,
				entry: "factory",
				firstParty: true,
			},
		],
		installed: () => [record],
		loaded: () => [],
		state: () => ({ disabled: true, crashes: 0, pending: false }),
		pinned: () => false,
		themes: () => [
			{
				id: "example.plugin",
				name: "Theme",
				version: "1.0.0",
				source: "installed",
				appearance: "both",
			},
		],
		themeState: () =>
			({
				activeThemeId: "example.plugin",
				previewThemeId: null,
				safeMode: false,
			}) as ThemeServiceState,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		setEnabled: async (...args) => {
			calls.push(["enable", ...args]);
		},
		uninstall: async (...args) => {
			calls.push(["uninstall", ...args]);
		},
		revertToFactory: async (id) => {
			calls.push(["revert", id]);
		},
		reauthorize: async (id) => {
			calls.push(["reauthorize", id]);
		},
	};
	return {
		ports,
		calls,
		listeners,
		service: new PluginInstallationService(ports),
	};
};

describe("PluginInstallationService", () => {
	it("keeps disabled installed packages and separates theme/function identities without exposing payloads", () => {
		const { service } = installationFixture();
		const list = service.list();
		expect(list).toHaveLength(2);
		expect(list[0]).toMatchObject({
			kind: "function",
			runtime: "trusted-js",
			name: "Updated",
			version: "2.0.0",
			source: "user",
			enabled: false,
			artifact: { sha256: "abc" },
			installedAt: 123,
			trustedJs: {
				loaded: false,
				hasFactory: true,
				hasInstalledPackage: true,
				status: "disabled",
			},
		});
		expect(list[0]).not.toHaveProperty("code");
		expect(list[0]).not.toHaveProperty("manifest");
		expect(list[1]).toMatchObject({
			id: "example.plugin",
			kind: "theme",
			runtime: "none",
			source: "unknown",
			enabled: true,
			theme: { active: true },
		});
	});
	it("reports the live factory fallback while preserving the installed update identity", () => {
		const { ports, service } = installationFixture();
		ports.loaded = () => [
			{
				id: "example.plugin",
				name: "Factory",
				version: "1.0.0",
				bundled: true,
				firstParty: true,
			},
		];
		expect(service.list()[0]).toMatchObject({
			name: "Factory",
			version: "1.0.0",
			source: "builtin",
			artifact: undefined,
			installedAt: undefined,
			trustedJs: {
				loaded: true,
				bundled: true,
				hasInstalledPackage: true,
				installedPackage: {
					version: "2.0.0",
					source: "user",
					artifact: { sha256: "abc" },
				},
			},
		});
	});
	it("projects crash disable and theme safe mode without merging their state machines", () => {
		const { ports, service } = installationFixture();
		ports.state = () => ({ crashes: 3, pending: false });
		ports.themeState = () =>
			({
				activeThemeId: "example.plugin",
				previewThemeId: null,
				safeMode: true,
			}) as ThemeServiceState;
		const list = service.list();
		expect(list[0]).toMatchObject({
			enabled: false,
			trustedJs: { status: "crash-disabled" },
		});
		expect(list[1]).toMatchObject({
			enabled: false,
			theme: { active: true, safeMode: true },
		});
	});
	it("adds loaded store-only entries and honors factory pins for inactive updates", () => {
		const { ports, service } = installationFixture();
		ports.pinned = () => true;
		ports.loaded = () => [
			{
				id: "store.plugin",
				name: "Remote",
				version: "1.2.0",
				bundled: false,
				firstParty: false,
			},
		];
		const list = service.list();
		expect(list[0]).toMatchObject({
			source: "builtin",
			version: "1.0.0",
			trustedJs: { pinnedToFactory: true },
		});
		expect(list.find((item) => item.id === "store.plugin")).toMatchObject({
			source: "store",
			trustedJs: {
				loaded: true,
				hasInstalledPackage: false,
				hasFactory: false,
			},
		});
	});
	it("delegates operations with kind and releases the common subscription", async () => {
		const { service, calls, listeners } = installationFixture();
		let updates = 0;
		const dispose = service.subscribe(() => {
			updates++;
		});
		for (const listener of listeners) listener();
		expect(updates).toBe(1);
		dispose();
		expect(listeners.size).toBe(0);
		await service.setEnabled("theme", "same", true);
		await service.uninstall("function", "same");
		await service.revertToFactory("same");
		await service.reauthorize("same");
		expect(calls).toEqual([
			["enable", "theme", "same", true],
			["uninstall", "function", "same"],
			["revert", "same"],
			["reauthorize", "same"],
		]);
	});
});

describe("installation directory identity and disabled remote modules", () => {
	it("retains a disabled package-less module and removes it after its loader state is forgotten", () => {
		const { ports, service } = installationFixture();
		ports.loaded = () => [
			{
				id: "remote.only",
				name: "Remote",
				version: "1.0.0",
				bundled: false,
				firstParty: false,
			},
		];
		expect(service.list().some((item) => item.id === "remote.only")).toBe(true);
		ports.loaded = () => [];
		expect(
			service.list().find((item) => item.id === "remote.only"),
		).toMatchObject({
			trustedJs: { loaded: false, status: "disabled" },
			enabled: false,
		});
		ports.state = () => null;
		expect(service.list().some((item) => item.id === "remote.only")).toBe(
			false,
		);
	});
	it("restores disabled bare catalog modules without marking ZIP shelf entries as installations", () => {
		const { ports, service } = installationFixture();
		ports.catalog = () => [
			{
				id: "remote.only",
				name: "Remote",
				version: "1.0.0",
				channel: "trusted-js",
				apiVersion: 0,
				entry: "remote.js",
				firstParty: false,
			},
			{
				id: "not.installed",
				name: "Shelf",
				version: "1.0.0",
				channel: "trusted-js",
				apiVersion: 0,
				entry: "shelf.zip",
				firstParty: false,
			},
		];
		expect(
			service.list().find((item) => item.id === "remote.only"),
		).toMatchObject({ source: "store", trustedJs: { status: "disabled" } });
		expect(service.list().some((item) => item.id === "not.installed")).toBe(
			false,
		);
	});
	it("does not attribute a same-version remote load to a stored local package", () => {
		const { ports, service } = installationFixture();
		ports.loaded = () => [
			{
				id: "example.plugin",
				name: "Remote",
				version: "2.0.0",
				bundled: false,
				firstParty: false,
			},
		];
		ports.entry = () => ({
			id: "example.plugin",
			name: "Remote",
			version: "2.0.0",
			apiVersion: 0,
			entry: "remote.js",
		});
		expect(service.list()[0]).toMatchObject({
			source: "store",
			artifact: undefined,
			installedAt: undefined,
			trustedJs: {
				installedPackage: { source: "user", artifact: { sha256: "abc" } },
			},
		});
	});
});
