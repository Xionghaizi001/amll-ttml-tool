import { describe, expect, it, vi } from "vitest";
import type { TTMLLyric } from "$/types/ttml";
import {
	DocumentRevisionConflictError,
	EditorDocumentService,
} from "$/kernel/editor/EditorDocumentService";

function createDocument(): TTMLLyric {
	return {
		metadata: [{ key: "title", value: ["Before"], error: false }],
		lyricLines: [
			{
				id: "line-1",
				startTime: 0,
				endTime: 1000,
				translatedLyric: "",
				romanLyric: "",
				isBG: false,
				isDuet: false,
				ignoreSync: false,
				words: [
					{
						id: "word-1",
						startTime: 0,
						endTime: 1000,
						word: "hello",
						romanWord: "",
						obscene: true,
						emptyBeat: 12,
					},
				],
			},
		],
	};
}

describe("EditorDocumentService", () => {
	it("normalizes missing line and word IDs", () => {
		const input = createDocument();
		input.lyricLines[0].id = "";
		input.lyricLines[0].words[0].id = "";

		const service = new EditorDocumentService(input);
		const snapshot = service.readSnapshot();

		expect(snapshot.lyricLines[0].id).toBeTruthy();
		expect(snapshot.lyricLines[0].words[0].id).toBeTruthy();
	});

	it("returns a public projection without host-only word fields", () => {
		const publicDocument = new EditorDocumentService(
			createDocument(),
		).readPublicSnapshot();
		const publicWord = publicDocument.lyricLines[0].words[0] as Record<
			string,
			unknown
		>;

		expect(publicWord.id).toBe("word-1");
		expect(publicWord.word).toBe("hello");
		expect(publicWord.obscene).toBeUndefined();
		expect(publicWord.emptyBeat).toBeUndefined();
	});

	it("commits one transaction as one undo entry and emits source metadata", () => {
		const service = new EditorDocumentService(createDocument());
		const listener = vi.fn();
		service.subscribe(listener);

		const event = service.transact(
			{
				source: "plugin",
				label: "Replace title",
				pluginId: "example.plugin",
			},
			(draft) => {
				draft.metadata[0].value = ["After"];
			},
		);

		expect(event).toMatchObject({
			revision: 1,
			previousRevision: 0,
			transaction: {
				source: "plugin",
				label: "Replace title",
				pluginId: "example.plugin",
			},
		});
		expect(listener).toHaveBeenCalledTimes(1);
		expect(service.readSnapshot().metadata[0].value).toEqual(["After"]);
		expect(service.canUndo()).toBe(true);

		service.undo();
		expect(service.readSnapshot().metadata[0].value).toEqual(["Before"]);
		expect(service.canRedo()).toBe(true);
	});

	it("supports redo and clears redo history after a new edit", () => {
		const service = new EditorDocumentService(createDocument());
		service.transact({ source: "user", label: "Edit" }, (draft) => {
			draft.lyricLines[0].words[0].word = "changed";
		});
		service.undo();
		service.redo();
		expect(service.readSnapshot().lyricLines[0].words[0].word).toBe("changed");

		service.undo();
		service.transact({ source: "user", label: "Another edit" }, (draft) => {
			draft.lyricLines[0].words[0].word = "new";
		});
		expect(service.canRedo()).toBe(false);
	});

	it("rejects stale asynchronous writes with a revision conflict", () => {
		const service = new EditorDocumentService(createDocument());
		const expectedRevision = service.getRevision();
		service.transact({ source: "user", label: "User edit" }, (draft) => {
			draft.lyricLines[0].startTime = 250;
		});

		expect(() =>
			service.transact(
				{
					source: "plugin",
					label: "Stale plugin edit",
					pluginId: "stale.plugin",
					expectedRevision,
				},
				(draft) => {
					draft.lyricLines[0].endTime = 2000;
				},
			),
		).toThrow(DocumentRevisionConflictError);
		expect(service.readSnapshot().lyricLines[0].endTime).toBe(1000);
	});

	it("does not create history or events for a no-op transaction", () => {
		const service = new EditorDocumentService(createDocument());
		const listener = vi.fn();
		service.subscribe(listener);

		const result = service.transact(
			{ source: "system", label: "No-op" },
			() => {},
		);

		expect(result).toBeUndefined();
		expect(service.getRevision()).toBe(0);
		expect(service.canUndo()).toBe(false);
		expect(listener).not.toHaveBeenCalled();
	});

	it("trims the oldest undo entries beyond the history limit", () => {
		const service = new EditorDocumentService(createDocument(), 2);
		for (const value of ["one", "two", "three"]) {
			service.transact({ source: "user", label: `Set ${value}` }, (draft) => {
				draft.lyricLines[0].words[0].word = value;
			});
		}

		service.undo();
		service.undo();
		expect(service.canUndo()).toBe(false);
		// The oldest state ("hello" -> "one") was trimmed; we can only get back to "one".
		expect(service.readSnapshot().lyricLines[0].words[0].word).toBe("one");
	});

	it("preserves unknown host fields across transact and undo", () => {
		const service = new EditorDocumentService(createDocument());
		service.transact({ source: "user", label: "Edit word" }, (draft) => {
			draft.lyricLines[0].words[0].word = "changed";
		});

		const word = service.readSnapshot().lyricLines[0].words[0] as Record<
			string,
			unknown
		>;
		expect(word.obscene).toBe(true);
		expect(word.emptyBeat).toBe(12);

		service.undo();
		const restored = service.readSnapshot().lyricLines[0].words[0] as Record<
			string,
			unknown
		>;
		expect(restored.obscene).toBe(true);
		expect(restored.emptyBeat).toBe(12);
	});
});
