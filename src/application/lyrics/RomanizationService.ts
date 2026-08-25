import type {
	DocumentChangeEvent,
	EditorDocumentService,
} from "../../kernel/editor";
import type { LyricLine, LyricWord, TTMLLyric } from "../../types/ttml";

export interface RomanizationEnginePort {
	predict(words: LyricWord[], romanLyric: string): string[];
	applyWarnings(words: LyricWord[]): void;
}

export type RomanizationDocumentPort = Pick<
	EditorDocumentService,
	"getRevision" | "transact"
>;

export interface RomanizationFailure {
	lineId: string;
	lineIndex: number;
	error: unknown;
}

export interface RomanizationDebugWord {
	word: string;
	emptyBeat: number;
	predicted: string;
}

export interface RomanizationDebugLine {
	line: number;
	originalText: string;
	romanSource: string;
	syllables: RomanizationDebugWord[];
}

const shouldProcess = (line: LyricLine) =>
	line.words.length > 0 && Boolean(line.romanLyric?.trim());

export function distributeLineRomanization(
	line: LyricLine,
	engine: RomanizationEnginePort,
): void {
	if (!shouldProcess(line)) return;
	const predictions = engine.predict(line.words, line.romanLyric ?? "");
	line.words.forEach((word, index) => {
		if (predictions[index]) word.romanWord = predictions[index];
	});
	engine.applyWarnings(line.words);
}

export function distributeDocumentRomanization(
	document: RomanizationDocumentPort,
	engine: RomanizationEnginePort,
	lineIds?: ReadonlySet<string>,
): {
	event: DocumentChangeEvent | undefined;
	failures: RomanizationFailure[];
} {
	const failures: RomanizationFailure[] = [];
	const event = document.transact(
		{
			source: "user",
			label: "Distribute line romanization",
			expectedRevision: document.getRevision(),
		},
		(draft) => {
			draft.lyricLines.forEach((line, lineIndex) => {
				if (lineIds && !lineIds.has(line.id)) return;
				try {
					distributeLineRomanization(line, engine);
				} catch (error) {
					failures.push({ lineId: line.id, lineIndex, error });
				}
			});
		},
	);
	return { event, failures };
}

export function refreshRomanizationWarnings(
	document: RomanizationDocumentPort,
	engine: RomanizationEnginePort,
): DocumentChangeEvent | undefined {
	return document.transact(
		{
			source: "user",
			label: "Refresh romanization warnings",
			expectedRevision: document.getRevision(),
		},
		(draft) => {
			for (const line of draft.lyricLines) engine.applyWarnings(line.words);
		},
	);
}

export function createRomanizationDebugReport(
	document: Pick<TTMLLyric, "lyricLines">,
	engine: RomanizationEnginePort,
	startLine = 0,
	endLine = 100,
): RomanizationDebugLine[] {
	const start = Math.max(0, Math.floor(startLine));
	const end = Math.max(start, Math.floor(endLine));
	return document.lyricLines.slice(start, end + 1).map((line, index) => {
		const romanSource = line.romanLyric ?? "";
		const predictions = engine.predict(line.words, romanSource);
		return {
			line: start + index,
			originalText: line.words.map((word) => word.word).join(""),
			romanSource,
			syllables: line.words.map((word, wordIndex) => ({
				word: word.word,
				emptyBeat: word.emptyBeat,
				predicted: predictions[wordIndex] ?? "",
			})),
		};
	});
}
