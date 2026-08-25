import type {
	DocumentChangeEvent,
	EditorDocumentService,
} from "../../kernel/editor";
import type { LyricLine } from "../../types/ttml";

export interface LyricLineReorderEnginePort {
	reorderOrCopy(
		originalLines: LyricLine[],
		draggedIds: Set<string>,
		dropIndex: number,
		isCopy: boolean,
	): { nextLines: LyricLine[]; newlyCreatedIds: Set<string> };
}

export type LyricLineReorderDocumentPort = Pick<
	EditorDocumentService,
	"getRevision" | "transact"
>;

export function reorderDocumentLines(
	document: LyricLineReorderDocumentPort,
	request: {
		draggedIds: Set<string>;
		dropIndex: number;
		isCopy: boolean;
	},
	engine: LyricLineReorderEnginePort,
): {
	event: DocumentChangeEvent | undefined;
	newlyCreatedIds: Set<string>;
} {
	let newlyCreatedIds = new Set<string>();
	const event = document.transact(
		{
			source: "user",
			label: request.isCopy ? "Copy lyric lines" : "Reorder lyric lines",
			expectedRevision: document.getRevision(),
		},
		(draft) => {
			const result = engine.reorderOrCopy(
				draft.lyricLines,
				request.draggedIds,
				request.dropIndex,
				request.isCopy,
			);
			draft.lyricLines = result.nextLines;
			newlyCreatedIds = result.newlyCreatedIds;
		},
	);
	return { event, newlyCreatedIds };
}
