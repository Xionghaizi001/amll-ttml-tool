import type { TTMLLyric } from "$/types/ttml";
import {
	deriveDocumentId,
	deriveElementId,
	deriveLineId,
} from "$/utils/content-addressed-id";

export type ReviewElementPath = Array<string | number>;

export type ReviewStructuredElement = {
	id: string;
	kind: "object" | "array" | "value";
	path: ReviewElementPath;
	value?: string | number | boolean | null;
};

export type ReviewStructuredLine = {
	id: string;
	/** 编辑器运行时行 id，仅会话内用于 rebind，不进入导出协议。 */
	sourceLineId: string;
	lineIndex: number;
	elementIds: string[];
};

export type ReviewStructuredSnapshot = {
	schemaVersion: 1;
	/** 等于 contentHash，跨端可复现。 */
	documentId: string;
	contentHash: string;
	lines: ReviewStructuredLine[];
	elements: ReviewStructuredElement[];
};

const isPrimitive = (
	value: unknown,
): value is string | number | boolean | null =>
	value === null ||
	typeof value === "string" ||
	typeof value === "number" ||
	typeof value === "boolean";

/**
 * Builds a review-only identity graph.
 * IDs are content-addressed (contentHash + path) so the same file always yields
 * the same IDs without persisting a mapping table. Runtime TTML ids stay out of
 * the export protocol.
 */
export const createReviewStructuredSnapshot = (
	lyrics: TTMLLyric,
	contentHash: string,
): ReviewStructuredSnapshot => {
	const documentId = deriveDocumentId(contentHash);
	const elements: ReviewStructuredElement[] = [];
	const elementIdsByLine = new Map<number, string[]>();

	const addElement = (
		kind: ReviewStructuredElement["kind"],
		path: ReviewElementPath,
		value?: ReviewStructuredElement["value"],
	) => {
		const id = deriveElementId(contentHash, path);
		elements.push({
			id,
			kind,
			path,
			...(value !== undefined ? { value } : {}),
		});
		if (path[0] === "lyricLines" && typeof path[1] === "number") {
			const lineElementIds = elementIdsByLine.get(path[1]) ?? [];
			lineElementIds.push(id);
			elementIdsByLine.set(path[1], lineElementIds);
		}
	};

	const visit = (
		value: unknown,
		path: ReviewElementPath,
		options: { skipObject?: boolean } = {},
	) => {
		if (isPrimitive(value)) {
			addElement("value", path, value);
			return;
		}
		if (Array.isArray(value)) {
			addElement("array", path);
			value.forEach((item, index) => {
				visit(item, [...path, index]);
			});
			return;
		}
		if (typeof value !== "object" || value === undefined) return;

		if (!options.skipObject) addElement("object", path);
		for (const [key, child] of Object.entries(value)) {
			// Runtime editor IDs identify source objects but are not editable fields.
			if (key === "id") continue;
			visit(child, [...path, key]);
		}
	};

	for (const [key, value] of Object.entries(lyrics)) {
		if (key !== "lyricLines") {
			visit(value, [key]);
			continue;
		}
		addElement("array", [key]);
		lyrics.lyricLines.forEach((line, lineIndex) => {
			visit(line, [key, lineIndex], { skipObject: true });
		});
	}

	const lines = lyrics.lyricLines.map((line, lineIndex) => ({
		id: deriveLineId(contentHash, lineIndex),
		sourceLineId: line.id,
		lineIndex,
		elementIds: elementIdsByLine.get(lineIndex) ?? [],
	}));

	return {
		schemaVersion: 1,
		documentId,
		contentHash,
		lines,
		elements,
	};
};

export const rebindReviewStructuredSnapshot = (
	snapshot: ReviewStructuredSnapshot,
	lyrics: TTMLLyric,
): ReviewStructuredSnapshot => ({
	...snapshot,
	lines: snapshot.lines.map((line) => ({
		...line,
		sourceLineId: lyrics.lyricLines[line.lineIndex]?.id ?? line.sourceLineId,
	})),
});
