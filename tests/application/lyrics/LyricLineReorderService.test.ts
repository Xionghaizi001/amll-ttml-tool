import { describe, expect, it } from "vitest";
import { EditorDocumentService } from "$/kernel/editor";
import type { LyricLine } from "$/types/ttml";
import {
	type LyricLineReorderEnginePort,
	reorderDocumentLines,
} from "$/application/lyrics/LyricLineReorderService";

const line = (id: string): LyricLine => ({
	id,
	words: [],
	translatedLyric: "",
	romanLyric: "",
	isBG: false,
	isDuet: false,
	startTime: 0,
	endTime: 0,
	ignoreSync: false,
});

describe("LyricLineReorderService", () => {
	it("commits a reorder engine result as one undoable document change", () => {
		const document = new EditorDocumentService({
			metadata: [],
			lyricLines: [line("a"), line("b"), line("c")],
		});
		const engine: LyricLineReorderEnginePort = {
			reorderOrCopy(lines) {
				return {
					nextLines: [lines[2], lines[0], lines[1]],
					newlyCreatedIds: new Set(),
				};
			},
		};

		const result = reorderDocumentLines(
			document,
			{ draggedIds: new Set(["c"]), dropIndex: 0, isCopy: false },
			engine,
		);
		expect(result.event?.revision).toBe(1);
		expect(document.readSnapshot().lyricLines.map((item) => item.id)).toEqual([
			"c",
			"a",
			"b",
		]);
		document.undo();
		expect(document.readSnapshot().lyricLines.map((item) => item.id)).toEqual([
			"a",
			"b",
			"c",
		]);
	});
});
