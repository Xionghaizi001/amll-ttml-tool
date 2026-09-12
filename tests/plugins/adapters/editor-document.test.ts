import { atom, createStore } from "jotai/vanilla";
import { describe, expect, it } from "vitest";
import type { TTMLLyric } from "$/types/ttml";
import { EditorDocumentAtomAdapter } from "$/plugins/adapters/editor-document";

const document: TTMLLyric = { metadata: [], lyricLines: [] };

describe("EditorDocumentAtomAdapter", () => {
	it("publishes a transaction to the host atom", () => {
		const store = createStore();
		const documentAtom = atom(document);
		const adapter = new EditorDocumentAtomAdapter(store, documentAtom);

		adapter.transact({ source: "user", label: "Add metadata" }, (draft) => {
			draft.metadata.push({ key: "title", value: ["Example"] });
		});

		expect(store.get(documentAtom).metadata[0]?.value).toEqual(["Example"]);
		expect(adapter.getRevision()).toBe(1);
		adapter.dispose();
	});

	it("advances revision when a legacy writer changes the atom", () => {
		const store = createStore();
		const documentAtom = atom(document);
		const adapter = new EditorDocumentAtomAdapter(store, documentAtom);
		const expectedRevision = adapter.getRevision();

		store.set(documentAtom, {
			metadata: [{ key: "title", value: ["Legacy"] }],
			lyricLines: [],
		});

		expect(adapter.getRevision()).toBe(expectedRevision + 1);
		expect(() =>
			adapter.transact(
				{ source: "plugin", label: "Stale edit", expectedRevision },
				(draft) => {
					draft.metadata[0].value = ["Plugin"];
				},
			),
		).toThrow();
		adapter.dispose();
	});
});
