import type {
	HostResponseV0,
	JsonValue,
	PluginErrorCode,
} from "@amll-ttml-tool/plugin-api";
import { parseHostCall } from "@amll-ttml-tool/plugin-api";
import type { TrustedJsHostV0 } from "../host";

/**
 * Structural twin of plugin-api's `PluginHostUnderTest`, so a trusted-js host
 * can be fed to `runHostContractTests` without this package importing the
 * vitest-bound contract module.
 */
export interface TrustedJsHostUnderTestV0 {
	call(input: unknown): Promise<HostResponseV0>;
	undo(): Promise<boolean>;
}

const errorResponse = (
	id: string,
	code: PluginErrorCode,
	message: string,
): HostResponseV0 => ({ id, result: { ok: false, error: { code, message } } });

const okResponse = (id: string, value: unknown): HostResponseV0 => ({
	id,
	result: { ok: true, value: value as JsonValue },
});

/**
 * Adapts a `TrustedJsHostV0` to the `HostCallV0` wire surface the protocol
 * contract suite drives. Every call is validated by `parseHostCall` first, so
 * the trusted tier answers the same protocol questions as the WASM bridge;
 * capability checks are absent because the trusted tier holds every capability.
 */
export const createTrustedJsHostUnderTest = (
	host: TrustedJsHostV0,
	options: { undo(): boolean | Promise<boolean> },
): TrustedJsHostUnderTestV0 => ({
	async call(input) {
		const parsed = parseHostCall(input);
		if (!parsed.ok)
			return errorResponse(
				typeof input === "object" && input !== null && "id" in input
					? String((input as { id: unknown }).id)
					: "invalid",
				"invalid-params",
				parsed.issues
					.map((issue) => `${issue.path}: ${issue.message}`)
					.join("; "),
			);
		const call = parsed.value;
		switch (call.method) {
			case "lyrics.getDocument":
				return okResponse(call.id, host.document.readSnapshot());
			case "lyrics.getSelection":
				return okResponse(call.id, host.selection.get());
			case "lyrics.applyEdit": {
				const result = host.document.applyEdit(
					call.params.ops,
					call.params.label,
					{ expectedRevision: call.params.expectedRevision },
				);
				return result.ok
					? okResponse(call.id, result.value)
					: { id: call.id, result };
			}
			case "ui.notify":
				host.ui.notify(call.params);
				return okResponse(call.id, {});
			case "ui.showForm":
				return okResponse(call.id, await host.ui.showForm(call.params.schema));
			case "storage.get":
				return okResponse(call.id, {
					value: await host.storage.kv.get(call.params.key),
				});
			case "storage.set":
				await host.storage.kv.set(call.params.key, call.params.value);
				return okResponse(call.id, {});
			case "storage.delete":
				await host.storage.kv.delete(call.params.key);
				return okResponse(call.id, {});
			case "storage.keys":
				return okResponse(call.id, { keys: await host.storage.kv.keys() });
		}
	},
	async undo() {
		return options.undo();
	},
});
