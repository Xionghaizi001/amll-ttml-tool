/** Bound response bytes while streaming, before parsing or allocating a full package. */
export async function readStoreResponse(
	response: Response,
	limit: number,
): Promise<Uint8Array> {
	const declared = Number(response.headers.get("content-length"));
	if (declared > limit) {
		await response.body?.cancel();
		throw new Error("响应超过大小限制");
	}
	if (!response.body) return new Uint8Array();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > limit) {
				await reader.cancel();
				throw new Error("响应超过大小限制");
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return bytes;
}
