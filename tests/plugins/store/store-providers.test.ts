import { describe, expect, it, vi } from "vitest";
import { readStoreResponse } from "$/plugins/store/read-store-response";
import {
	StoreProviderClient,
	validateProviderUrl,
} from "$/plugins/store/store-providers";

const official = {
	id: "official",
	name: "Official",
	catalogUrl: "https://app.test/plugins/catalog.json",
	official: true,
};
const plugin = (sha256 = "a".repeat(64), id = "test.plugin") => ({
	id,
	name: "Test",
	version: "1.0.0",
	apiVersion: 0,
	channel: "trusted-js",
	entry: "store/package.zip",
	sha256,
	firstParty: true,
});
const catalog = (plugins = [plugin()]) => ({ catalogVersion: 0, plugins });
const response = (value: unknown) => new Response(JSON.stringify(value));
function storage() {
	const data = new Map<string, string>();
	return {
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => {
			data.set(key, value);
		},
	};
}
describe("store providers", () => {
	it("invokes the default browser fetch with its global receiver", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = function (this: unknown) {
			if (this !== globalThis) throw new TypeError("Illegal invocation");
			return Promise.resolve(response(catalog()));
		};
		try {
			const client = new StoreProviderClient(official, storage());
			await client.refresh();
			expect(client.list()[0].error).toBeUndefined();
			expect(client.entries()).toHaveLength(1);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
	it("allows HTTPS and prototype loopback HTTP only", () => {
		for (const url of [
			"https://store.test/catalog.json",
			"http://localhost:8787/plugins/catalog.json",
			"http://127.0.0.1:1234/catalog.json",
			"http://[::1]:8787/catalog.json",
		])
			expect(validateProviderUrl(url)).toBe(url);
		for (const url of [
			"http://store.test/catalog.json",
			"file:///catalog.json",
			"https://user:pass@store.test/catalog.json",
			"https://store.test/catalog.json#x",
		])
			expect(() => validateProviderUrl(url)).toThrow();
	});
	it("persists validated per-source catalogs, resolves relative artifacts, and reads without fetching", async () => {
		const saved = storage();
		const request = vi.fn(async () => response(catalog()));
		const client = new StoreProviderClient(official, saved, request);
		client.add("Local", "http://localhost:8787/plugins/catalog.json");
		expect(request).not.toHaveBeenCalled();
		await client.refresh();
		const restored = new StoreProviderClient(official, saved, request);
		expect(request).toHaveBeenCalledTimes(2);
		expect(restored.entries()[1]).toMatchObject({
			artifactUrl: "http://localhost:8787/plugins/store/package.zip",
			firstParty: false,
			mirrorOf: "Official",
		});
	});
	it("isolates failed sources and retains their last valid cache", async () => {
		let failOfficial = false;
		const request = vi.fn(async (url: string | URL | Request) => {
			if (failOfficial && String(url).startsWith("https://app.test"))
				throw new Error("offline");
			return response(catalog());
		});
		const client = new StoreProviderClient(official, storage(), request);
		client.add("Local", "http://localhost:8787/catalog.json");
		await client.refresh();
		failOfficial = true;
		await client.refresh();
		expect(client.list()[0]).toMatchObject({
			error: "offline",
			catalog: catalog(),
		});
		expect(client.list()[1].error).toBeUndefined();
		expect(client.entries()).toHaveLength(2);
	});
	it("blocks different-byte conflicts, factory overrides and unsigned third-party packages", async () => {
		const client = new StoreProviderClient(
			official,
			storage(),
			vi.fn(async (url) =>
				response(
					catalog(
						String(url).startsWith("https:")
							? [plugin()]
							: [
									plugin("b".repeat(64)),
									plugin("c".repeat(64), "builtin.test"),
									{
										...plugin("d".repeat(64), "unsigned.test"),
										sha256: undefined,
									},
								],
					),
				),
			),
		);
		client.add("Local", "http://localhost:8787/catalog.json");
		await client.refresh();
		const entries = client.entries(new Set(["builtin.test"]));
		expect(entries[0].blockedReason).toBeUndefined();
		expect(entries.slice(1).every((e) => e.blockedReason)).toBe(true);
	});
	it("deduplicates concurrent refreshes and never resurrects a removed provider", async () => {
		let finish!: () => void;
		const pending = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const request = vi.fn(async () => {
			await pending;
			return response(catalog());
		});
		const saved = storage();
		const client = new StoreProviderClient(official, saved, request);
		client.add("Local", "http://localhost:8787/catalog.json");
		const first = client.refresh();
		const second = client.refresh();
		expect(first).toBe(second);
		client.remove(client.list()[1].provider.id);
		finish();
		await first;
		expect(client.list()).toHaveLength(1);
		expect(new StoreProviderClient(official, saved).list()).toHaveLength(1);
		expect(request).toHaveBeenCalledTimes(2);
	});
	it("rejects oversized streaming responses before full allocation", async () => {
		const response = new Response(
			new ReadableStream({
				start(controller) {
					controller.enqueue(new Uint8Array(5));
					controller.enqueue(new Uint8Array(5));
					controller.close();
				},
			}),
		);
		await expect(readStoreResponse(response, 8)).rejects.toThrow(
			"响应超过大小限制",
		);
	});
});
