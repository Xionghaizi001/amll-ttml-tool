import type {
	ApplyEditResult,
	DocumentOpV0,
	HostResult,
	NewLineV0,
	NewWordV0,
	PluginDocumentV0,
	PluginLinePatchV0,
	PluginRubySegmentV0,
	PluginWordPatchV0,
} from "@amll-ttml-tool/plugin-api";
import type {
	DocumentChangeEvent,
	DocumentTransactionMeta,
} from "$/kernel/editor/EditorDocumentService";
import type { LyricLine, LyricWord, LyricWordBase, TTMLLyric } from "$/types/ttml";

/**
 * Projects the internal document into the stable v0 plugin projection.
 * Internal-only fields (obscene, romanWarning, endTimeLink, custom fork
 * extensions) are intentionally absent; they are preserved on write-back
 * because ops patch the internal objects in place by id.
 */
export const toPluginDocument = (
	document: TTMLLyric,
	revision: number,
	options: { includeRuby: boolean },
): PluginDocumentV0 => ({
	revision,
	lines: document.lyricLines.map((line) => ({
		id: line.id,
		words: line.words.map((word) => ({
			id: word.id,
			text: word.word,
			startTime: word.startTime,
			endTime: word.endTime,
			emptyBeat: word.emptyBeat ?? 0,
			romanText: word.romanWord ?? "",
			...(options.includeRuby && word.ruby !== undefined
				? {
						ruby: word.ruby.map((segment) => ({
							text: segment.word,
							startTime: segment.startTime,
							endTime: segment.endTime,
						})),
					}
				: {}),
		})),
		translation: line.translatedLyric,
		romanization: line.romanLyric,
		isBackground: line.isBG,
		isDuet: line.isDuet,
		startTime: line.startTime,
		endTime: line.endTime,
		ignoreSync: line.ignoreSync,
	})),
	metadata: document.metadata.map((entry) => ({
		key: entry.key,
		values: [...entry.value],
	})),
});

class PluginOpError extends Error {}

const toRuby = (segments: PluginRubySegmentV0[]): LyricWordBase[] =>
	segments.map((segment) => ({
		word: segment.text,
		startTime: segment.startTime,
		endTime: segment.endTime,
	}));

const patchWord = (word: LyricWord, patch: PluginWordPatchV0): void => {
	if (patch.text !== undefined) word.word = patch.text;
	if (patch.startTime !== undefined) word.startTime = patch.startTime;
	if (patch.endTime !== undefined) word.endTime = patch.endTime;
	if (patch.emptyBeat !== undefined) word.emptyBeat = patch.emptyBeat;
	if (patch.romanText !== undefined) word.romanWord = patch.romanText;
	if (patch.ruby !== undefined) word.ruby = toRuby(patch.ruby);
};

const patchLine = (line: LyricLine, patch: PluginLinePatchV0): void => {
	if (patch.translation !== undefined) line.translatedLyric = patch.translation;
	if (patch.romanization !== undefined) line.romanLyric = patch.romanization;
	if (patch.isBackground !== undefined) line.isBG = patch.isBackground;
	if (patch.isDuet !== undefined) line.isDuet = patch.isDuet;
	if (patch.startTime !== undefined) line.startTime = patch.startTime;
	if (patch.endTime !== undefined) line.endTime = patch.endTime;
	if (patch.ignoreSync !== undefined) line.ignoreSync = patch.ignoreSync;
};

export interface PluginOpIdAllocator {
	nextId(kind: "line" | "word"): string;
}

/**
 * Deterministic id allocator seeded per plugin turn. The worker-side turn
 * host derives identical ids from the same seed and sequence, so ids a guest
 * observed from its own inserts stay valid at commit time.
 */
export const createSeededIdAllocator = (seed: string): PluginOpIdAllocator => {
	let sequence = 0;
	return {
		nextId: (kind) => {
			sequence += 1;
			return `${seed}-${kind}-${sequence}`;
		},
	};
};

// Allocation order must match document-ops createLine/createWord: the line id
// is assigned before its word ids, words in array order.
const createWord = (word: NewWordV0, ids: PluginOpIdAllocator): LyricWord => ({
	id: ids.nextId("word"),
	word: word.text,
	startTime: word.startTime,
	endTime: word.endTime,
	emptyBeat: word.emptyBeat,
	romanWord: word.romanText,
	obscene: false,
	...(word.ruby !== undefined ? { ruby: toRuby(word.ruby) } : {}),
});

const createLine = (line: NewLineV0, ids: PluginOpIdAllocator): LyricLine => {
	const id = ids.nextId("line");
	return {
		id,
		words: line.words.map((word) => createWord(word, ids)),
		translatedLyric: line.translation,
		romanLyric: line.romanization,
		isBG: line.isBackground,
		isDuet: line.isDuet,
		startTime: line.startTime,
		endTime: line.endTime,
		ignoreSync: line.ignoreSync,
	};
};

const insertAfter = <T extends { id: string }>(
	items: T[],
	afterId: string | null,
	item: T,
	kind: string,
): void => {
	if (afterId === null) {
		items.unshift(item);
		return;
	}
	const index = items.findIndex((candidate) => candidate.id === afterId);
	if (index < 0) throw new PluginOpError(`${kind} ${afterId} was not found`);
	items.splice(index + 1, 0, item);
};

const applyOp = (
	draft: TTMLLyric,
	op: DocumentOpV0,
	ids: PluginOpIdAllocator,
): void => {
	switch (op.op) {
		case "updateLine": {
			const line = draft.lyricLines.find((item) => item.id === op.lineId);
			if (!line) throw new PluginOpError(`line ${op.lineId} was not found`);
			patchLine(line, op.patch);
			return;
		}
		case "updateWord": {
			for (const line of draft.lyricLines) {
				const word = line.words.find((item) => item.id === op.wordId);
				if (word) {
					patchWord(word, op.patch);
					return;
				}
			}
			throw new PluginOpError(`word ${op.wordId} was not found`);
		}
		case "insertLine":
			insertAfter(
				draft.lyricLines,
				op.afterLineId,
				createLine(op.line, ids),
				"line",
			);
			return;
		case "removeLine": {
			const index = draft.lyricLines.findIndex(
				(line) => line.id === op.lineId,
			);
			if (index < 0) throw new PluginOpError(`line ${op.lineId} was not found`);
			draft.lyricLines.splice(index, 1);
			return;
		}
		case "moveLine": {
			const index = draft.lyricLines.findIndex(
				(line) => line.id === op.lineId,
			);
			if (index < 0) throw new PluginOpError(`line ${op.lineId} was not found`);
			const [line] = draft.lyricLines.splice(index, 1);
			try {
				insertAfter(draft.lyricLines, op.afterLineId, line, "line");
			} catch (error) {
				draft.lyricLines.splice(index, 0, line);
				throw error;
			}
			return;
		}
		case "insertWord": {
			const line = draft.lyricLines.find((item) => item.id === op.lineId);
			if (!line) throw new PluginOpError(`line ${op.lineId} was not found`);
			insertAfter(line.words, op.afterWordId, createWord(op.word, ids), "word");
			return;
		}
		case "removeWord": {
			for (const line of draft.lyricLines) {
				const index = line.words.findIndex((word) => word.id === op.wordId);
				if (index >= 0) {
					line.words.splice(index, 1);
					return;
				}
			}
			throw new PluginOpError(`word ${op.wordId} was not found`);
		}
		case "setMetadata":
			draft.metadata = op.entries.map((entry) => ({
				key: entry.key,
				value: [...entry.values],
			}));
			return;
		case "replaceDocument":
			draft.lyricLines = op.lines.map((line) => createLine(line, ids));
			draft.metadata = op.metadata.map((entry) => ({
				key: entry.key,
				value: [...entry.values],
			}));
			return;
	}
};

export interface PluginDocumentPort {
	readSnapshot(): TTMLLyric;
	getRevision(): number;
	transact(
		meta: DocumentTransactionMeta,
		updater: (draft: TTMLLyric) => undefined | TTMLLyric,
	): DocumentChangeEvent | undefined;
}

export interface PluginApplyEditInput {
	pluginId?: string;
	label: string;
	expectedRevision: number;
	ops: DocumentOpV0[];
	/** Seed for ids of inserted lines/words; must match the worker's seed. */
	idSeed: string;
}

/**
 * The single write path for plugin edits: one applyEdit input becomes one
 * document transaction (one revision, one undo record). Internal fields the
 * projection does not carry survive untouched because ops patch by id.
 */
export class PluginDocumentGateway {
	constructor(private readonly port: PluginDocumentPort) {}

	getDocument(options: { includeRuby: boolean }): PluginDocumentV0 {
		return toPluginDocument(
			this.port.readSnapshot(),
			this.port.getRevision(),
			options,
		);
	}

	getRevision(): number {
		return this.port.getRevision();
	}

	applyEdit(input: PluginApplyEditInput): HostResult<ApplyEditResult> {
		const currentRevision = this.port.getRevision();
		if (
			input.expectedRevision !== -1 &&
			input.expectedRevision !== currentRevision
		)
			return {
				ok: false,
				error: {
					code: "revision-conflict",
					message: `expected ${input.expectedRevision}, actual ${currentRevision}`,
				},
			};
		const ids = createSeededIdAllocator(input.idSeed);
		try {
			this.port.transact(
				{
					source: "plugin",
					label: input.label,
					pluginId: input.pluginId,
					expectedRevision:
						input.expectedRevision === -1 ? undefined : input.expectedRevision,
				},
				(draft) => {
					for (const op of input.ops) applyOp(draft, op, ids);
					return undefined;
				},
			);
		} catch (error) {
			if (error instanceof PluginOpError)
				return {
					ok: false,
					error: { code: "not-found", message: error.message },
				};
			throw error;
		}
		return {
			ok: true,
			value: {
				revision: this.port.getRevision(),
				appliedOps: input.ops.length,
			},
		};
	}
}
