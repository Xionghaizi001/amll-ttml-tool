import type {
	DocumentChangeEvent,
	DocumentChangeSource,
	EditorDocumentService,
} from "$/kernel/editor";

export interface TimeShiftRequest {
	offsetMs: number;
	lineIds?: readonly string[];
	expectedRevision: number;
	source?: DocumentChangeSource;
	label?: string;
	pluginId?: string;
}

export type TimeShiftDocumentPort = Pick<
	EditorDocumentService,
	"getRevision" | "transact"
>;

const shiftedTime = (time: number, offsetMs: number): number =>
	Math.max(0, time + offsetMs);

/** Execute one host-agnostic time shift as one editor transaction. */
export function shiftLyricTimes(
	document: TimeShiftDocumentPort,
	request: TimeShiftRequest,
): DocumentChangeEvent | undefined {
	if (!Number.isFinite(request.offsetMs) || !Number.isInteger(request.offsetMs))
		throw new RangeError("offsetMs must be a finite integer");
	if (request.offsetMs === 0) return;

	const targetIds =
		request.lineIds === undefined ? undefined : new Set(request.lineIds);
	return document.transact(
		{
			source: request.source ?? "user",
			label: request.label ?? "Time shift lyrics",
			pluginId: request.pluginId,
			expectedRevision: request.expectedRevision,
		},
		(draft) => {
			for (const line of draft.lyricLines) {
				if (targetIds !== undefined && !targetIds.has(line.id)) continue;
				line.startTime = shiftedTime(line.startTime, request.offsetMs);
				line.endTime = shiftedTime(line.endTime, request.offsetMs);
				for (const word of line.words) {
					word.startTime = shiftedTime(word.startTime, request.offsetMs);
					word.endTime = shiftedTime(word.endTime, request.offsetMs);
					for (const ruby of word.ruby ?? []) {
						ruby.startTime = shiftedTime(ruby.startTime, request.offsetMs);
						ruby.endTime = shiftedTime(ruby.endTime, request.offsetMs);
					}
				}
			}
		},
	);
}
