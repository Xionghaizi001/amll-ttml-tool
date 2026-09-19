import type {
	HostResult,
	HttpRequestV0,
	HttpResponseV0,
} from "@amll-ttml-tool/plugin-api";
import { parseHttpRequest } from "@amll-ttml-tool/plugin-api";

/**
 * Plugin-facing HTTP port (`network.http`), shared by every tier that gets a
 * network surface. Pure: the transport and the offline switch are injected so
 * the policy runs under Node tests exactly as in the browser.
 *
 * Policy, in order: protocol validation (`parseHttpRequest` — https-only,
 * reserved headers, body cap) → offline master switch → bounded fetch with no
 * credentials (`credentials: "omit"`, no cookies, no host-held tokens). The
 * trust-model red line is structural here: a plugin can only ever talk to
 * the network as an anonymous client.
 */

export const PLUGIN_HTTP_DEFAULT_TIMEOUT_MS = 30_000;
export const PLUGIN_HTTP_MAX_TIMEOUT_MS = 120_000;
/** Response bodies larger than this are rejected rather than buffered. */
export const PLUGIN_HTTP_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

class ResponseTooLargeError extends Error {}

export interface PluginNetworkTransportResponse {
	ok: boolean;
	status: number;
	statusText: string;
	headers: Iterable<[string, string]>;
	text(): Promise<string>;
	/** Content-Length hint when the transport knows it; -1 otherwise. */
	contentLength?: number;
}

export interface PluginNetworkPorts {
	/** Transport; the browser wiring passes `fetch`. */
	transport(
		request: HttpRequestV0,
		signal: AbortSignal,
	): Promise<PluginNetworkTransportResponse>;
	/** The user's offline master switch: true refuses every plugin request. */
	isOffline(): boolean;
	/** Diagnostics sink (plugin id + summary); optional. */
	log?(pluginId: string, message: string): void;
}

export interface PluginNetworkPort {
	request(
		request: HttpRequestV0,
		meta: { pluginId: string; signal?: AbortSignal },
	): Promise<HostResult<HttpResponseV0>>;
	isOffline(): boolean;
}

const failure = (
	code: "invalid-params" | "network-unavailable" | "payload-too-large",
	message: string,
): HostResult<HttpResponseV0> => ({ ok: false, error: { code, message } });

export const createPluginNetworkPort = (
	ports: PluginNetworkPorts,
): PluginNetworkPort => ({
	isOffline: () => ports.isOffline(),
	async request(input, { pluginId, signal }) {
		const parsed = parseHttpRequest(input);
		if (!parsed.ok)
			return failure(
				"invalid-params",
				parsed.issues
					.map((issue) => `${issue.path || "/"}: ${issue.message}`)
					.join("; "),
			);
		const request = parsed.value;
		if (signal?.aborted)
			return failure("network-unavailable", "plugin unloaded");
		if (ports.isOffline()) {
			ports.log?.(pluginId, `refused ${request.url}: offline switch is on`);
			return failure(
				"network-unavailable",
				"plugin network access is disabled (offline mode)",
			);
		}
		const timeoutMs = Math.min(
			request.timeoutMs ?? PLUGIN_HTTP_DEFAULT_TIMEOUT_MS,
			PLUGIN_HTTP_MAX_TIMEOUT_MS,
		);
		const controller = new AbortController();
		const cancel = () => controller.abort();
		signal?.addEventListener("abort", cancel, { once: true });
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await ports.transport(request, controller.signal);
			if (
				response.contentLength !== undefined &&
				response.contentLength > PLUGIN_HTTP_MAX_RESPONSE_BYTES
			)
				return failure(
					"payload-too-large",
					`response exceeds ${PLUGIN_HTTP_MAX_RESPONSE_BYTES} bytes`,
				);
			const body = await response.text();
			if (
				new TextEncoder().encode(body).byteLength >
				PLUGIN_HTTP_MAX_RESPONSE_BYTES
			)
				return failure(
					"payload-too-large",
					`response exceeds ${PLUGIN_HTTP_MAX_RESPONSE_BYTES} bytes`,
				);
			const headers: Record<string, string> = {};
			for (const [name, value] of response.headers)
				headers[name.toLowerCase()] = value;
			return {
				ok: true,
				value: {
					ok: response.ok,
					status: response.status,
					statusText: response.statusText,
					headers,
					body,
				},
			};
		} catch (error) {
			if (error instanceof ResponseTooLargeError)
				return failure("payload-too-large", error.message);
			if (signal?.aborted)
				return failure("network-unavailable", "plugin unloaded");
			const message = controller.signal.aborted
				? `request timed out after ${timeoutMs}ms`
				: String(error instanceof Error ? error.message : error);
			ports.log?.(pluginId, `failed ${request.url}: ${message}`);
			return failure("network-unavailable", message);
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener("abort", cancel);
			controller.abort();
		}
	},
});

/** `fetch`-backed transport for the browser/Tauri WebView host. */
export const fetchPluginNetworkTransport: PluginNetworkPorts["transport"] =
	async (request, signal) => {
		const response = await fetch(request.url, {
			method: request.method ?? "GET",
			headers: request.headers,
			body: request.body,
			signal,
			credentials: "omit",
			redirect: "error",
			referrerPolicy: "no-referrer",
		});
		const lengthHeader = response.headers.get("content-length");
		const contentLength =
			lengthHeader === null ? undefined : Number.parseInt(lengthHeader, 10);
		return {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
			text: async () => {
				const reader = response.body?.getReader();
				if (!reader) return "";
				const decoder = new TextDecoder();
				let bytes = 0;
				let body = "";
				try {
					while (true) {
						const chunk = await reader.read();
						if (chunk.done) break;
						bytes += chunk.value.byteLength;
						if (bytes > PLUGIN_HTTP_MAX_RESPONSE_BYTES)
							throw new ResponseTooLargeError("response exceeds byte limit");
						body += decoder.decode(chunk.value, { stream: true });
					}
					return body + decoder.decode();
				} finally {
					await reader.cancel();
					reader.releaseLock();
				}
			},
			contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
		};
	};
