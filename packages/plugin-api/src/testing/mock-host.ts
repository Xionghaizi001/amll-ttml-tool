import { parseHostCall } from "../parsers";
import { hasCapabilities, requiredCapabilitiesForCall } from "../permissions";
import type {
	Capability,
	DocumentOpV0,
	FormResultV0,
	HostCallV0,
	HostResponseV0,
	JsonValue,
	NewLineV0,
	NewWordV0,
	NotifyParams,
	PluginDocumentV0,
	PluginErrorCode,
	PluginLineV0,
	PluginSelectionV0,
	PluginWordV0,
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
				for (const op of ops) {
					const result = this.applyOp(op);
					if (result) {
						this.document = previous;
						return this.error(call.id, "not-found", result);
					}
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

	private applyOp(op: DocumentOpV0): string | undefined {
		switch (op.op) {
			case "updateLine": {
				const line = this.document.lines.find((item) => item.id === op.lineId);
				if (!line) return `line ${op.lineId} was not found`;
				Object.assign(line, clone(op.patch));
				return;
			}
			case "updateWord": {
				const word = this.findWord(op.wordId);
				if (!word) return `word ${op.wordId} was not found`;
				Object.assign(word, clone(op.patch));
				return;
			}
			case "insertLine":
				return this.insertAfter(
					this.document.lines,
					op.afterLineId,
					this.createLine(op.line),
					"line",
				);
			case "removeLine": {
				const index = this.document.lines.findIndex(
					(line) => line.id === op.lineId,
				);
				if (index < 0) return `line ${op.lineId} was not found`;
				this.document.lines.splice(index, 1);
				return;
			}
			case "moveLine": {
				const index = this.document.lines.findIndex(
					(line) => line.id === op.lineId,
				);
				if (index < 0) return `line ${op.lineId} was not found`;
				const [line] = this.document.lines.splice(index, 1);
				const result = this.insertAfter(
					this.document.lines,
					op.afterLineId,
					line,
					"line",
				);
				if (result) this.document.lines.splice(index, 0, line);
				return result;
			}
			case "insertWord": {
				const line = this.document.lines.find((item) => item.id === op.lineId);
				if (!line) return `line ${op.lineId} was not found`;
				return this.insertAfter(
					line.words,
					op.afterWordId,
					this.createWord(op.word),
					"word",
				);
			}
			case "removeWord": {
				for (const line of this.document.lines) {
					const index = line.words.findIndex((word) => word.id === op.wordId);
					if (index >= 0) {
						line.words.splice(index, 1);
						return;
					}
				}
				return `word ${op.wordId} was not found`;
			}
			case "setMetadata":
				this.document.metadata = clone(op.entries);
				return;
			case "replaceDocument":
				this.document.lines = op.lines.map((line) => this.createLine(line));
				this.document.metadata = clone(op.metadata);
				return;
		}
	}

	private insertAfter<T extends { id: string }>(
		items: T[],
		afterId: string | null,
		item: T,
		kind: string,
	): string | undefined {
		if (afterId === null) {
			items.unshift(item);
			return;
		}
		const index = items.findIndex((candidate) => candidate.id === afterId);
		if (index < 0) return `${kind} ${afterId} was not found`;
		items.splice(index + 1, 0, item);
	}

	private findWord(id: string): PluginWordV0 | undefined {
		for (const line of this.document.lines) {
			const word = line.words.find((item) => item.id === id);
			if (word) return word;
		}
	}

	private createLine(line: NewLineV0): PluginLineV0 {
		return {
			...clone(line),
			id: this.nextId("line"),
			words: line.words.map((word) => this.createWord(word)),
		};
	}

	private createWord(word: NewWordV0): PluginWordV0 {
		return { ...clone(word), id: this.nextId("word") };
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
