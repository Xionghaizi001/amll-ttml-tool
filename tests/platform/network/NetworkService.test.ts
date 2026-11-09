import { afterEach, describe, expect, it, vi } from "vitest";
import { createNetworkService } from "$/platform/network/NetworkService";

afterEach(() => vi.useRealTimers());

describe("shared network service", () => {
	it("refuses new offline requests and recovers without recreating the service", async () => {
		let offline = true;
		const fetch = vi.fn(async () => new Response("ok"));
		const network = createNetworkService({ isOffline: () => offline, fetch });
		await expect(
			network.request({ url: "https://example.com" }),
		).rejects.toMatchObject({ code: "offline" });
		expect(fetch).not.toHaveBeenCalled();
		offline = false;
		expect(network.isOffline()).toBe(false);
		expect(
			new TextDecoder().decode(
				(await network.request({ url: "https://example.com" })).body,
			),
		).toBe("ok");
	});

	it("preserves binary bodies, HTTP errors, headers and host request options", async () => {
		const data = new Uint8Array([0, 255, 128, 1]);
		const fetch = vi.fn(
			async () =>
				new Response(data, {
					status: 401,
					headers: { "x-request-id": "test" },
				}),
		);
		const network = createNetworkService({ isOffline: () => false, fetch });
		const body = new FormData();
		body.append("file", new Blob([data]), "test.bin");
		const progress = vi.fn();
		const response = await network.request({
			url: "/api/upload",
			method: "POST",
			body,
			credentials: "include",
			headers: { Authorization: "Bearer host-only" },
			onProgress: progress,
			maxResponseBytes: 4,
			timeoutMs: 300_000,
		});
		expect(response).toMatchObject({ ok: false, status: 401, body: data });
		expect(response.headers.get("x-request-id")).toBe("test");
		expect(fetch).toHaveBeenCalledWith(
			"/api/upload",
			expect.objectContaining({
				method: "POST",
				body,
				credentials: "include",
				headers: { Authorization: "Bearer host-only" },
				redirect: "error",
			}),
		);
		expect(progress).toHaveBeenCalledWith(4, undefined);
	});

	it.each([true, false])(
		"bounds announced and chunked responses (announced=%s)",
		async (announced) => {
			const cancel = vi.fn();
			const fetch = vi.fn(
				async () =>
					new Response(
						new ReadableStream({
							start(c) {
								c.enqueue(new Uint8Array(5));
							},
							cancel,
						}),
						{ headers: announced ? { "content-length": "5" } : {} },
					),
			);
			const network = createNetworkService({ isOffline: () => false, fetch });
			await expect(
				network.request({ url: "https://example.com", maxResponseBytes: 4 }),
			).rejects.toMatchObject({ code: "payload-too-large" });
			expect(cancel).toHaveBeenCalledTimes(1);
		},
	);

	it("times out even a transport that ignores abort", async () => {
		vi.useFakeTimers();
		const network = createNetworkService({
			isOffline: () => false,
			fetch: () => new Promise(() => {}),
		});
		const result = expect(
			network.request({ url: "https://example.com", timeoutMs: 10 }),
		).rejects.toMatchObject({ code: "timeout" });
		await vi.advanceTimersByTimeAsync(10);
		await result;
		expect(vi.getTimerCount()).toBe(0);
	});

	it("times out during body consumption without waiting for stalled cancellation", async () => {
		vi.useFakeTimers();
		const cancel = vi.fn(() => new Promise<void>(() => {}));
		const network = createNetworkService({
			isOffline: () => false,
			fetch: async () => new Response(new ReadableStream({ cancel })),
		});
		const result = expect(
			network.request({ url: "https://example.com", timeoutMs: 10 }),
		).rejects.toMatchObject({ code: "timeout" });
		await vi.advanceTimersByTimeAsync(10);
		await result;
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("cancels pending requests and rejects already cancelled requests before fetch", async () => {
		const controller = new AbortController();
		const fetch = vi.fn(() => new Promise<Response>(() => {}));
		const network = createNetworkService({ isOffline: () => false, fetch });
		const result = network.request({
			url: "https://example.com",
			signal: controller.signal,
		});
		controller.abort();
		await expect(result).rejects.toMatchObject({ code: "cancelled" });
		await expect(
			network.request({
				url: "https://example.com",
				signal: controller.signal,
			}),
		).rejects.toMatchObject({ code: "cancelled" });
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("does not expose transport error text or retry writes", async () => {
		const fetch = vi.fn(async () => {
			throw new Error("https://example.com?cookie=secret");
		});
		const network = createNetworkService({ isOffline: () => false, fetch });
		await expect(
			network.request({ url: "https://example.com", method: "POST" }),
		).rejects.toMatchObject({
			code: "transport",
			message: "Network request failed: transport",
		});
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it.each([
		{ timeoutMs: 0 },
		{ timeoutMs: Infinity },
		{ timeoutMs: 2_147_483_648 },
		{ maxResponseBytes: -1 },
		{ maxResponseBytes: NaN },
	])("rejects invalid budgets %j", async (options) => {
		const fetch = vi.fn();
		const network = createNetworkService({ isOffline: () => false, fetch });
		await expect(
			network.request({ url: "https://example.com", ...options }),
		).rejects.toBeInstanceOf(RangeError);
		expect(fetch).not.toHaveBeenCalled();
	});
	it("discards and cancels a response arriving after timeout", async () => {
		vi.useFakeTimers();
		let resolve!: (response: Response) => void;
		const network = createNetworkService({
			isOffline: () => false,
			fetch: () =>
				new Promise<Response>((done) => {
					resolve = done;
				}),
		});
		const result = expect(
			network.request({ url: "https://example.com", timeoutMs: 10 }),
		).rejects.toMatchObject({ code: "timeout" });
		await vi.advanceTimersByTimeAsync(10);
		await result;
		const cancel = vi.fn();
		resolve(new Response(new ReadableStream({ cancel })));
		await Promise.resolve();
		expect(cancel).toHaveBeenCalledTimes(1);
	});

	it("keeps in-flight requests running when offline is enabled and accepts empty responses", async () => {
		let offline = false;
		let resolve!: (response: Response) => void;
		const network = createNetworkService({
			isOffline: () => offline,
			fetch: () =>
				new Promise<Response>((done) => {
					resolve = done;
				}),
		});
		const result = network.request({ url: "https://example.com" });
		offline = true;
		resolve(new Response(null, { status: 204 }));
		expect(await result).toMatchObject({ status: 204, body: new Uint8Array() });
		await expect(
			network.request({ url: "https://example.com" }),
		).rejects.toMatchObject({ code: "offline" });
	});
});

const interruptedDownload = (
	headers: Record<string, string> = { etag: '"v1"', "content-length": "4" },
) => {
	let reads = 0;
	return new Response(
		new ReadableStream({
			pull(controller) {
				if (reads++ === 0) controller.enqueue(new Uint8Array([1, 2]));
				else controller.error(new TypeError("connection reset"));
			},
		}),
		{ headers },
	);
};

describe("opt-in download retries", () => {
	it("does not retry GET by default", async () => {
		const fetch = vi.fn(async () => interruptedDownload());
		const network = createNetworkService({ isOffline: () => false, fetch });
		await expect(
			network.request({ url: "https://example.com" }),
		).rejects.toMatchObject({ code: "transport" });
		expect(fetch).toHaveBeenCalledTimes(1);
	});
	it("resumes with Range and If-Range and preserves the full response metadata", async () => {
		vi.useFakeTimers();
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(interruptedDownload())
			.mockResolvedValueOnce(
				new Response(new Uint8Array([3, 4]), {
					status: 206,
					headers: {
						etag: '"v1"',
						"content-range": "bytes 2-3/4",
						"content-length": "2",
					},
				}),
			);
		const network = createNetworkService({ isOffline: () => false, fetch });
		const progress = vi.fn();
		const result = network.request({
			url: "https://example.com",
			retries: 1,
			onProgress: progress,
		});
		await vi.advanceTimersByTimeAsync(250);
		expect(await result).toMatchObject({
			status: 200,
			body: new Uint8Array([1, 2, 3, 4]),
		});
		const headers = fetch.mock.calls[1][1].headers as Headers;
		expect(headers.get("range")).toBe("bytes=2-");
		expect(headers.get("if-range")).toBe('"v1"');
		expect(progress).toHaveBeenLastCalledWith(4, 4);
	});
	it.each([
		{},
		{ etag: 'W/"v1"', "content-length": "4" },
		{ etag: '"v1"', "content-length": "4", "content-encoding": "gzip" },
	])("restarts when byte identity cannot be verified (%j)", async (headers) => {
		vi.useFakeTimers();
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(interruptedDownload(headers))
			.mockResolvedValueOnce(new Response(new Uint8Array([5, 6])));
		const result = createNetworkService({
			isOffline: () => false,
			fetch,
		}).request({ url: "https://example.com", retries: 1 });
		await vi.advanceTimersByTimeAsync(250);
		expect((await result).body).toEqual(new Uint8Array([5, 6]));
		expect(new Headers(fetch.mock.calls[1][1].headers).has("range")).toBe(
			false,
		);
	});
	it("replaces old bytes when the server ignores Range or the resource changes", async () => {
		vi.useFakeTimers();
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(interruptedDownload())
			.mockResolvedValueOnce(
				new Response(new Uint8Array([7, 8]), {
					headers: { etag: '"v2"', "content-length": "2" },
				}),
			);
		const result = createNetworkService({
			isOffline: () => false,
			fetch,
		}).request({ url: "https://example.com", retries: 1 });
		await vi.advanceTimersByTimeAsync(250);
		expect((await result).body).toEqual(new Uint8Array([7, 8]));
	});
	it.each([
		{ etag: '"v2"', "content-range": "bytes 2-3/4" },
		{ etag: '"v1"', "content-range": "bytes 1-3/4" },
		{ etag: '"v1"', "content-range": "bytes 2-4/5" },
	])("rejects inconsistent resume metadata %j", async (headers) => {
		vi.useFakeTimers();
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(interruptedDownload())
			.mockResolvedValueOnce(
				new Response(new Uint8Array([3, 4]), { status: 206, headers }),
			);
		const result = expect(
			createNetworkService({ isOffline: () => false, fetch }).request({
				url: "https://example.com",
				retries: 2,
			}),
		).rejects.toMatchObject({ code: "transport" });
		await vi.advanceTimersByTimeAsync(1000);
		await result;
		expect(fetch).toHaveBeenCalledTimes(2);
	});
	it("limits retries and allows cancellation during backoff", async () => {
		vi.useFakeTimers();
		const fetch = vi.fn(async () => {
			throw new TypeError("offline");
		});
		const network = createNetworkService({ isOffline: () => false, fetch });
		const exhausted = expect(
			network.request({ url: "https://example.com", retries: 2 }),
		).rejects.toMatchObject({ code: "transport" });
		await vi.advanceTimersByTimeAsync(750);
		await exhausted;
		expect(fetch).toHaveBeenCalledTimes(3);
		const controller = new AbortController();
		const cancelled = expect(
			network.request({
				url: "https://example.com",
				retries: 2,
				signal: controller.signal,
			}),
		).rejects.toMatchObject({ code: "cancelled" });
		await vi.advanceTimersByTimeAsync(0);
		controller.abort();
		await cancelled;
		await vi.advanceTimersByTimeAsync(1000);
		expect(fetch).toHaveBeenCalledTimes(4);
		expect(vi.getTimerCount()).toBe(0);
	});
	it("rechecks offline before retrying and retains the overall deadline", async () => {
		vi.useFakeTimers();
		let offline = false;
		const fetch = vi.fn(async () => {
			offline = true;
			throw new TypeError("reset");
		});
		const network = createNetworkService({ isOffline: () => offline, fetch });
		const result = expect(
			network.request({ url: "https://example.com", retries: 1 }),
		).rejects.toMatchObject({ code: "offline" });
		await vi.advanceTimersByTimeAsync(250);
		await result;
		expect(fetch).toHaveBeenCalledTimes(1);
		offline = false;
		const deadline = expect(
			network.request({
				url: "https://example.com",
				retries: 1,
				timeoutMs: 100,
			}),
		).rejects.toMatchObject({ code: "timeout" });
		await vi.advanceTimersByTimeAsync(100);
		await deadline;
		expect(fetch).toHaveBeenCalledTimes(2);
	});
	it.each([
		{ retries: -1 },
		{ retries: 6 },
		{ retries: 1.5 },
		{ retries: 1, method: "POST" },
		{ retries: 1, headers: { Range: "bytes=1-" } },
	])("rejects unsafe retry options %j", async (options) => {
		const fetch = vi.fn();
		await expect(
			createNetworkService({ isOffline: () => false, fetch }).request({
				url: "https://example.com",
				...options,
			}),
		).rejects.toBeInstanceOf(Error);
		expect(fetch).not.toHaveBeenCalled();
	});
});
