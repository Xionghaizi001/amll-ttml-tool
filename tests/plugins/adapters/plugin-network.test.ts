import { describe, expect, it, vi } from "vitest";
import { NETWORK_DEFAULT_MAX_RESPONSE_BYTES } from "$/platform/network/NetworkService";
import { createPluginNetworkPort } from "$/plugins/adapters/plugin-network";

describe("plugin network lifecycle", () => {
	it("cancels in-flight transport on plugin unload", async () => {
		const controller = new AbortController();
		const port = createPluginNetworkPort({
			isOffline: () => false,
			fetch: (_request, init) =>
				new Promise((_resolve, reject) =>
					init?.signal?.addEventListener("abort", () =>
						reject(new Error("aborted")),
					),
				),
		});
		const result = port.request(
			{ url: "https://example.com" },
			{ pluginId: "p", signal: controller.signal },
		);
		controller.abort();
		expect(await result).toMatchObject({
			ok: false,
			error: { code: "network-unavailable", message: "plugin unloaded" },
		});
	});
	it("aborts timed-out transport", async () => {
		vi.useFakeTimers();
		try {
			const port = createPluginNetworkPort({
				isOffline: () => false,
				fetch: (_request, init) =>
					new Promise((_resolve, reject) =>
						init?.signal?.addEventListener("abort", () =>
							reject(new Error("aborted")),
						),
					),
			});
			const result = port.request(
				{ url: "https://example.com", timeoutMs: 20 },
				{ pluginId: "p" },
			);
			await vi.advanceTimersByTimeAsync(20);
			expect(await result).toMatchObject({
				ok: false,
				error: { code: "network-unavailable" },
			});
		} finally {
			vi.useRealTimers();
		}
	});
	it("bounds chunked responses without Content-Length and omits credentials", async () => {
		const cancel = vi.fn();
		const transport = vi.fn(
			async () =>
				new Response(
					new ReadableStream({
						start(controller) {
							controller.enqueue(
								new Uint8Array(NETWORK_DEFAULT_MAX_RESPONSE_BYTES + 1),
							);
						},
						cancel,
					}),
				),
		);
		vi.stubGlobal("fetch", transport);
		try {
			const port = createPluginNetworkPort({
				isOffline: () => false,
			});
			expect(
				await port.request({ url: "https://example.com" }, { pluginId: "p" }),
			).toMatchObject({ ok: false, error: { code: "payload-too-large" } });
			expect(cancel).toHaveBeenCalled();
			expect(transport).toHaveBeenCalledWith(
				"https://example.com",
				expect.objectContaining({ credentials: "omit", redirect: "error" }),
			);
		} finally {
			vi.unstubAllGlobals();
		}
	});
	it("keeps host-only options out of the plugin port and omits sensitive diagnostics", async () => {
		const fetch = vi.fn(async () => {
			throw new Error("cookie=secret");
		});
		const log = vi.fn();
		const port = createPluginNetworkPort({
			isOffline: () => false,
			fetch,
			log,
		});
		for (const extra of [
			{ credentials: "include" },
			{ maxResponseBytes: 99999999 },
			{ timeoutMs: 300000 },
			{ headers: { Authorization: "secret" } },
		]) {
			expect(
				await port.request(
					{ url: "https://example.com", ...extra },
					{ pluginId: "p" },
				),
			).toMatchObject({ ok: false, error: { code: "invalid-params" } });
		}
		expect(fetch).not.toHaveBeenCalled();
		expect(
			await port.request(
				{ url: "https://example.com?cookie=secret" },
				{ pluginId: "p" },
			),
		).toMatchObject({
			ok: false,
			error: {
				code: "network-unavailable",
				message: "Network request failed: transport",
			},
		});
		expect(log).toHaveBeenCalledWith("p", "transport");
	});
});
