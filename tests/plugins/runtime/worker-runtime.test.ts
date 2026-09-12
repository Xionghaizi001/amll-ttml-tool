import { describe, expect, it, vi } from "vitest";
import type {
	RuntimeRequest,
	RuntimeResponse,
	RuntimeWorkerFactory,
	RuntimeWorkerLike,
} from "$/plugins/runtime/types.ts";
import { ExtismWorkerRuntime } from "$/plugins/runtime/worker-runtime.ts";

class FakeWorker implements RuntimeWorkerLike {
	onmessage: ((event: MessageEvent<RuntimeResponse>) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	onmessageerror: ((event: MessageEvent) => void) | null = null;
	terminated = false;
	private loaded = false;

	postMessage(message: RuntimeRequest): void {
		if (this.terminated) return;
		if (message.type === "load") {
			this.loaded = true;
			this.reply({ id: message.id, ok: true });
			return;
		}
		if (message.type === "call") {
			if (message.exportName === "hang") return;
			if (message.exportName === "crash") {
				this.onerror?.({ message: "unreachable" } as ErrorEvent);
				return;
			}
			if (!this.loaded) {
				this.reply({
					id: message.id,
					ok: false,
					error: { code: "invalid-params", message: "not loaded" },
				});
				return;
			}
			this.reply({ id: message.id, ok: true, output: message.input });
			return;
		}
		this.reply({ id: message.id, ok: true });
	}

	terminate(): void {
		this.terminated = true;
	}

	private reply(response: RuntimeResponse): void {
		queueMicrotask(() =>
			this.onmessage?.({ data: response } as MessageEvent<RuntimeResponse>),
		);
	}
}

function createFakeWorkerFactory(workers: FakeWorker[]): RuntimeWorkerFactory {
	return () => {
		const worker = new FakeWorker();
		workers.push(worker);
		return worker;
	};
}

describe("ExtismWorkerRuntime", () => {
	it("roundtrips bytes through the worker protocol", async () => {
		const workers: FakeWorker[] = [];
		const runtime = new ExtismWorkerRuntime({
			workerFactory: createFakeWorkerFactory(workers),
		});
		const input = new TextEncoder().encode('{"ok":true}');

		await runtime.load(new Uint8Array([0, 97, 115, 109]));
		await expect(runtime.call("echo_json", input)).resolves.toEqual(input);
		expect(workers).toHaveLength(1);
		expect(runtime.getMetrics()).toHaveLength(2);
	});

	it("rejects payloads over the configured limit", async () => {
		const runtime = new ExtismWorkerRuntime({ maxWasmBytes: 4 });

		await expect(runtime.load(new Uint8Array(5))).rejects.toMatchObject({
			code: "payload-too-large",
		});
	});

	it("terminates a worker when a call times out", async () => {
		vi.useFakeTimers();
		try {
			const workers: FakeWorker[] = [];
			const runtime = new ExtismWorkerRuntime({
				workerFactory: createFakeWorkerFactory(workers),
				timeoutMs: 20,
			});
			await runtime.load(new Uint8Array([1]));
			const pending = runtime.call("hang");
			const rejection = expect(pending).rejects.toMatchObject({
				code: "timeout",
			});
			await vi.advanceTimersByTimeAsync(20);
			await rejection;
			expect(workers[0].terminated).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it("reloads the last plugin before calling after a timeout", async () => {
		vi.useFakeTimers();
		try {
			const workers: FakeWorker[] = [];
			const runtime = new ExtismWorkerRuntime({
				workerFactory: createFakeWorkerFactory(workers),
				timeoutMs: 20,
			});
			const input = new TextEncoder().encode('{"recovered":true}');

			await runtime.load(new Uint8Array([1]));
			const pending = runtime.call("hang");
			const rejection = expect(pending).rejects.toMatchObject({
				code: "timeout",
			});
			await vi.advanceTimersByTimeAsync(20);
			await rejection;

			await expect(runtime.call("echo_json", input)).resolves.toEqual(input);
			expect(workers).toHaveLength(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("restarts after a crashed worker", async () => {
		const workers: FakeWorker[] = [];
		const runtime = new ExtismWorkerRuntime({
			workerFactory: createFakeWorkerFactory(workers),
		});

		await runtime.load(new Uint8Array([1]));
		await expect(runtime.call("crash")).rejects.toMatchObject({
			code: "plugin-crashed",
		});
		expect(workers[0].terminated).toBe(true);
		await expect(
			runtime.call("echo_json", new Uint8Array([1])),
		).resolves.toEqual(new Uint8Array([1]));
		expect(workers).toHaveLength(2);
	});

	it("recovers after explicit termination", async () => {
		const workers: FakeWorker[] = [];
		const runtime = new ExtismWorkerRuntime({
			workerFactory: createFakeWorkerFactory(workers),
		});
		const input = new Uint8Array([7, 8]);

		await runtime.load(new Uint8Array([1]));
		runtime.terminate();

		await expect(runtime.call("echo_json", input)).resolves.toEqual(input);
		expect(workers).toHaveLength(2);
		expect(workers[0].terminated).toBe(true);
	});
});
