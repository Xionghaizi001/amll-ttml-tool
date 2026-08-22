export const MAX_PLUGIN_PAYLOAD_BYTES = 1024 * 1024;
export const MAX_PLUGIN_WASM_BYTES = 32 * 1024 * 1024;

export type PluginRuntimeErrorCode =
	| "invalid-params"
	| "not-found"
	| "timeout"
	| "cancelled"
	| "payload-too-large"
	| "plugin-crashed"
	| "internal";

export class PluginRuntimeError extends Error {
	readonly code: PluginRuntimeErrorCode;

	constructor(code: PluginRuntimeErrorCode, message: string) {
		super(message);
		this.name = "PluginRuntimeError";
		this.code = code;
	}
}

export type PluginRuntimeOperation = "load" | "call";

export interface PluginRuntimeMetric {
	operation: PluginRuntimeOperation;
	startedAt: number;
	durationMs: number;
	inputBytes: number;
	outputBytes: number;
}

export interface PluginRuntimeOptions {
	timeoutMs?: number;
	maxPayloadBytes?: number;
	maxWasmBytes?: number;
	useWasi?: boolean;
}

export interface PluginRuntime {
	load(wasm: Uint8Array, options?: PluginRuntimeOptions): Promise<void>;
	call(
		exportName: string,
		input?: Uint8Array,
		options?: PluginRuntimeOptions,
	): Promise<Uint8Array>;
	terminate(): void;
	close(): Promise<void>;
	getMetrics(): readonly PluginRuntimeMetric[];
}

export interface RuntimeRequestBase {
	id: number;
}

export type RuntimeRequest =
	| (RuntimeRequestBase & {
			type: "load";
			wasm: ArrayBuffer;
			useWasi?: boolean;
	  })
	| (RuntimeRequestBase & {
			type: "call";
			exportName: string;
			input: ArrayBuffer;
	  })
	| (RuntimeRequestBase & { type: "close" });

export type RuntimeRequestPayload =
	| { type: "load"; wasm: ArrayBuffer; useWasi?: boolean }
	| { type: "call"; exportName: string; input: ArrayBuffer }
	| { type: "close" };

export type RuntimeResponse =
	| {
			id: number;
			ok: true;
			output?: ArrayBuffer;
	  }
	| {
			id: number;
			ok: false;
			error: {
				code: PluginRuntimeErrorCode;
				message: string;
			};
	  };

export interface RuntimeWorkerLike {
	onmessage: ((event: MessageEvent<RuntimeResponse>) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
	onmessageerror: ((event: MessageEvent) => void) | null;
	postMessage(message: RuntimeRequest, transfer?: Transferable[]): void;
	terminate(): void;
}

export type RuntimeWorkerFactory = () => RuntimeWorkerLike;
