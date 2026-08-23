import { produce } from "immer";
import { uid } from "uid";
import type { LyricLine, LyricWord, TTMLLyric } from "$/types/ttml";

export type DocumentChangeSource = "user" | "plugin" | "system" | "legacy-ui";

export interface DocumentTransactionMeta {
	source: DocumentChangeSource;
	label: string;
	pluginId?: string;
	expectedRevision?: number;
}

export interface DocumentChangeEvent {
	readonly revision: number;
	readonly previousRevision: number;
	readonly transaction: Readonly<DocumentTransactionMeta>;
	readonly changedLineIds: readonly string[];
	readonly changedWordIds: readonly string[];
}

export interface PublicLyricWord {
	id: string;
	startTime: number;
	endTime: number;
	word: string;
	romanWord?: string;
	ruby?: {
		startTime: number;
		endTime: number;
		word: string;
		emptyBeat?: number;
	}[];
}

export interface PublicLyricLine {
	id: string;
	startTime: number;
	endTime: number;
	translatedLyric: string;
	romanLyric: string;
	isBG: boolean;
	isDuet: boolean;
	ignoreSync: boolean;
	words: PublicLyricWord[];
}

export interface PublicDocument {
	metadata: TTMLLyric["metadata"];
	lyricLines: PublicLyricLine[];
}

export class DocumentRevisionConflictError extends Error {
	readonly expectedRevision: number;
	readonly actualRevision: number;

	constructor(expectedRevision: number, actualRevision: number) {
		super(
			`Document revision conflict: expected ${expectedRevision}, actual ${actualRevision}`,
		);
		this.name = "DocumentRevisionConflictError";
		this.expectedRevision = expectedRevision;
		this.actualRevision = actualRevision;
	}
}

export type DocumentUpdater = (draft: TTMLLyric) => undefined | TTMLLyric;

const clone = <T>(value: T): T => structuredClone(value);

const normalizeWord = (word: LyricWord): LyricWord => ({
	...word,
	id: word.id || uid(),
});

const normalizeLine = (line: LyricLine): LyricLine => ({
	...line,
	id: line.id || uid(),
	words: line.words.map(normalizeWord),
});

export const normalizeDocument = (document: TTMLLyric): TTMLLyric => ({
	...clone(document),
	metadata: document.metadata.map((item) => ({
		...item,
		value: [...item.value],
	})),
	lyricLines: document.lyricLines.map(normalizeLine),
});

/** Return the stable, host-facing document projection. Internal editor fields are omitted. */
export const toPublicDocument = (document: TTMLLyric): PublicDocument => ({
	metadata: document.metadata.map((item) => ({
		key: item.key,
		value: [...item.value],
		...(item.error === undefined ? {} : { error: item.error }),
	})),
	lyricLines: document.lyricLines.map((line) => ({
		id: line.id,
		startTime: line.startTime,
		endTime: line.endTime,
		translatedLyric: line.translatedLyric,
		romanLyric: line.romanLyric,
		isBG: line.isBG,
		isDuet: line.isDuet,
		ignoreSync: line.ignoreSync,
		words: line.words.map((word) => ({
			id: word.id,
			startTime: word.startTime,
			endTime: word.endTime,
			word: word.word,
			romanWord: word.romanWord,
			ruby: word.ruby?.map((rubyWord) => ({ ...rubyWord })),
		})),
	})),
});

export class EditorDocumentService {
	private document: TTMLLyric;
	private revision = 0;
	private readonly undoStack: TTMLLyric[] = [];
	private readonly redoStack: TTMLLyric[] = [];
	private readonly listeners = new Set<(event: DocumentChangeEvent) => void>();

	constructor(
		initialDocument: TTMLLyric = { lyricLines: [], metadata: [] },
		private readonly historyLimit = 256,
	) {
		this.document = normalizeDocument(initialDocument);
	}

	readSnapshot(): TTMLLyric {
		return clone(this.document);
	}

	/** Replace the in-memory baseline without creating history (used by a host adapter during boot). */
	load(document: TTMLLyric, revision = 0): void {
		this.document = normalizeDocument(document);
		this.revision = revision;
		this.undoStack.length = 0;
		this.redoStack.length = 0;
	}

	/** Observe a legacy host write during migration without creating a second undo entry. */
	observeExternal(document: TTMLLyric): DocumentChangeEvent | undefined {
		const previous = this.document;
		const next = normalizeDocument(document);
		if (JSON.stringify(previous) === JSON.stringify(next)) return;
		return this.commit(
			previous,
			next,
			{ source: "legacy-ui", label: "Legacy document write" },
			{ recordUndo: false },
		);
	}

	readPublicSnapshot(): PublicDocument {
		return toPublicDocument(this.document);
	}

	getRevision(): number {
		return this.revision;
	}

	canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	subscribe(listener: (event: DocumentChangeEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	transact(
		meta: DocumentTransactionMeta,
		updater: DocumentUpdater,
	): DocumentChangeEvent | undefined {
		this.assertRevision(meta.expectedRevision);
		const previous = this.document;
		const next = normalizeDocument(produce(previous, updater));
		if (JSON.stringify(previous) === JSON.stringify(next)) return;
		return this.commit(previous, next, meta);
	}

	replace(
		document: TTMLLyric,
		meta: DocumentTransactionMeta,
	): DocumentChangeEvent | undefined {
		return this.transact(meta, () => document);
	}

	undo(
		meta: Omit<DocumentTransactionMeta, "expectedRevision"> = {
			source: "user",
			label: "Undo",
		},
	): DocumentChangeEvent | undefined {
		const previous = this.document;
		const next = this.undoStack.pop();
		if (!next) return;
		this.redoStack.push(clone(previous));
		return this.commit(previous, next, meta, {
			recordUndo: false,
			clearRedo: false,
		});
	}

	redo(
		meta: Omit<DocumentTransactionMeta, "expectedRevision"> = {
			source: "user",
			label: "Redo",
		},
	): DocumentChangeEvent | undefined {
		const previous = this.document;
		const next = this.redoStack.pop();
		if (!next) return;
		this.undoStack.push(clone(previous));
		return this.commit(previous, next, meta, {
			recordUndo: false,
			clearRedo: false,
		});
	}

	private assertRevision(expectedRevision: number | undefined): void {
		if (expectedRevision !== undefined && expectedRevision !== this.revision) {
			throw new DocumentRevisionConflictError(expectedRevision, this.revision);
		}
	}

	private commit(
		previous: TTMLLyric,
		next: TTMLLyric,
		meta: DocumentTransactionMeta,
		options: { recordUndo?: boolean; clearRedo?: boolean } = {},
	): DocumentChangeEvent {
		const previousRevision = this.revision;
		this.document = clone(next);
		this.revision += 1;
		if (options.recordUndo ?? true) {
			this.undoStack.push(clone(previous));
			if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
		}
		if (options.clearRedo ?? true) this.redoStack.length = 0;
		const previousLines = new Map(
			previous.lyricLines.map((line) => [line.id, line]),
		);
		const nextLines = new Map(next.lyricLines.map((line) => [line.id, line]));
		const changedLineIds = new Set<string>();
		const changedWordIds = new Set<string>();
		for (const [id, line] of nextLines) {
			if (JSON.stringify(previousLines.get(id)) !== JSON.stringify(line))
				changedLineIds.add(id);
			const oldWords = new Map(
				(previousLines.get(id)?.words ?? []).map((word) => [word.id, word]),
			);
			for (const word of line.words) {
				if (JSON.stringify(oldWords.get(word.id)) !== JSON.stringify(word))
					changedWordIds.add(word.id);
			}
		}
		for (const [id, line] of previousLines) {
			const nextWords = new Map(
				(nextLines.get(id)?.words ?? []).map((word) => [word.id, word]),
			);
			for (const word of line.words)
				if (!nextWords.has(word.id)) changedWordIds.add(word.id);
		}
		for (const id of previousLines.keys())
			if (!nextLines.has(id)) changedLineIds.add(id);
		const event: DocumentChangeEvent = {
			revision: this.revision,
			previousRevision,
			transaction: { ...meta },
			changedLineIds: [...changedLineIds],
			changedWordIds: [...changedWordIds],
		};
		for (const listener of this.listeners) listener(event);
		return event;
	}
}
