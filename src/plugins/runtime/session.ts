import createPlugin, { type Plugin } from "@extism/extism";
import {
	MAX_PLUGIN_PAYLOAD_BYTES,
	PluginRuntimeError,
	type PluginRuntimeErrorCode,
} from "./types.ts";

function classifyError(error: unknown): PluginRuntimeErrorCode {
	const message = String(error instanceof Error ? error.message : error);
	if (/unreachable|trap|panic|crash/i.test(message)) {
		return "plugin-crashed";
	}
	return "internal";
}

export class ExtismPluginSession {
	private plugin: Plugin | null = null;

	async load(wasm: Uint8Array): Promise<void> {
		if (wasm.byteLength === 0) {
			throw new PluginRuntimeError("invalid-params", "WASM payload is empty");
		}
		if (wasm.byteLength > MAX_PLUGIN_PAYLOAD_BYTES) {
			throw new PluginRuntimeError(
				"payload-too-large",
				`WASM payload exceeds ${MAX_PLUGIN_PAYLOAD_BYTES} bytes`,
			);
		}

		await this.close();
		try {
			this.plugin = await createPlugin(
				{ wasm: [{ data: new Uint8Array(wasm) }] },
				{ useWasi: false, runInWorker: false },
			);
		} catch (error) {
			throw new PluginRuntimeError(classifyError(error), String(error));
		}
	}

	async call(exportName: string, input: Uint8Array): Promise<Uint8Array> {
		if (!this.plugin) {
			throw new PluginRuntimeError("invalid-params", "Plugin is not loaded");
		}
		if (!exportName) {
			throw new PluginRuntimeError("invalid-params", "Export name is empty");
		}
		if (input.byteLength > MAX_PLUGIN_PAYLOAD_BYTES) {
			throw new PluginRuntimeError(
				"payload-too-large",
				`Input payload exceeds ${MAX_PLUGIN_PAYLOAD_BYTES} bytes`,
			);
		}
		if (!(await this.plugin.functionExists(exportName))) {
			throw new PluginRuntimeError(
				"not-found",
				`Plugin export does not exist: ${exportName}`,
			);
		}

		try {
			const output = await this.plugin.call(exportName, input);
			return output ? new Uint8Array(output.bytes()) : new Uint8Array();
		} catch (error) {
			if (error instanceof PluginRuntimeError) {
				throw error;
			}
			throw new PluginRuntimeError(classifyError(error), String(error));
		}
	}

	async close(): Promise<void> {
		if (this.plugin) {
			await this.plugin.close();
			this.plugin = null;
		}
	}
}
