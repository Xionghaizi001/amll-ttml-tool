import { PluginRuntimeError } from "./types.ts";
import type { WasmHostRequest, WasmHostResponse } from "./wasm-protocol.ts";
import { WasmGuestSession } from "./wasm-session.ts";

const session = new WasmGuestSession();
const workerScope = self as DedicatedWorkerGlobalScope;

function toError(error: unknown): Extract<WasmHostResponse, { ok: false }> {
	if (error instanceof PluginRuntimeError) {
		return {
			id: 0,
			ok: false,
			error: { code: error.code, message: error.message },
		};
	}
	return {
		id: 0,
		ok: false,
		error: { code: "internal", message: String(error) },
	};
}

workerScope.onmessage = async (event: MessageEvent<WasmHostRequest>) => {
	const request = event.data;
	try {
		if (request.type === "load") {
			await session.load(new Uint8Array(request.wasm), request.useWasi);
			workerScope.postMessage({
				id: request.id,
				ok: true,
			} satisfies WasmHostResponse);
			return;
		}

		if (request.type === "turn") {
			const turn = await session.runTurn(
				request.exportName,
				request.payloadJson,
				request.context,
				request.limits,
			);
			workerScope.postMessage({
				id: request.id,
				ok: true,
				turn,
			} satisfies WasmHostResponse);
			return;
		}

		await session.close();
		workerScope.postMessage({
			id: request.id,
			ok: true,
		} satisfies WasmHostResponse);
	} catch (error) {
		const response = toError(error);
		response.id = request.id;
		workerScope.postMessage(response);
	}
};
