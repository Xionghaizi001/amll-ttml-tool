import {
	MAX_PLUGIN_PAYLOAD_BYTES,
	MAX_PLUGIN_WASM_BYTES,
	PluginRuntimeError,
	type PluginRuntimeMetric,
} from "./types.ts";
import type {
	WasmHostRequest,
	WasmHostRequestPayload,
	WasmHostResponse,
	WasmHostWorkerFactory,
	WasmHostWorkerLike,
} from "./wasm-protocol.ts";
import type { WasmGuestExport, WasmTurnResult } from "./wasm-session.ts";
import {
	DEFAULT_WASM_TURN_LIMITS,
	type WasmTurnContext,
	type WasmTurnLimits,
} from "./wasm-turn.ts";

interface PendingRequest {
	resolve: (response: Extract<WasmHostResponse, { ok: true }>) => void;
	reject: (error: unknown) => void;
	timer: ReturnType<typeof setTimeout>;
}

export interface WasmWorkerClientOptions {
	workerFactory?: WasmHostWorkerFactory;
	/** Default per-turn wall-clock budget; a blown budget kills the worker. */
	timeoutMs?: number;
	maxPayloadBytes?: number;
	maxWasmBytes?: number;
	/** Called whenever the worker is killed (timeout, crash, cancellation). */
	onWorkerKilled?: (reason: string) => void;
}

const defaultWorkerFactory: WasmHostWorkerFactory = () =>
	new Worker(new URL("./wasm-host.worker.ts", import.meta.url), {
		type: "module",
	}) as unknown as WasmHostWorkerLike;

/**
 * Main-thread client for one plugin's dedicated worker. Serializes turns,
 * enforces timeouts by terminating the worker (synchronous WASM cannot be
 * interrupted cooperatively) and transparently reloads the module on the
 * next call after a kill.
 */
export class WasmPluginWorkerClient {
	private worker: WasmHostWorkerLike | null = null;
	private nextRequestId = 1;
	private readonly pending = new Map<number, PendingRequest>();
	private readonly metrics: PluginRuntimeMetric[] = [];
	private readonly workerFactory: WasmHostWorkerFactory;
	private readonly defaultTimeoutMs: number;
	private readonly maxPayloadBytes: number;
	private readonly maxWasmBytes: number;
	private readonly onWorkerKilled?: (reason: string) => void;
	private loadedWasm: Uint8Array | null = null;
	private loadedUseWasi = false;
	private workerReady = false;
	private recoveryPromise: Promise<void> | null = null;
	private closed = false;

	constructor(options: WasmWorkerClientOptions = {}) {
		this.workerFactory = options.workerFactory ?? defaultWorkerFactory;
		this.defaultTimeoutMs = options.timeoutMs ?? 10000;
		this.maxPayloadBytes = options.maxPayloadBytes ?? MAX_PLUGIN_PAYLOAD_BYTES;
		this.maxWasmBytes = options.maxWasmBytes ?? MAX_PLUGIN_WASM_BYTES;
		this.onWorkerKilled = options.onWorkerKilled;
	}

	async load(wasm: Uint8Array, useWasi = false): Promise<void> {
		this.assertOpen();
		if (wasm.byteLength > this.maxWasmBytes)
			throw new PluginRuntimeError(
				"payload-too-large",
				`WASM payload exceeds ${this.maxWasmBytes} bytes`,
			);
		this.workerReady = false;
		const startedAt = performance.now();
		await this.request(
			{ type: "load", wasm: wasm.slice().buffer, useWasi },
			this.defaultTimeoutMs,
		);
		this.loadedWasm = wasm.slice();
		this.loadedUseWasi = useWasi;
		this.workerReady = true;
		this.recordMetric({
			operation: "load",
			startedAt,
			durationMs: performance.now() - startedAt,
			inputBytes: wasm.byteLength,
			outputBytes: 0,
		});
	}

	async runTurn(
		exportName: WasmGuestExport,
		payloadJson: string,
		context: WasmTurnContext,
		options: { limits?: WasmTurnLimits; timeoutMs?: number } = {},
	): Promise<WasmTurnResult> {
		this.assertOpen();
		if (payloadJson.length > this.maxPayloadBytes)
			throw new PluginRuntimeError(
				"payload-too-large",
				`Turn payload exceeds ${this.maxPayloadBytes} bytes`,
			);
		await this.ensureWorkerReady();
		const startedAt = performance.now();
		const response = await this.request(
			{
				type: "turn",
				exportName,
				payloadJson,
				context,
				limits: options.limits ?? DEFAULT_WASM_TURN_LIMITS,
			},
			options.timeoutMs ?? this.defaultTimeoutMs,
		);
		if (!response.turn)
			throw new PluginRuntimeError("internal", "Worker returned no turn result");
		this.recordMetric({
			operation: "call",
			startedAt,
			durationMs: performance.now() - startedAt,
			inputBytes: payloadJson.length,
			outputBytes: response.turn.returnJson.length,
		});
		return response.turn;
	}

	isLoaded(): boolean {
		return this.loadedWasm !== null;
	}

	/** Kills the worker; pending turns reject with `cancelled`. */
	cancelAll(reason = "Plugin runtime cancelled"): void {
		this.fail(new PluginRuntimeError("cancelled", reason));
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		const worker = this.worker;
		try {
			if (worker && this.workerReady)
				await this.request({ type: "close" }, 2000);
		} catch {
			// Best-effort: the worker is torn down below either way.
		} finally {
			this.loadedWasm = null;
			this.loadedUseWasi = false;
			this.fail(new PluginRuntimeError("cancelled", "Plugin runtime closed"));
		}
	}

	getMetrics(): readonly PluginRuntimeMetric[] {
		return this.metrics;
	}

	private assertOpen(): void {
		if (this.closed)
			throw new PluginRuntimeError("cancelled", "Plugin runtime is closed");
	}

	private getWorker(): WasmHostWorkerLike {
		if (this.worker) return this.worker;
		const worker = this.workerFactory();
		worker.onmessage = (event) => this.resolve(event.data);
		worker.onerror = (event) => {
			this.fail(
				new PluginRuntimeError(
					"plugin-crashed",
					event.message || "Plugin worker crashed",
				),
			);
		};
		worker.onmessageerror = () => {
			this.fail(
				new PluginRuntimeError(
					"internal",
					"Plugin worker message could not be decoded",
				),
			);
		};
		this.worker = worker;
		this.workerReady = false;
		return worker;
	}

	private async ensureWorkerReady(): Promise<void> {
		if (this.workerReady) return;
		if (!this.loadedWasm)
			throw new PluginRuntimeError("invalid-params", "Plugin is not loaded");
		if (!this.recoveryPromise) {
			const wasm = this.loadedWasm;
			this.recoveryPromise = this.request(
				{
					type: "load",
					wasm: wasm.slice().buffer,
					useWasi: this.loadedUseWasi,
				},
				this.defaultTimeoutMs,
			)
				.then(() => {
					this.workerReady = true;
				})
				.finally(() => {
					this.recoveryPromise = null;
				});
		}
		await this.recoveryPromise;
	}

	private request(
		request: WasmHostRequestPayload,
		timeoutMs: number,
	): Promise<Extract<WasmHostResponse, { ok: true }>> {
		const id = this.nextRequestId++;
		const worker = this.getWorker();
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				const error = new PluginRuntimeError(
					"timeout",
					`Plugin call timed out after ${timeoutMs} ms`,
				);
				this.fail(error);
				reject(error);
			}, timeoutMs);
			this.pending.set(id, {
				resolve: (response) => {
					clearTimeout(timer);
					resolve(response);
				},
				reject: (error) => {
					clearTimeout(timer);
					reject(error);
				},
				timer,
			});
			worker.postMessage(
				{ ...request, id } as WasmHostRequest,
				request.type === "load" ? [request.wasm] : [],
			);
		});
	}

	private resolve(response: WasmHostResponse): void {
		const pending = this.pending.get(response.id);
		if (!pending) return;
		this.pending.delete(response.id);
		if (response.ok) {
			pending.resolve(response);
		} else {
			pending.reject(
				new PluginRuntimeError(response.error.code, response.error.message),
			);
		}
	}

	private fail(error: PluginRuntimeError): void {
		for (const [id, pending] of this.pending) {
			this.pending.delete(id);
			pending.reject(error);
		}
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
			this.onWorkerKilled?.(error.message);
		}
		this.workerReady = false;
	}

	private recordMetric(metric: PluginRuntimeMetric): void {
		this.metrics.push(metric);
	}
}
