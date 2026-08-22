import {
	MAX_PLUGIN_PAYLOAD_BYTES,
	type PluginRuntime,
	PluginRuntimeError,
	type PluginRuntimeMetric,
	type PluginRuntimeOptions,
	type RuntimeRequest,
	type RuntimeRequestPayload,
	type RuntimeResponse,
	type RuntimeWorkerFactory,
	type RuntimeWorkerLike,
} from "./types.ts";

interface PendingRequest {
	resolve: (response: RuntimeResponse) => void;
	reject: (error: unknown) => void;
	timer: ReturnType<typeof setTimeout>;
}

const defaultWorkerFactory: RuntimeWorkerFactory = () =>
	new Worker(new URL("./extism.worker.ts", import.meta.url), {
		type: "module",
	});

export class ExtismWorkerRuntime implements PluginRuntime {
	private worker: RuntimeWorkerLike | null = null;
	private nextRequestId = 1;
	private readonly pending = new Map<number, PendingRequest>();
	private readonly metrics: PluginRuntimeMetric[] = [];
	private readonly workerFactory: RuntimeWorkerFactory;
	private readonly defaultTimeoutMs: number;
	private readonly maxPayloadBytes: number;
	private loadedWasm: Uint8Array | null = null;
	private workerReady = false;
	private recoveryPromise: Promise<void> | null = null;

	constructor(
		options: PluginRuntimeOptions & {
			workerFactory?: RuntimeWorkerFactory;
		} = {},
	) {
		this.workerFactory = options.workerFactory ?? defaultWorkerFactory;
		this.defaultTimeoutMs = options.timeoutMs ?? 5000;
		this.maxPayloadBytes = options.maxPayloadBytes ?? MAX_PLUGIN_PAYLOAD_BYTES;
	}

	async load(
		wasm: Uint8Array,
		options: PluginRuntimeOptions = {},
	): Promise<void> {
		this.assertPayloadSize(wasm);
		this.workerReady = false;
		const startedAt = performance.now();
		await this.request(
			{ type: "load", wasm: wasm.slice().buffer },
			options.timeoutMs,
		);
		this.loadedWasm = wasm.slice();
		this.workerReady = true;
		this.recordMetric({
			operation: "load",
			startedAt,
			durationMs: performance.now() - startedAt,
			inputBytes: wasm.byteLength,
			outputBytes: 0,
		});
	}

	async call(
		exportName: string,
		input: Uint8Array = new Uint8Array(),
		options: PluginRuntimeOptions = {},
	): Promise<Uint8Array> {
		this.assertPayloadSize(input);
		await this.ensureWorkerReady(options.timeoutMs);
		const startedAt = performance.now();
		const response = await this.request(
			{
				type: "call",
				exportName,
				input: input.slice().buffer,
			},
			options.timeoutMs,
		);
		const output = response.output
			? new Uint8Array(response.output)
			: new Uint8Array();
		this.recordMetric({
			operation: "call",
			startedAt,
			durationMs: performance.now() - startedAt,
			inputBytes: input.byteLength,
			outputBytes: output.byteLength,
		});
		return output;
	}

	terminate(): void {
		this.fail(new PluginRuntimeError("cancelled", "Plugin runtime terminated"));
	}

	async close(): Promise<void> {
		if (!this.worker) {
			this.loadedWasm = null;
			this.workerReady = false;
			return;
		}
		try {
			await this.request({ type: "close" }, this.defaultTimeoutMs);
		} finally {
			this.loadedWasm = null;
			this.workerReady = false;
			this.fail(new PluginRuntimeError("cancelled", "Plugin runtime closed"));
		}
	}

	getMetrics(): readonly PluginRuntimeMetric[] {
		return this.metrics;
	}

	private assertPayloadSize(payload: Uint8Array): void {
		if (payload.byteLength > this.maxPayloadBytes) {
			throw new PluginRuntimeError(
				"payload-too-large",
				`Payload exceeds ${this.maxPayloadBytes} bytes`,
			);
		}
	}

	private getWorker(): RuntimeWorkerLike {
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

	private async ensureWorkerReady(timeoutMs?: number): Promise<void> {
		if (this.workerReady || !this.loadedWasm) return;
		if (!this.recoveryPromise) {
			const wasm = this.loadedWasm;
			this.recoveryPromise = this.request(
				{ type: "load", wasm: wasm.slice().buffer },
				timeoutMs,
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
		request: RuntimeRequestPayload,
		timeoutMs = this.defaultTimeoutMs,
	): Promise<Extract<RuntimeResponse, { ok: true }>> {
		const id = this.nextRequestId++;
		const worker = this.getWorker();
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.fail(
					new PluginRuntimeError(
						"timeout",
						`Plugin call timed out after ${timeoutMs} ms`,
					),
				);
				reject(
					new PluginRuntimeError(
						"timeout",
						`Plugin call timed out after ${timeoutMs} ms`,
					),
				);
			}, timeoutMs);
			this.pending.set(id, {
				resolve: (response) => {
					clearTimeout(timer);
					resolve(response as Extract<RuntimeResponse, { ok: true }>);
				},
				reject: (error) => {
					clearTimeout(timer);
					reject(error);
				},
				timer,
			});
			worker.postMessage(
				{ ...request, id } as RuntimeRequest,
				this.transferList(request),
			);
		});
	}

	private transferList(request: RuntimeRequestPayload): Transferable[] {
		if (request.type === "load") return [request.wasm];
		if (request.type === "call") return [request.input];
		return [];
	}

	private resolve(response: RuntimeResponse): void {
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
		this.worker?.terminate();
		this.worker = null;
		this.workerReady = false;
	}

	private recordMetric(metric: PluginRuntimeMetric): void {
		this.metrics.push(metric);
	}
}
