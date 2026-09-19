import { describe, expect, it, vi } from "vitest";
import {
	createPluginNetworkPort,
	fetchPluginNetworkTransport,
	PLUGIN_HTTP_MAX_RESPONSE_BYTES,
} from "$/plugins/adapters/plugin-network";

describe("plugin network lifecycle", () => {
	it("cancels in-flight transport on plugin unload", async () => {
		const controller = new AbortController();
		const port = createPluginNetworkPort({
			isOffline: () => false,
			transport: (_request, signal) =>
				new Promise((_resolve, reject) =>
					signal.addEventListener("abort", () => reject(new Error("aborted"))),
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
				transport: (_request, signal) =>
					new Promise((_resolve, reject) =>
						signal.addEventListener("abort", () =>
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
								new Uint8Array(PLUGIN_HTTP_MAX_RESPONSE_BYTES + 1),
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
				transport: fetchPluginNetworkTransport,
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
});
