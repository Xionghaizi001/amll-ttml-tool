export interface HttpTextPart {
	kind: "text";
	value: string;
}

export interface HttpFilePart {
	kind: "file";
	fileName: string;
	contentType: string;
	data: string | Uint8Array;
}

export interface HttpFormDataBody {
	kind: "form-data";
	fields: Record<string, HttpTextPart | HttpFilePart>;
}

export interface HttpRequest {
	url: string;
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	headers?: Record<string, string>;
	body?: string | Uint8Array | HttpFormDataBody;
}

export interface HttpResponse<T = unknown> {
	ok: boolean;
	status: number;
	statusText: string;
	data: T;
}

export interface HttpClientPort {
	request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>;
}
