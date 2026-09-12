import { describe, expect, it } from "vitest";
import type {
	WasmHostRequest,
	WasmHostResponse,
	WasmHostWorkerFactory,
	WasmHostWorkerLike,
} from "$/plugins/runtime/wasm-protocol.ts";
import { WasmPluginWorkerClient } from "$/plugins/runtime/wasm-worker-client.ts";
import type { WasmTurnContext } from "$/plugins/runtime/wasm-turn.ts";

const context: WasmTurnContext = {
	pluginId: "test.demo",
	grantedCapabilities: [],
	document: null,
	selection: { lineIds: [], wordIds: [] },
	storage: {},
	editIdSeed: "s1",
};

class FakeWorker implements WasmHostWorkerLike {
	onmessage: ((event: MessageEvent<WasmHostResponse>) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	onmessageerror: ((event: MessageEvent) => void) | null = null;
	terminated = false;
	loads = 0;

	postMessage(message: WasmHostRequest): void {
		if (this.terminated) return;
		if (message.type === "load") {
			this.loads += 1;
			this.reply({ id: message.id, ok: true });
			return;
		}
		if (message.type === "turn") {
			const payload = JSON.parse(message.payloadJson) as { mode?: string };
			if (payload.mode === "hang") return;
			if (payload.mode === "crash") {
				this.onerror?.({ message: "unreachable" } as ErrorEvent);
				return;
			}
			this.reply({
				id: message.id,
				ok: true,
				turn: {
					returnJson: JSON.stringify({ ok: true, value: { kind: "done" } }),
					effects: {
						edits: null,
						notifications: [],
						storage: null,
						hostCallCount: 0,
					},
				},
			});
			return;
		}
		this.reply({ id: message.id, ok: true });
	}

	terminate(): void {
		this.terminated = true;
	}

	private reply(response: WasmHostResponse): void {
		queueMicrotask(() =>
			this.onmessage?.({ data: response } as MessageEvent<WasmHostResponse>),
		);
	}
}

const factory = (workers: FakeWorker[]): WasmHostWorkerFactory => {
	return () => {
		const worker = new FakeWorker();
		workers.push(worker);
		return worker;
	};
};

describe("WasmPluginWorkerClient", () => {
	it("loads and runs turns through the worker protocol", async () => {
		const workers: FakeWorker[] = [];
		const client = new WasmPluginWorkerClient({
			workerFactory: factory(workers),
		});
		await client.load(new Uint8Array([0, 97, 115, 109]));
		const turn = await client.runTurn(
			"plugin_execute_command",
			JSON.stringify({ commandId: "x" }),
			context,
		);
		expect(JSON.parse(turn.returnJson)).toMatchObject({ ok: true });
		expect(workers).toHaveLength(1);
	});

	it("kills the worker on timeout and reloads on the next turn", async () => {
		const workers: FakeWorker[] = [];
		const killed: string[] = [];
		const client = new WasmPluginWorkerClient({
			workerFactory: factory(workers),
			timeoutMs: 30,
			onWorkerKilled: (reason) => killed.push(reason),
		});
		await client.load(new Uint8Array([0, 97, 115, 109]));
		await expect(
			client.runTurn(
				"plugin_execute_command",
				JSON.stringify({ mode: "hang" }),
				context,
			),
		).rejects.toMatchObject({ code: "timeout" });
		expect(workers[0].terminated).toBe(true);
		expect(killed).toHaveLength(1);

		// The next turn transparently spawns a fresh worker and reloads.
		const turn = await client.runTurn(
			"plugin_execute_command",
			JSON.stringify({ commandId: "x" }),
			context,
		);
		expect(JSON.parse(turn.returnJson)).toMatchObject({ ok: true });
		expect(workers).toHaveLength(2);
		expect(workers[1].loads).toBe(1);
	});

	it("maps worker crashes to plugin-crashed and recovers", async () => {
		const workers: FakeWorker[] = [];
		const client = new WasmPluginWorkerClient({
			workerFactory: factory(workers),
		});
		await client.load(new Uint8Array([0, 97, 115, 109]));
		await expect(
			client.runTurn(
				"plugin_execute_command",
				JSON.stringify({ mode: "crash" }),
				context,
			),
		).rejects.toMatchObject({ code: "plugin-crashed" });
		const turn = await client.runTurn(
			"plugin_execute_command",
			JSON.stringify({ commandId: "x" }),
			context,
		);
		expect(JSON.parse(turn.returnJson)).toMatchObject({ ok: true });
	});

	it("cancelAll rejects pending turns with cancelled", async () => {
		const workers: FakeWorker[] = [];
		const client = new WasmPluginWorkerClient({
			workerFactory: factory(workers),
			timeoutMs: 5000,
		});
		await client.load(new Uint8Array([0, 97, 115, 109]));
		const pending = client.runTurn(
			"plugin_execute_command",
			JSON.stringify({ mode: "hang" }),
			context,
		);
		// Let the async runTurn actually post its request before cancelling.
		await new Promise((resolve) => setTimeout(resolve, 0));
		client.cancelAll("plugin deactivated");
		await expect(pending).rejects.toMatchObject({ code: "cancelled" });
	});

	it("refuses turns after close", async () => {
		const client = new WasmPluginWorkerClient({
			workerFactory: factory([]),
		});
		await client.load(new Uint8Array([0, 97, 115, 109]));
		await client.close();
		await expect(
			client.runTurn(
				"plugin_execute_command",
				JSON.stringify({ commandId: "x" }),
				context,
			),
		).rejects.toMatchObject({ code: "cancelled" });
	});

	it("rejects oversized turn payloads without contacting the worker", async () => {
		const workers: FakeWorker[] = [];
		const client = new WasmPluginWorkerClient({
			workerFactory: factory(workers),
			maxPayloadBytes: 8,
		});
		await client.load(new Uint8Array([0, 97, 115, 109]));
		await expect(
			client.runTurn("plugin_execute_command", "0123456789", context),
		).rejects.toMatchObject({ code: "payload-too-large" });
	});
});
