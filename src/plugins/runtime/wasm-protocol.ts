import type { PluginRuntimeErrorCode } from "./types.ts";
import type { WasmGuestExport, WasmTurnResult } from "./wasm-session.ts";
import type { WasmTurnContext, WasmTurnLimits } from "./wasm-turn.ts";

export type WasmHostRequest =
	| { id: number; type: "load"; wasm: ArrayBuffer; useWasi?: boolean }
	| {
			id: number;
			type: "turn";
			exportName: WasmGuestExport;
			payloadJson: string;
			context: WasmTurnContext;
			limits: WasmTurnLimits;
	  }
	| { id: number; type: "close" };

export type WasmHostRequestPayload =
	| { type: "load"; wasm: ArrayBuffer; useWasi?: boolean }
	| {
			type: "turn";
			exportName: WasmGuestExport;
			payloadJson: string;
			context: WasmTurnContext;
			limits: WasmTurnLimits;
	  }
	| { type: "close" };

export type WasmHostResponse =
	| { id: number; ok: true; turn?: WasmTurnResult }
	| {
			id: number;
			ok: false;
			error: { code: PluginRuntimeErrorCode; message: string };
	  };

export interface WasmHostWorkerLike {
	onmessage: ((event: MessageEvent<WasmHostResponse>) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
	onmessageerror: ((event: MessageEvent) => void) | null;
	postMessage(message: WasmHostRequest, transfer?: Transferable[]): void;
	terminate(): void;
}

export type WasmHostWorkerFactory = () => WasmHostWorkerLike;
