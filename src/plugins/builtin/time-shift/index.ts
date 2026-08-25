import type {
	FormResultV0,
	FormSchemaV0,
	NotifyParams,
} from "@amll-ttml-tool/plugin-api";
import {
	shiftLyricTimes,
	type TimeShiftDocumentPort,
} from "$/application/time-shift";
import type { ExtensionScope } from "$/kernel/extensions";
import type { TTMLLyric } from "$/types/ttml";

export const TIME_SHIFT_PLUGIN_ID = "builtin.time-shift";
export const TIME_SHIFT_COMMAND_ID = `${TIME_SHIFT_PLUGIN_ID}.run`;

export interface TimeShiftBuiltinDocumentPort extends TimeShiftDocumentPort {
	readSnapshot(): TTMLLyric;
}

export interface TimeShiftBuiltinPorts {
	document: TimeShiftBuiltinDocumentPort;
	getSelectedLineIds(): ReadonlySet<string>;
	showForm(schema: FormSchemaV0): Promise<FormResultV0>;
	notify(params: NotifyParams): void;
}

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

const resolveTargetLineIds = (
	document: TTMLLyric,
	selectedIds: ReadonlySet<string>,
	scope: string,
	startLine: number,
	endLine: number,
): string[] | undefined => {
	if (scope === "all") return undefined;
	if (scope === "selected")
		return document.lyricLines
			.filter((line) => selectedIds.has(line.id))
			.map((line) => line.id);
	if (scope === "selected-following") {
		const first = document.lyricLines.findIndex((line) =>
			selectedIds.has(line.id),
		);
		return first < 0
			? []
			: document.lyricLines.slice(first).map((line) => line.id);
	}
	const start = Math.max(0, Math.trunc(startLine) - 1);
	const end = Math.min(document.lyricLines.length, Math.trunc(endLine));
	return document.lyricLines
		.slice(start, Math.max(start, end))
		.map((line) => line.id);
};

export const activateTimeShiftBuiltin = (
	scope: ExtensionScope,
	ports: TimeShiftBuiltinPorts,
): void => {
	scope.registerCommand({
		id: TIME_SHIFT_COMMAND_ID,
		title: { default: "Shift timing...", "zh-CN": "平移时间..." },
		category: { default: "Edit", "zh-CN": "编辑" },
		handler: async () => {
			const openingSnapshot = ports.document.readSnapshot();
			const result = await ports.showForm(
				createTimeShiftForm({
					selectedCount: ports.getSelectedLineIds().size,
					totalLines: openingSnapshot.lyricLines.length,
				}),
			);
			if (!result.submitted) return;
			const amount = Number(result.values.amount);
			if (!Number.isFinite(amount) || amount === 0) return;
			const direction = String(result.values.direction);
			const snapshot = ports.document.readSnapshot();
			const lineIds = resolveTargetLineIds(
				snapshot,
				ports.getSelectedLineIds(),
				String(result.values.scope),
				Number(result.values.startLine),
				Number(result.values.endLine),
			);
			const event = shiftLyricTimes(ports.document, {
				offsetMs: Math.trunc(direction === "advance" ? -amount : amount),
				lineIds,
				expectedRevision: ports.document.getRevision(),
				source: "plugin",
				pluginId: TIME_SHIFT_PLUGIN_ID,
				label: "Shift lyric timing",
			});
			if (event)
				ports.notify({
					level: "success",
					message: "Lyric timing shifted",
					detail: `${event.changedLineIds.length} line(s) updated`,
				});
		},
	});
	scope.registerMenu({
		id: `${TIME_SHIFT_PLUGIN_ID}.menu.edit`,
		command: TIME_SHIFT_COMMAND_ID,
		menu: "menu.edit",
		group: "timing",
		order: 100,
	});
};
