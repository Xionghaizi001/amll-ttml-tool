import {
	type FormResultV0,
	type FormSchemaV0,
	parseFormSchema,
} from "@amll-ttml-tool/plugin-api";

export interface DeclarativeFormRequest {
	id: number;
	schema: FormSchemaV0;
}

class DeclarativeFormService {
	private current: DeclarativeFormRequest | null = null;
	private resolveCurrent?: (result: FormResultV0) => void;
	private readonly listeners = new Set<() => void>();
	private nextId = 1;

	getSnapshot = (): DeclarativeFormRequest | null => this.current;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	showForm(schema: FormSchemaV0, signal?: AbortSignal): Promise<FormResultV0> {
		if (signal?.aborted) return Promise.resolve({ submitted: false });
		// The host renders whatever lands here, so re-validate even for
		// callers that should have validated already (defense in depth).
		const parsed = parseFormSchema(schema);
		if (!parsed.ok)
			return Promise.reject(
				new Error(
					`Invalid form schema: ${parsed.issues
						.map((issue) => `${issue.path || "/"}: ${issue.message}`)
						.join("; ")}`,
				),
			);
		this.resolveCurrent?.({ submitted: false });
		const id = this.nextId++;
		this.current = { id, schema: parsed.value };
		return new Promise((resolve) => {
			const cancel = () => this.cancel(id);
			this.resolveCurrent = (result) => {
				signal?.removeEventListener("abort", cancel);
				resolve(result);
			};
			signal?.addEventListener("abort", cancel, { once: true });
			this.emitChange();
		});
	}

	complete(requestId: number, result: FormResultV0): void {
		// A stale dialog (unmounting while a new request replaced it) must not
		// resolve the newer request with the older form's values.
		if (this.current?.id !== requestId) return;
		const resolve = this.resolveCurrent;
		if (!resolve) return;
		this.resolveCurrent = undefined;
		this.current = null;
		this.emitChange();
		resolve(result);
	}

	cancel(requestId: number): void {
		this.complete(requestId, { submitted: false });
	}

	private emitChange(): void {
		for (const listener of this.listeners) listener();
	}
}

export const declarativeFormService = new DeclarativeFormService();
