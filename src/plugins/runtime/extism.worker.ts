import { ExtismPluginSession } from "./session.ts";
import {
	PluginRuntimeError,
	type RuntimeRequest,
	type RuntimeResponse,
} from "./types.ts";

const session = new ExtismPluginSession();
const workerScope = self as DedicatedWorkerGlobalScope;

function toError(error: unknown): Extract<RuntimeResponse, { ok: false }> {
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

workerScope.onmessage = async (event: MessageEvent<RuntimeRequest>) => {
	const request = event.data;
	try {
		if (request.type === "load") {
			await session.load(new Uint8Array(request.wasm), request.useWasi);
			workerScope.postMessage({
				id: request.id,
				ok: true,
			} satisfies RuntimeResponse);
			return;
		}

		if (request.type === "call") {
			const output = await session.call(
				request.exportName,
				new Uint8Array(request.input),
			);
			const transferableOutput = output.slice().buffer as ArrayBuffer;
			workerScope.postMessage(
				{
					id: request.id,
					ok: true,
					output: transferableOutput,
				} satisfies RuntimeResponse,
				[transferableOutput],
			);
			return;
		}

		await session.close();
		workerScope.postMessage({
			id: request.id,
			ok: true,
		} satisfies RuntimeResponse);
	} catch (error) {
		const response = toError(error);
		response.id = request.id;
		workerScope.postMessage(response);
	}
};
