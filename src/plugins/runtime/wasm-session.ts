import type { HostResponseV0, PLUGIN_EXPORTS } from "@amll-ttml-tool/plugin-api";
import {
	WASM_HOST_CALL_FUNCTION,
	WASM_HOST_MODULE,
} from "@amll-ttml-tool/plugin-api";
import { ExtismPluginSession } from "./session.ts";
import { PluginRuntimeError } from "./types.ts";
import {
	DEFAULT_WASM_TURN_LIMITS,
	type WasmTurnContext,
	type WasmTurnEffects,
	type WasmTurnLimits,
	WasmTurnHost,
} from "./wasm-turn.ts";

export type WasmGuestExport = (typeof PLUGIN_EXPORTS)[keyof typeof PLUGIN_EXPORTS];

export interface WasmTurnResult {
	/** Raw JSON text the export returned (a PluginReturnV0, parsed upstream). */
	returnJson: string;
	effects: WasmTurnEffects;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * One loaded WASM plugin inside the worker. Exposes the turn calling
 * convention: every guest invocation gets a fresh WasmTurnHost, and the
 * synchronous `amll_host_call` import resolves against it. A host call
 * arriving outside a turn (e.g. from a re-entrant start function) is
 * rejected instead of touching stale state.
 */
export class WasmGuestSession {
	private readonly session = new ExtismPluginSession();
	private currentTurn: WasmTurnHost | null = null;

	async load(wasm: Uint8Array, useWasi = false): Promise<void> {
		await this.session.load(wasm, useWasi, {
			[WASM_HOST_MODULE]: {
				[WASM_HOST_CALL_FUNCTION]: (callContext, inputOffset: bigint) => {
					const input = callContext.read(inputOffset);
					const response = this.handleHostCall(
						input === null ? "" : input.text(),
					);
					return callContext.store(response);
				},
			},
		});
	}

	async runTurn(
		exportName: WasmGuestExport,
		payloadJson: string,
		context: WasmTurnContext,
		limits: WasmTurnLimits = DEFAULT_WASM_TURN_LIMITS,
	): Promise<WasmTurnResult> {
		if (this.currentTurn !== null)
			throw new PluginRuntimeError(
				"invalid-params",
				"A guest turn is already running",
			);
		this.currentTurn = new WasmTurnHost(context, limits);
		try {
			const output = await this.session.call(
				exportName,
				encoder.encode(payloadJson),
			);
			return {
				returnJson: decoder.decode(output),
				effects: this.currentTurn.getEffects(),
			};
		} finally {
			this.currentTurn = null;
		}
	}

	async close(): Promise<void> {
		await this.session.close();
	}

	private handleHostCall(input: string): string {
		if (this.currentTurn === null) {
			const response: HostResponseV0 = {
				id: "invalid",
				result: {
					ok: false,
					error: {
						code: "invalid-params",
						message: "host calls are only available during a guest turn",
					},
				},
			};
			return JSON.stringify(response);
		}
		return this.currentTurn.handleHostCallJson(input);
	}
}
