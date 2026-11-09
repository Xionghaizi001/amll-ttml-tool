import type {
	HostResult,
	HttpRequestV0,
	HttpResponseV0,
} from "@amll-ttml-tool/plugin-api";
import { parseHttpRequest } from "@amll-ttml-tool/plugin-api";
import {
	createNetworkService,
	NetworkError,
	type NetworkServicePorts,
} from "$/platform/network/NetworkService";

export interface PluginNetworkPort {
	request(
		request: HttpRequestV0,
		meta: { pluginId: string; signal?: AbortSignal },
	): Promise<HostResult<HttpResponseV0>>;
	isOffline(): boolean;
}

export const createPluginNetworkPort = (
	ports: NetworkServicePorts & {
		log?(pluginId: string, message: string): void;
	},
): PluginNetworkPort => {
	const network = createNetworkService(ports);
	return {
		isOffline: () => network.isOffline(),
		async request(input, { pluginId, signal }) {
			const parsed = parseHttpRequest(input);
			if (!parsed.ok)
				return {
					ok: false,
					error: {
						code: "invalid-params",
						message: parsed.issues
							.map((issue) => `${issue.path || "/"}: ${issue.message}`)
							.join("; "),
					},
				};
			try {
				const { url, method, headers, body, timeoutMs } = parsed.value;
				const response = await network.request({
					url,
					method,
					headers,
					body,
					timeoutMs,
					signal,
				});
				return {
					ok: true,
					value: {
						ok: response.ok,
						status: response.status,
						statusText: response.statusText,
						headers: Object.fromEntries(response.headers),
						body: new TextDecoder().decode(response.body),
					},
				};
			} catch (error) {
				const code =
					error instanceof NetworkError && error.code === "payload-too-large"
						? "payload-too-large"
						: "network-unavailable";
				// Log only a stable reason, never URLs, credentials or transport error text.
				ports.log?.(
					pluginId,
					error instanceof NetworkError ? error.code : code,
				);
				return {
					ok: false,
					error: {
						code,
						message: signal?.aborted
							? "plugin unloaded"
							: error instanceof NetworkError
								? error.message
								: "network unavailable",
					},
				};
			}
		},
	};
};
