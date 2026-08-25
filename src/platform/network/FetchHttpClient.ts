import type {
	HttpClientPort,
	HttpFormDataBody,
	HttpRequest,
} from "../../kernel/platform/HttpClient";

const createFormData = (body: HttpFormDataBody) => {
	const formData = new FormData();
	for (const [name, part] of Object.entries(body.fields)) {
		if (part.kind === "text") {
			formData.append(name, part.value);
			continue;
		}
		formData.append(
			name,
			new Blob([part.data as BlobPart], { type: part.contentType }),
			part.fileName,
		);
	}
	return formData;
};

const createBody = (request: HttpRequest): BodyInit | undefined => {
	if (!request.body) return undefined;
	if (typeof request.body === "string") return request.body;
	if (request.body instanceof Uint8Array)
		return new Blob([request.body as BlobPart]);
	return createFormData(request.body);
};

export class FetchHttpClient implements HttpClientPort {
	async request<T>(request: HttpRequest) {
		const response = await fetch(request.url, {
			method: request.method ?? "GET",
			headers: request.headers,
			body: createBody(request),
		});
		const contentType = response.headers.get("content-type") ?? "";
		const data = contentType.includes("application/json")
			? await response.json()
			: await response.text();
		return {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			data: data as T,
		};
	}
}
