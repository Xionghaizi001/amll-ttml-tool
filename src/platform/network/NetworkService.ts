export const NETWORK_DEFAULT_TIMEOUT_MS = 30_000;
// setTimeout uses a signed 32-bit delay. Plugin policy imposes its own smaller cap.
const MAX_TIMER_DELAY_MS = 2_147_483_647;
export const NETWORK_DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class NetworkError extends Error {
	constructor(
		public readonly code:
			| "offline"
			| "cancelled"
			| "timeout"
			| "payload-too-large"
			| "transport",
	) {
		super(`Network request failed: ${code}`);
		this.name = "NetworkError";
	}
}

/** Host-only options; credentials and larger download budgets are never exposed to plugins. */
export interface NetworkRequest extends RequestInit {
	url: string;
	timeoutMs?: number;
	maxResponseBytes?: number;
	/** Additional GET attempts (0–5); omitted means no retry. */
	retries?: number;
	onProgress?(receivedBytes: number, totalBytes: number | undefined): void;
}

export interface NetworkResponse {
	ok: boolean;
	status: number;
	statusText: string;
	headers: Headers;
	body: Uint8Array;
}

export interface NetworkService {
	request(request: NetworkRequest): Promise<NetworkResponse>;
	isOffline(): boolean;
}

export interface NetworkServicePorts {
	isOffline(): boolean;
	fetch?: typeof globalThis.fetch;
}

/** Bounded, buffered transport. HTTP error statuses remain responses; retries are opt-in. */
// shortcut: buffers chunks plus the final body; add streaming sinks when downloads require bounded memory.
export const createNetworkService = (
	ports: NetworkServicePorts,
): NetworkService => ({
	isOffline: () => ports.isOffline(),
	async request({
		url,
		timeoutMs = NETWORK_DEFAULT_TIMEOUT_MS,
		maxResponseBytes = NETWORK_DEFAULT_MAX_RESPONSE_BYTES,
		retries = 0,
		onProgress,
		signal,
		...init
	}) {
		if (
			!Number.isSafeInteger(timeoutMs) ||
			timeoutMs <= 0 ||
			timeoutMs > MAX_TIMER_DELAY_MS
		)
			throw new RangeError(
				"timeoutMs must be a positive integer within the platform timer limit",
			);
		if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0)
			throw new RangeError("maxResponseBytes must be a positive safe integer");
		if (!Number.isInteger(retries) || retries < 0 || retries > 5)
			throw new RangeError("retries must be an integer between 0 and 5");
		if (
			retries > 0 &&
			((init.method ?? "GET").toUpperCase() !== "GET" ||
				init.body != null ||
				new Headers(init.headers).has("range") ||
				new Headers(init.headers).has("if-range"))
		)
			throw new TypeError(
				"retries requires a GET without a body or caller-supplied Range/If-Range",
			);

		if (signal?.aborted) throw new NetworkError("cancelled");
		if (ports.isOffline()) throw new NetworkError("offline");
		const controller = new AbortController();
		const cancel = () => controller.abort(new NetworkError("cancelled"));
		signal?.addEventListener("abort", cancel, { once: true });
		const timer = setTimeout(
			() => controller.abort(new NetworkError("timeout")),
			timeoutMs,
		);
		let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		let abortListener: (() => void) | undefined;
		const aborted = new Promise<never>((_resolve, reject) => {
			abortListener = () => reject(controller.signal.reason);
			controller.signal.addEventListener("abort", abortListener, {
				once: true,
			});
		});
		try {
			const work = async (): Promise<NetworkResponse> => {
				let chunks: Uint8Array[] = [];
				let received = 0;
				let total: number | undefined;
				let validator: string | undefined;
				let response!: Response;
				let original: Response | undefined;
				for (let attempt = 0; ; attempt++) {
					if (attempt > 0) {
						await new Promise<void>((resolve) => {
							retryTimer = setTimeout(resolve, 250 * 2 ** (attempt - 1));
						});
						controller.signal.throwIfAborted();
						if (ports.isOffline()) throw new NetworkError("offline");
					}
					const resume =
						received > 0 && validator !== undefined && total !== undefined;
					const headers = new Headers(init.headers);
					if (resume) {
						headers.set("Range", `bytes=${received}-`);
						headers.set("If-Range", validator ?? "");
					}
					try {
						response = await (ports.fetch ?? globalThis.fetch)(url, {
							credentials: "omit",
							redirect: "error",
							referrerPolicy: "no-referrer",
							...init,
							...(resume ? { headers } : {}),
							signal: controller.signal,
						});
						if (controller.signal.aborted) {
							void response.body?.cancel().catch(() => {});
							controller.signal.throwIfAborted();
						}
						reader = response.body?.getReader();
						const encoding = response.headers.get("content-encoding");
						const identity = !encoding || encoding.toLowerCase() === "identity";
						if (resume && response.status === 206) {
							const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
								response.headers.get("content-range") ?? "",
							);
							if (
								!range ||
								Number(range[1]) !== received ||
								Number(range[2]) !== (total ?? 0) - 1 ||
								Number(range[3]) !== total ||
								response.headers.get("etag") !== validator ||
								!identity
							)
								throw new NetworkError("transport");
						} else {
							// A full response to If-Range replaces old bytes; never append a changed resource.
							if (resume && response.status !== 200)
								throw new NetworkError("transport");
							chunks = [];
							received = 0;
							original = response;
							const length = response.headers.get("content-length");
							const parsedLength =
								length !== null && /^\d+$/.test(length)
									? Number(length)
									: undefined;
							total = Number.isSafeInteger(parsedLength)
								? parsedLength
								: undefined;
							const etag = response.headers.get("etag");
							validator =
								retries > 0 &&
								response.status === 200 &&
								identity &&
								etag &&
								/^"[^"\r\n]*"$/.test(etag)
									? etag
									: undefined;
							if (attempt > 0) onProgress?.(0, total);
						}
						if (total !== undefined && total > maxResponseBytes)
							throw new NetworkError("payload-too-large");
						while (reader) {
							const chunk = await reader.read();
							controller.signal.throwIfAborted();
							if (chunk.done) break;
							received += chunk.value.byteLength;
							if (received > maxResponseBytes)
								throw new NetworkError("payload-too-large");
							if (validator && total !== undefined && received > total)
								throw new NetworkError("transport");
							chunks.push(chunk.value);
							try {
								onProgress?.(received, total);
							} catch {
								throw new NetworkError("transport");
							}
						}
						if (validator && total !== undefined && received !== total)
							throw new Error("Incomplete response");
						break;
					} catch (error) {
						if (
							controller.signal.aborted ||
							error instanceof NetworkError ||
							attempt >= retries ||
							(response && !response.ok)
						)
							throw error;
						// No validator/known byte length (or compressed content): retry from zero.
						if (!validator || total === undefined) {
							chunks = [];
							received = 0;
						}
					} finally {
						if (reader) {
							void reader.cancel().catch(() => {});
							reader.releaseLock();
							reader = undefined;
						}
					}
				}
				if (!original) throw new NetworkError("transport");
				response = original;

				const body = new Uint8Array(received);
				let offset = 0;
				for (const chunk of chunks) {
					body.set(chunk, offset);
					offset += chunk.byteLength;
				}
				return {
					ok: response.ok,
					status: response.status,
					statusText: response.statusText,
					headers: response.headers,
					body,
				};
			};
			return await Promise.race([work(), aborted]);
		} catch (error) {
			if (controller.signal.aborted) throw controller.signal.reason;
			if (error instanceof NetworkError) throw error;
			// Transport errors may embed URLs, tokens or response content.
			throw new NetworkError("transport");
		} finally {
			clearTimeout(timer);
			clearTimeout(retryTimer);
			signal?.removeEventListener("abort", cancel);
			if (abortListener)
				controller.signal.removeEventListener("abort", abortListener);
			controller.abort();
			if (reader) {
				const activeReader = reader;
				// A stalled stream cancellation must not delay timeout or unload completion.
				void activeReader.cancel().catch(() => {});
				activeReader.releaseLock();
			}
		}
	},
});
