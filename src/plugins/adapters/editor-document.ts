import type { WritableAtom, createStore } from "jotai/vanilla";
import { lyricLinesAtom } from "$/states/main";
import { globalStore } from "$/states/store";
import type { TTMLLyric } from "$/types/ttml";
import {
	EditorDocumentService,
	type DocumentTransactionMeta,
	type DocumentUpdater,
} from "$/kernel/editor/EditorDocumentService";

type Store = ReturnType<typeof createStore>;

export class EditorDocumentAtomAdapter {
	private syncing = false;
	private readonly unsubscribe: () => void;

	constructor(
		private readonly store: Store,
		private readonly documentAtom: WritableAtom<
			TTMLLyric,
			[TTMLLyric],
			unknown
		>,
		readonly service = new EditorDocumentService(store.get(documentAtom)),
	) {
		this.unsubscribe = store.sub(documentAtom, () => this.syncFromAtom());
	}

	readSnapshot(): TTMLLyric {
		return this.service.readSnapshot();
	}

	getRevision(): number {
		return this.service.getRevision();
	}

	transact(meta: DocumentTransactionMeta, updater: DocumentUpdater) {
		const event = this.service.transact(meta, updater);
		if (event) this.publish();
		return event;
	}

	replace(document: TTMLLyric, meta: DocumentTransactionMeta) {
		const event = this.service.replace(document, meta);
		if (event) this.publish();
		return event;
	}

	undo(meta?: Omit<DocumentTransactionMeta, "expectedRevision">) {
		const event = this.service.undo(meta);
		if (event) this.publish();
		return event;
	}

	redo(meta?: Omit<DocumentTransactionMeta, "expectedRevision">) {
		const event = this.service.redo(meta);
		if (event) this.publish();
		return event;
	}

	private publish(): void {
		this.syncing = true;
		try {
			this.store.set(this.documentAtom, this.service.readSnapshot());
		} finally {
			this.syncing = false;
		}
	}

	/** Host migration hook for legacy writers while direct atom writes are being removed. */
	syncFromAtom(): void {
		if (this.syncing) return;
		const current = this.store.get(this.documentAtom);
		if (JSON.stringify(current) === JSON.stringify(this.service.readSnapshot()))
			return;
		this.service.observeExternal(current);
	}

	dispose(): void {
		this.unsubscribe();
	}
}

/** Transitional host adapter shared by migrated tools until all legacy writers are removed. */
export const editorDocumentAdapter = new EditorDocumentAtomAdapter(
	globalStore,
	lyricLinesAtom,
);
