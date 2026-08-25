import {
	adjustLineEndTime,
	commitUpdatedLine as commitLine,
	getUpdatedLineForDivider,
	getUpdatedLineForLinePan,
	getUpdatedLineForWordPan,
	shiftLineStartTime,
	tryFixPartialInitialization,
	tryInitializeZeroTimestampLine,
} from "$/application/lyrics/LyricTimelineMutationService";
import { editorDocumentAdapter } from "$/plugins/adapters/editor-document.ts";

export {
	adjustLineEndTime,
	getUpdatedLineForDivider,
	getUpdatedLineForLinePan,
	getUpdatedLineForWordPan,
	shiftLineStartTime,
	tryFixPartialInitialization,
	tryInitializeZeroTimestampLine,
};

export function commitUpdatedLine(
	updatedLine: Parameters<typeof commitLine>[1],
) {
	return commitLine(editorDocumentAdapter, updatedLine);
}
