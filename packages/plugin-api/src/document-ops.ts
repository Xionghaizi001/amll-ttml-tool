import type {
	DocumentOpV0,
	NewLineV0,
	NewWordV0,
	PluginDocumentV0,
	PluginLineV0,
	PluginWordV0,
} from "./types";

/**
 * Host-side id allocation for lines/words a plugin inserts. Plugins never
 * pick ids themselves; the host assigns them so they stay unique and stable.
 */
export interface DocumentOpIdAllocator {
	nextId(kind: "line" | "word"): string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const insertAfter = <T extends { id: string }>(
	items: T[],
	afterId: string | null,
	item: T,
	kind: string,
): string | undefined => {
	if (afterId === null) {
		items.unshift(item);
		return;
	}
	const index = items.findIndex((candidate) => candidate.id === afterId);
	if (index < 0) return `${kind} ${afterId} was not found`;
	items.splice(index + 1, 0, item);
};

const createWord = (word: NewWordV0, ids: DocumentOpIdAllocator): PluginWordV0 => ({
	...clone(word),
	id: ids.nextId("word"),
});

const createLine = (line: NewLineV0, ids: DocumentOpIdAllocator): PluginLineV0 => ({
	...clone(line),
	id: ids.nextId("line"),
	words: line.words.map((word) => createWord(word, ids)),
});

const findWord = (
	document: PluginDocumentV0,
	id: string,
): PluginWordV0 | undefined => {
	for (const line of document.lines) {
		const word = line.words.find((item) => item.id === id);
		if (word) return word;
	}
};

/**
 * Applies one document op to a projected document, mutating it in place.
 * Returns an error message on failure; the caller owns transactionality
 * (clone before, discard the mutated copy on error).
 */
export const applyDocumentOpV0 = (
	document: PluginDocumentV0,
	op: DocumentOpV0,
	ids: DocumentOpIdAllocator,
): string | undefined => {
	switch (op.op) {
		case "updateLine": {
			const line = document.lines.find((item) => item.id === op.lineId);
			if (!line) return `line ${op.lineId} was not found`;
			Object.assign(line, clone(op.patch));
			return;
		}
		case "updateWord": {
			const word = findWord(document, op.wordId);
			if (!word) return `word ${op.wordId} was not found`;
			Object.assign(word, clone(op.patch));
			return;
		}
		case "insertLine":
			return insertAfter(
				document.lines,
				op.afterLineId,
				createLine(op.line, ids),
				"line",
			);
		case "removeLine": {
			const index = document.lines.findIndex((line) => line.id === op.lineId);
			if (index < 0) return `line ${op.lineId} was not found`;
			document.lines.splice(index, 1);
			return;
		}
		case "moveLine": {
			const index = document.lines.findIndex((line) => line.id === op.lineId);
			if (index < 0) return `line ${op.lineId} was not found`;
			const [line] = document.lines.splice(index, 1);
			const result = insertAfter(document.lines, op.afterLineId, line, "line");
			if (result) document.lines.splice(index, 0, line);
			return result;
		}
		case "insertWord": {
			const line = document.lines.find((item) => item.id === op.lineId);
			if (!line) return `line ${op.lineId} was not found`;
			return insertAfter(
				line.words,
				op.afterWordId,
				createWord(op.word, ids),
				"word",
			);
		}
		case "removeWord": {
			for (const line of document.lines) {
				const index = line.words.findIndex((word) => word.id === op.wordId);
				if (index >= 0) {
					line.words.splice(index, 1);
					return;
				}
			}
			return `word ${op.wordId} was not found`;
		}
		case "setMetadata":
			document.metadata = clone(op.entries);
			return;
		case "replaceDocument":
			document.lines = op.lines.map((line) => createLine(line, ids));
			document.metadata = clone(op.metadata);
			return;
	}
};

/**
 * Applies a batch of ops in order, mutating the document. Stops at the first
 * failing op and returns its message; the caller must discard the partially
 * mutated document (edits are all-or-nothing at the transaction boundary).
 */
export const applyDocumentOpsV0 = (
	document: PluginDocumentV0,
	ops: readonly DocumentOpV0[],
	ids: DocumentOpIdAllocator,
): string | undefined => {
	for (const op of ops) {
		const error = applyDocumentOpV0(document, op, ids);
		if (error !== undefined) return error;
	}
};

/** Sequential allocator used by hosts that only need per-session uniqueness. */
export const createSequentialIdAllocator = (
	prefix = "host",
): DocumentOpIdAllocator => {
	let sequence = 0;
	return {
		nextId: (kind) => {
			sequence += 1;
			return `${prefix}-${kind}-${sequence}`;
		},
	};
};
