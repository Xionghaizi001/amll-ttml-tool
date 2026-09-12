import type {
	DocumentOpV0,
	FormSchemaV0,
	PluginDocumentV0,
	PluginRubySegmentV0,
} from "@amll-ttml-tool/plugin-api";
import type { TrustedJsHostV0 } from "@amll-ttml-tool/plugin-sdk-js";

/**
 * Time-shift plugin. Written against the trusted-js SDK only: the document is
 * the v0 projection, the shift is a `DocumentOpV0` batch committed as one
 * transaction, and the form/notification go through `host.ui`. The same
 * source runs as the bundled factory plugin, as the store artifact and under
 * the mock host in Node.
 */

export const TIME_SHIFT_PLUGIN_ID = "builtin.time-shift";
export const TIME_SHIFT_COMMAND_ID = `${TIME_SHIFT_PLUGIN_ID}.run`;

export const createTimeShiftForm = ({
	selectedCount,
	totalLines,
}: {
	selectedCount: number;
	totalLines: number;
}): FormSchemaV0 => {
	const hasSelection = selectedCount > 0;
	const lastLine = Math.max(1, totalLines);
	return {
		title: { default: "Shift lyric timing", "zh-CN": "平移时间" },
		size: "small",
		fields: [
			{
				kind: "number",
				key: "amount",
				label: { default: "Offset (ms)", "zh-CN": "偏移量 (ms)" },
				default: 100,
				min: 0,
				step: 50,
				required: true,
				control: "stepper",
				decrementIcon: {
					source: "@fluentui/react-icons",
					name: "ArrowLeftRegular",
				},
				incrementIcon: {
					source: "@fluentui/react-icons",
					name: "ArrowRightRegular",
				},
			},
			{
				kind: "radio",
				key: "direction",
				label: { default: "Direction", "zh-CN": "方向" },
				default: "delay",
				orientation: "horizontal",
				options: [
					{
						value: "advance",
						label: { default: "Advance (-)", "zh-CN": "提前 (-)" },
					},
					{
						value: "delay",
						label: { default: "Delay (+)", "zh-CN": "延后 (+)" },
					},
				],
			},
			{
				kind: "radio",
				key: "scope",
				label: { default: "Apply to", "zh-CN": "应用于" },
				default: hasSelection ? "selected" : "all",
				options: [
					{
						value: "all",
						label: { default: "All lines", "zh-CN": "所有行" },
					},
					{
						value: "selected",
						label: {
							default: hasSelection
								? `Selected lines (${selectedCount})`
								: "Selected lines",
							"zh-CN": hasSelection ? `所选行 (${selectedCount})` : "所选行",
						},
						disabled: !hasSelection,
					},
					{
						value: "selected-following",
						label: {
							default: "Selected and following",
							"zh-CN": "所选行及其后续",
						},
						disabled: !hasSelection,
					},
					{
						value: "custom",
						label: { default: "Custom range", "zh-CN": "自定义范围" },
					},
				],
			},
			{
				kind: "group",
				id: "customRange",
				direction: "row",
				align: "center",
				gap: "small",
				indent: true,
				visibleWhen: { field: "scope", equals: "custom" },
				fields: [
					{
						kind: "note",
						text: { default: "From", "zh-CN": "从" },
						tone: "default",
					},
					{
						kind: "number",
						key: "startLine",
						label: { default: "Start line", "zh-CN": "起始行" },
						labelPlacement: "hidden",
						width: "compact",
						controlSize: "small",
						default: 1,
						min: 1,
						max: lastLine,
					},
					{
						kind: "note",
						text: { default: "to", "zh-CN": "行 到" },
						tone: "default",
					},
					{
						kind: "number",
						key: "endLine",
						label: { default: "End line", "zh-CN": "结束行" },
						labelPlacement: "hidden",
						width: "compact",
						controlSize: "small",
						default: lastLine,
						min: 1,
						max: lastLine,
					},
					{
						kind: "note",
						text: { default: "line", "zh-CN": "行" },
						tone: "default",
					},
				],
			},
		],
		submitLabel: { default: "Apply", "zh-CN": "应用" },
		cancelLabel: { default: "Cancel", "zh-CN": "取消" },
	};
};

export const resolveTargetLineIds = (
	document: PluginDocumentV0,
	selectedIds: ReadonlySet<string>,
	scope: string,
	startLine: number,
	endLine: number,
): string[] | undefined => {
	if (scope === "all") return undefined;
	if (scope === "selected")
		return document.lines
			.filter((line) => selectedIds.has(line.id))
			.map((line) => line.id);
	if (scope === "selected-following") {
		const first = document.lines.findIndex((line) => selectedIds.has(line.id));
		return first < 0 ? [] : document.lines.slice(first).map((line) => line.id);
	}
	const start = Math.max(0, Math.trunc(startLine) - 1);
	const end = Math.min(document.lines.length, Math.trunc(endLine));
	return document.lines
		.slice(start, Math.max(start, end))
		.map((line) => line.id);
};

export interface TimeShiftRequest {
	/** Integer millisecond offset; negative advances, positive delays. */
	offsetMs: number;
	/** Target line ids; undefined means every line. */
	lineIds?: readonly string[];
}

const shiftedTime = (time: number, offsetMs: number): number =>
	Math.max(0, time + offsetMs);

const shiftRuby = (
	ruby: PluginRubySegmentV0[],
	offsetMs: number,
): PluginRubySegmentV0[] =>
	ruby.map((segment) => ({
		...segment,
		startTime: shiftedTime(segment.startTime, offsetMs),
		endTime: shiftedTime(segment.endTime, offsetMs),
	}));

/**
 * Pure shift algorithm: line, word and ruby timing of the targeted lines as
 * one op batch (clamped at zero). The batch is committed by the host as a
 * single transaction, so undo reverts the whole shift at once.
 */
export const buildTimeShiftOps = (
	document: PluginDocumentV0,
	request: TimeShiftRequest,
): { ops: DocumentOpV0[]; lineIds: string[] } => {
	if (!Number.isFinite(request.offsetMs) || !Number.isInteger(request.offsetMs))
		throw new RangeError("offsetMs must be a finite integer");
	const ops: DocumentOpV0[] = [];
	const lineIds: string[] = [];
	if (request.offsetMs === 0) return { ops, lineIds };
	const targets =
		request.lineIds === undefined ? undefined : new Set(request.lineIds);
	for (const line of document.lines) {
		if (targets !== undefined && !targets.has(line.id)) continue;
		lineIds.push(line.id);
		ops.push({
			op: "updateLine",
			lineId: line.id,
			patch: {
				startTime: shiftedTime(line.startTime, request.offsetMs),
				endTime: shiftedTime(line.endTime, request.offsetMs),
			},
		});
		for (const word of line.words)
			ops.push({
				op: "updateWord",
				wordId: word.id,
				patch: {
					startTime: shiftedTime(word.startTime, request.offsetMs),
					endTime: shiftedTime(word.endTime, request.offsetMs),
					...(word.ruby === undefined
						? {}
						: { ruby: shiftRuby(word.ruby, request.offsetMs) }),
				},
			});
	}
	return { ops, lineIds };
};

/** Registers the command and menu entry; disposal is owned by the host scope. */
export const activateTimeShift = (host: TrustedJsHostV0): void => {
	host.commands.register({
		id: TIME_SHIFT_COMMAND_ID,
		title: { default: "Shift timing...", "zh-CN": "平移时间..." },
		category: { default: "Edit", "zh-CN": "编辑" },
		handler: async () => {
			const opening = host.document.readSnapshot();
			const result = await host.ui.showForm(
				createTimeShiftForm({
					selectedCount: host.selection.get().lineIds.length,
					totalLines: opening.lines.length,
				}),
			);
			if (!result.submitted) return;
			const amount = Number(result.values.amount);
			if (!Number.isFinite(amount) || amount === 0) return;
			const direction = String(result.values.direction);
			const snapshot = host.document.readSnapshot();
			const { ops, lineIds } = buildTimeShiftOps(snapshot, {
				offsetMs: Math.trunc(direction === "advance" ? -amount : amount),
				lineIds: resolveTargetLineIds(
					snapshot,
					new Set(host.selection.get().lineIds),
					String(result.values.scope),
					Number(result.values.startLine),
					Number(result.values.endLine),
				),
			});
			if (ops.length === 0) return;
			const applied = host.document.applyEdit(ops, "Shift lyric timing", {
				expectedRevision: snapshot.revision,
			});
			if (!applied.ok) {
				host.ui.notify({
					level: "error",
					message: "Lyric timing was not shifted",
					detail: applied.error.message,
				});
				return;
			}
			host.ui.notify({
				level: "success",
				message: "Lyric timing shifted",
				detail: `${lineIds.length} line(s) updated`,
			});
		},
	});
	host.menus.register({
		id: `${TIME_SHIFT_PLUGIN_ID}.menu.edit`,
		command: TIME_SHIFT_COMMAND_ID,
		menu: "menu.edit",
		group: "timing",
		order: 100,
	});
};
