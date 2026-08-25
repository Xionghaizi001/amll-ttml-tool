import type { LyricLineReorderEnginePort } from "$/application/lyrics";
import { reorderOrCopyLyricLines } from "$/modules/lyric-drag/drag-reorder";

export const lyricLineReorderEngine: LyricLineReorderEnginePort = {
	reorderOrCopy: reorderOrCopyLyricLines,
};
