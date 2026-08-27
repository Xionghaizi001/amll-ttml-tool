import { applyDocumentOpsV0 } from "../document-ops";
import { parseHostCall } from "../parsers";
import { hasCapabilities, requiredCapabilitiesForCall } from "../permissions";
import type {
	Capability,
	FormResultV0,
	HostCallV0,
	HostResponseV0,
	JsonValue,
	NotifyParams,
	PluginDocumentV0,
	PluginErrorCode,
	PluginSelectionV0,
} from "../types";

export interface MockPluginHostOptions {
	document?: PluginDocumentV0;
	selection?: PluginSelectionV0;
	capabilities?: Capability[];
	onNotify?: (params: NotifyParams) => void;
	onShowForm?: (schema: HostCallV0 & { method: "ui.showForm" }) => FormResultV0;
}

const emptyDocument = (): PluginDocumentV0 => ({
	revision: 0,
	lines: [],
	metadata: [],
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class MockPluginHost {
	private document: PluginDocumentV0;
	private readonly selection: PluginSelectionV0;
	private readonly granted: Set<Capability>;
	private readonly storage = new Map<string, JsonValue>();
	private readonly undoStack: PluginDocumentV0[] = [];
	private idSequence = 0;

	constructor(private readonly options: MockPluginHostOptions = {}) {
		this.document = clone(options.document ?? emptyDocument());
		this.selection = clone(options.selection ?? { lineIds: [], wordIds: [] });
		this.granted = new Set(options.capabilities ?? ["lyrics.core"]);
	}

	async call(input: unknown): Promise<HostResponseV0> {
		const parsed = parseHostCall(input);
		if (!parsed.ok) {
			return this.error(
				typeof input === "object" && input !== null && "id" in input
					? String((input as { id: unknown }).id)
					: "invalid",
				"invalid-params",
				parsed.issues
					.map((issue) => `${issue.path}: ${issue.message}`)
					.join("; "),
			);
		}
		const call = parsed.value;
		const required = requiredCapabilitiesForCall(call.method, call.params);
		if (!hasCapabilities(this.granted, required)) {
			return this.error(
				call.id,
				"permission-denied",
				`requires ${required.join(", ")}`,
			);
		}

		switch (call.method) {
			case "lyrics.getDocument":
				return this.ok(call.id, this.projectDocument());
			case "lyrics.getSelection":
				return this.ok(call.id, this.selection);
			case "lyrics.applyEdit": {
				const { expectedRevision, label: _label, ops } = call.params;
				if (
					expectedRevision !== -1 &&
					expectedRevision !== this.document.revision
				)
					return this.error(
						call.id,
						"revision-conflict",
						`expected ${expectedRevision}, actual ${this.document.revision}`,
					);
				const previous = clone(this.document);
				const failure = applyDocumentOpsV0(this.document, ops, {
					nextId: (kind) => this.nextId(kind),
				});
				if (failure !== undefined) {
					this.document = previous;
					return this.error(call.id, "not-found", failure);
				}
				this.undoStack.push(previous);
				this.document.revision += 1;
				return this.ok(call.id, {
					revision: this.document.revision,
					appliedOps: ops.length,
				});
			}
			case "ui.notify":
				this.options.onNotify?.(call.params);
				return this.ok(call.id, {});
			case "ui.showForm":
				return this.ok(
					call.id,
					this.options.onShowForm?.(call) ?? { submitted: false },
				);
			case "storage.get":
				return this.ok(call.id, {
					value: this.storage.get(call.params.key) ?? null,
				});
			case "storage.set":
				this.storage.set(call.params.key, clone(call.params.value));
				return this.ok(call.id, {});
			case "storage.delete":
				this.storage.delete(call.params.key);
				return this.ok(call.id, {});
			case "storage.keys":
				return this.ok(call.id, { keys: [...this.storage.keys()].sort() });
		}
	}

	async undo(): Promise<boolean> {
		const previous = this.undoStack.pop();
		if (!previous) return false;
		const revision = this.document.revision + 1;
		this.document = previous;
		this.document.revision = revision;
		return true;
	}

	private projectDocument(): PluginDocumentV0 {
		const projected = clone(this.document);
		if (!this.granted.has("lyrics.ruby")) {
			for (const line of projected.lines)
				for (const word of line.words) delete word.ruby;
		}
		return projected;
	}

	private nextId(kind: string): string {
		this.idSequence += 1;
		return `mock-${kind}-${this.idSequence}`;
	}

	private ok(id: string, value: unknown): HostResponseV0 {
		return { id, result: { ok: true, value: clone(value) as JsonValue } };
	}

	private error(
		id: string,
		code: PluginErrorCode,
		message: string,
	): HostResponseV0 {
		return { id, result: { ok: false, error: { code, message } } };
	}
}
