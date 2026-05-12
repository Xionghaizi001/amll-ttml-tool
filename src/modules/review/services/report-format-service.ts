import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type {
	ReviewReport,
	ReviewReportBlock,
	TimingStashItem,
} from "$/modules/review/services/report-service";

export const DEFAULT_REVIEW_REPORT_EMPTY_TEXT = "未检测到差异。";

export type ReviewReportBlockKind = ReviewReportBlock["kind"];

export type ReviewReportBlockFormat = {
	template: string;
	listItem: boolean;
};

export type ReviewReportFormat = {
	version: 1;
	emptyText: string;
	blocks: Record<ReviewReportBlockKind, ReviewReportBlockFormat>;
};

export type ReviewReportFormatVariable = {
	name: string;
	label: string;
	description: string;
};

export type ReviewReportFormatBlockDefinition = {
	kind: ReviewReportBlockKind;
	label: string;
	description: string;
	variables: ReviewReportFormatVariable[];
};

const commonLineVariables: ReviewReportFormatVariable[] = [
	{
		name: "lineLabel",
		label: "行标签",
		description: "例如：第 3 行、第 3 行（背景）",
	},
	{
		name: "lineNumber",
		label: "行号",
		description: "当前条目对应的显示行号",
	},
	{
		name: "isBackground",
		label: "背景行",
		description: "背景歌词为 true，否则为 false",
	},
	{
		name: "backgroundLabel",
		label: "背景标记",
		description: "背景歌词时输出（背景），否则为空",
	},
];

const wordChangeVariables: ReviewReportFormatVariable[] = [
	{ name: "oldWord", label: "原词", description: "修改前的逐字歌词" },
	{ name: "newWord", label: "新词", description: "修改后的逐字歌词" },
];

const romanChangeVariables: ReviewReportFormatVariable[] = [
	{ name: "oldRoman", label: "原音译", description: "修改前的逐字音译" },
	{ name: "newRoman", label: "新音译", description: "修改后的逐字音译" },
];

const lineTextVariables: ReviewReportFormatVariable[] = [
	{ name: "oldText", label: "原文本", description: "修改前的整行文本" },
	{ name: "newText", label: "新文本", description: "修改后的整行文本" },
];

export const reviewReportFormatBlockDefinitions: ReviewReportFormatBlockDefinition[] =
	[
		{
			kind: "wordTextShared",
			label: "跨行原文修正",
			description: "同一原文修正出现在多行时使用",
			variables: [
				{
					name: "lineLabels",
					label: "行标签列表",
					description: "去重排序后的行标签，例如：第 1 行、第 3 行",
				},
				...wordChangeVariables,
			],
		},
		{
			kind: "wordTextGroup",
			label: "同行多处原文修正",
			description: "同一行存在多个逐字原文修正时使用",
			variables: [
				...commonLineVariables,
				{
					name: "oldWords",
					label: "原词列表",
					description: "修改前词语，以顿号连接",
				},
				{
					name: "newWords",
					label: "新词列表",
					description: "修改后词语，以顿号连接",
				},
				{
					name: "oldWordsCode",
					label: "原词代码列表",
					description: "每个原词带 Markdown 行内代码标记",
				},
				{
					name: "newWordsCode",
					label: "新词代码列表",
					description: "每个新词带 Markdown 行内代码标记",
				},
			],
		},
		{
			kind: "wordText",
			label: "单个原文修正",
			description: "单个逐字原文修正时使用",
			variables: [...commonLineVariables, ...wordChangeVariables],
		},
		{
			kind: "wordRoman",
			label: "逐字音译修正",
			description: "仅逐字音译变化时使用",
			variables: [
				...commonLineVariables,
				{ name: "word", label: "歌词词", description: "当前逐字歌词" },
				...romanChangeVariables,
			],
		},
		{
			kind: "lineTranslation",
			label: "翻译修正",
			description: "整行翻译变化时使用",
			variables: [...commonLineVariables, ...lineTextVariables],
		},
		{
			kind: "lineRoman",
			label: "整行音译修正",
			description: "整行音译变化时使用",
			variables: [...commonLineVariables, ...lineTextVariables],
		},
		{
			kind: "wordAndRoman",
			label: "原文与音译修正",
			description: "同一个词的原文和逐字音译都变化时使用",
			variables: [
				...commonLineVariables,
				...wordChangeVariables,
				...romanChangeVariables,
			],
		},
		{
			kind: "wordAdded",
			label: "新增词",
			description: "逐字歌词中新增词语时使用",
			variables: [
				...commonLineVariables,
				{ name: "word", label: "新增词", description: "新增的逐字歌词" },
			],
		},
		{
			kind: "wordRemoved",
			label: "删除词",
			description: "逐字歌词中删除词语时使用",
			variables: [
				...commonLineVariables,
				{ name: "word", label: "删除词", description: "删除的逐字歌词" },
			],
		},
		{
			kind: "lineAdded",
			label: "新增歌词行",
			description: "新增整行歌词时使用",
			variables: [
				...commonLineVariables,
				{ name: "text", label: "新增文本", description: "新增的整行歌词" },
			],
		},
		{
			kind: "lineRemoved",
			label: "删除歌词行",
			description: "删除整行歌词时使用",
			variables: [
				...commonLineVariables,
				{ name: "text", label: "删除文本", description: "删除的整行歌词" },
			],
		},
		{
			kind: "timing",
			label: "时轴修正",
			description: "时轴起止时间变化时使用",
			variables: [
				...commonLineVariables,
				{ name: "word", label: "歌词词", description: "当前逐字歌词" },
				{
					name: "timingChanges",
					label: "时轴变化描述",
					description: "自动组合后的起始/结束时间变化描述",
				},
				{
					name: "startTimingChange",
					label: "起始变化描述",
					description: "仅起始时间变化描述，无变化时为空",
				},
				{
					name: "endTimingChange",
					label: "结束变化描述",
					description: "仅结束时间变化描述，无变化时为空",
				},
				{ name: "oldStart", label: "原起始", description: "原起始时间毫秒值" },
				{ name: "newStart", label: "新起始", description: "新起始时间毫秒值" },
				{ name: "oldEnd", label: "原结束", description: "原结束时间毫秒值" },
				{ name: "newEnd", label: "新结束", description: "新结束时间毫秒值" },
				{
					name: "startDelta",
					label: "起始差值",
					description: "新起始时间减原起始时间",
				},
				{
					name: "endDelta",
					label: "结束差值",
					description: "新结束时间减原结束时间",
				},
			],
		},
		{
			kind: "manual",
			label: "手写条目",
			description: "用户手动新增的报告条目",
			variables: [
				{ name: "content", label: "手写内容", description: "手写条目原文" },
			],
		},
	];

export const DEFAULT_REVIEW_REPORT_FORMAT: ReviewReportFormat = {
	version: 1,
	emptyText: DEFAULT_REVIEW_REPORT_EMPTY_TEXT,
	blocks: {
		manual: {
			template: "{{content}}",
			listItem: false,
		},
		wordTextShared: {
			template: "{{lineLabels}}：`{{oldWord}}` 存在错误，应为 `{{newWord}}`",
			listItem: true,
		},
		wordTextGroup: {
			template:
				"{{lineLabel}}：{{oldWordsCode}} 分别存在错误，应为 {{newWordsCode}}",
			listItem: true,
		},
		wordText: {
			template: "{{lineLabel}}：`{{oldWord}}` 存在错误，应为 `{{newWord}}`",
			listItem: true,
		},
		wordRoman: {
			template:
				"{{lineLabel}}：`{{word}}` 音译 `{{oldRoman}}` 存在错误，应为 `{{newRoman}}`",
			listItem: true,
		},
		lineTranslation: {
			template:
				"{{lineLabel}}：翻译 `{{oldText}}` 存在错误，应为 `{{newText}}`",
			listItem: true,
		},
		lineRoman: {
			template:
				"{{lineLabel}}：音译 `{{oldText}}` 存在错误，应为 `{{newText}}`",
			listItem: true,
		},
		wordAndRoman: {
			template:
				"{{lineLabel}}：`{{oldWord}}` 存在错误，应为 `{{newWord}}`，音译 `{{oldRoman}}` 存在错误，应为 `{{newRoman}}`",
			listItem: true,
		},
		wordAdded: {
			template: "{{lineLabel}}：新增 `{{word}}`",
			listItem: true,
		},
		wordRemoved: {
			template: "{{lineLabel}}：删除 `{{word}}`",
			listItem: true,
		},
		lineAdded: {
			template: "{{lineLabel}}：新增歌词 `{{text}}`",
			listItem: true,
		},
		lineRemoved: {
			template: "{{lineLabel}}：删除歌词 `{{text}}`",
			listItem: true,
		},
		timing: {
			template: "{{lineLabel}}：`{{word}}` {{timingChanges}}",
			listItem: true,
		},
	},
};

const cloneDefaultFormat = (): ReviewReportFormat => ({
	version: 1,
	emptyText: DEFAULT_REVIEW_REPORT_FORMAT.emptyText,
	blocks: Object.fromEntries(
		Object.entries(DEFAULT_REVIEW_REPORT_FORMAT.blocks).map(
			([kind, blockFormat]) => [kind, { ...blockFormat }],
		),
	) as Record<ReviewReportBlockKind, ReviewReportBlockFormat>,
});

export const normalizeReviewReportFormat = (
	format: Partial<ReviewReportFormat> | null | undefined,
): ReviewReportFormat => {
	const defaults = cloneDefaultFormat();
	if (!format || typeof format !== "object") return defaults;
	const blocks = { ...defaults.blocks };
	for (const definition of reviewReportFormatBlockDefinitions) {
		const value = format.blocks?.[definition.kind];
		if (!value || typeof value !== "object") continue;
		blocks[definition.kind] = {
			template:
				typeof value.template === "string"
					? value.template
					: defaults.blocks[definition.kind].template,
			listItem:
				typeof value.listItem === "boolean"
					? value.listItem
					: defaults.blocks[definition.kind].listItem,
		};
	}
	return {
		version: 1,
		emptyText:
			typeof format.emptyText === "string"
				? format.emptyText
				: defaults.emptyText,
		blocks,
	};
};

type ReviewReportFormatRecord =
	| {
			kind: ReviewReportBlockKind;
			template?: string;
			listItem?: boolean;
	  }
	| {
			emptyText?: string;
	  };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isBlockKind = (value: unknown): value is ReviewReportBlockKind =>
	typeof value === "string" &&
	reviewReportFormatBlockDefinitions.some((item) => item.kind === value);

const normalizeFormatRecords = (
	records: ReviewReportFormatRecord[],
): ReviewReportFormat => {
	const next = cloneDefaultFormat();
	for (const record of records) {
		if ("emptyText" in record && typeof record.emptyText === "string") {
			next.emptyText = record.emptyText;
			continue;
		}
		if (!("kind" in record) || !isBlockKind(record.kind)) continue;
		next.blocks[record.kind] = {
			template:
				typeof record.template === "string"
					? record.template
					: next.blocks[record.kind].template,
			listItem:
				typeof record.listItem === "boolean"
					? record.listItem
					: next.blocks[record.kind].listItem,
		};
	}
	return normalizeReviewReportFormat(next);
};

export const serializeReviewReportFormat = (format: ReviewReportFormat) =>
	JSON.stringify(normalizeReviewReportFormat(format), null, "\t");

export const serializeReviewReportFormatJsonl = (
	format: ReviewReportFormat,
) => {
	const normalized = normalizeReviewReportFormat(format);
	const records: ReviewReportFormatRecord[] = [
		{ emptyText: normalized.emptyText },
		...reviewReportFormatBlockDefinitions.map((definition) => ({
			kind: definition.kind,
			...normalized.blocks[definition.kind],
		})),
	];
	return records.map((record) => JSON.stringify(record)).join("\n");
};

export const parseReviewReportFormatText = (text: string) => {
	const trimmed = text.trim();
	if (!trimmed) throw new Error("模板文件为空");
	try {
		const value = JSON.parse(trimmed);
		if (Array.isArray(value)) {
			return normalizeFormatRecords(
				value.filter(isRecord) as ReviewReportFormatRecord[],
			);
		}
		if (isRecord(value)) {
			if ("kind" in value || "emptyText" in value) {
				return normalizeFormatRecords([value as ReviewReportFormatRecord]);
			}
			return normalizeReviewReportFormat(value as Partial<ReviewReportFormat>);
		}
	} catch (error) {
		if (trimmed.includes("\n")) {
			const records = trimmed
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter(Boolean)
				.map((line) => JSON.parse(line))
				.filter(isRecord) as ReviewReportFormatRecord[];
			return normalizeFormatRecords(records);
		}
		throw error;
	}
	throw new Error("模板文件格式不正确");
};

const reviewReportFormatStorageAtom = atomWithStorage<ReviewReportFormat>(
	"reviewReportFormat",
	DEFAULT_REVIEW_REPORT_FORMAT,
);

export const reviewReportFormatAtom = atom(
	(get) => normalizeReviewReportFormat(get(reviewReportFormatStorageAtom)),
	(
		get,
		set,
		update:
			| ReviewReportFormat
			| ((current: ReviewReportFormat) => ReviewReportFormat),
	) => {
		const current = normalizeReviewReportFormat(
			get(reviewReportFormatStorageAtom),
		);
		const next = typeof update === "function" ? update(current) : update;
		set(reviewReportFormatStorageAtom, normalizeReviewReportFormat(next));
	},
);

const wrap = (value: string | number) => `\`${value}\``;

const formatLineLabel = (lineNumber: number, isBG?: boolean) =>
	`第 ${lineNumber} 行${isBG ? "（背景）" : ""}`;

const formatLineLabelList = (
	items: Array<{ lineNumber: number; isBG?: boolean }>,
) => {
	const seen = new Set<string>();
	const list = items
		.filter((item) => {
			const key = `${item.lineNumber}:${item.isBG ? "bg" : "main"}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort(
			(a, b) => a.lineNumber - b.lineNumber || Number(a.isBG) - Number(b.isBG),
		);
	return list
		.map((item) => formatLineLabel(item.lineNumber, item.isBG))
		.join("、");
};

const createLineVariables = (lineNumber: number, isBG: boolean) => ({
	lineLabel: formatLineLabel(lineNumber, isBG),
	lineNumber: String(lineNumber),
	isBackground: String(isBG),
	backgroundLabel: isBG ? "（背景）" : "",
});

const buildTimingPart = (
	prefix: "起始" | "结束",
	oldTime: number,
	newTime: number,
) => {
	const delta = newTime - oldTime;
	if (delta === 0) return "";
	const speed = delta < 0 ? "延后" : "提前";
	return `${prefix}${speed}了 ${wrap(Math.abs(delta))} 毫秒`;
};

const buildTimingParts = (
	block: Extract<ReviewReportBlock, { kind: "timing" }>,
) => {
	const fields = new Set<TimingStashItem["field"]>(block.fields);
	const startTimingChange = fields.has("startTime")
		? buildTimingPart("起始", block.oldStart, block.newStart)
		: "";
	const endTimingChange = fields.has("endTime")
		? buildTimingPart("结束", block.oldEnd, block.newEnd)
		: "";
	return {
		startTimingChange,
		endTimingChange,
		timingChanges: [startTimingChange, endTimingChange]
			.filter(Boolean)
			.join("，"),
	};
};

export const createReviewReportBlockVariables = (
	block: ReviewReportBlock,
): Record<string, string> | null => {
	switch (block.kind) {
		case "manual":
			return { content: block.content };
		case "wordTextShared":
			return {
				lineLabels: formatLineLabelList(block.lineRefs),
				oldWord: block.oldWord,
				newWord: block.newWord,
			};
		case "wordTextGroup": {
			const enabledChanges = block.changes.filter(
				(item) => item.enabled !== false,
			);
			if (enabledChanges.length === 0) return null;
			const oldWords = enabledChanges.map((item) => item.oldWord);
			const newWords = enabledChanges.map((item) => item.newWord);
			return {
				...createLineVariables(block.lineNumber, block.isBG),
				oldWords: oldWords.join("、"),
				newWords: newWords.join("、"),
				oldWordsCode: oldWords.map(wrap).join("、"),
				newWordsCode: newWords.map(wrap).join("、"),
			};
		}
		case "wordText":
			return {
				...createLineVariables(block.lineNumber, block.isBG),
				oldWord: block.oldWord,
				newWord: block.newWord,
			};
		case "wordRoman":
			return {
				...createLineVariables(block.lineNumber, block.isBG),
				word: block.word,
				oldRoman: block.oldRoman,
				newRoman: block.newRoman,
			};
		case "lineTranslation":
		case "lineRoman":
			return {
				...createLineVariables(block.lineNumber, block.isBG),
				oldText: block.oldText,
				newText: block.newText,
			};
		case "wordAndRoman":
			return {
				...createLineVariables(block.lineNumber, block.isBG),
				oldWord: block.oldWord,
				newWord: block.newWord,
				oldRoman: block.oldRoman,
				newRoman: block.newRoman,
			};
		case "wordAdded":
		case "wordRemoved":
			return {
				...createLineVariables(block.lineNumber, block.isBG),
				word: block.word,
			};
		case "lineAdded":
		case "lineRemoved":
			return {
				...createLineVariables(block.lineNumber, block.isBG),
				text: block.text,
			};
		case "timing": {
			const timingParts = buildTimingParts(block);
			if (!timingParts.timingChanges) return null;
			return {
				...createLineVariables(block.lineNumber, block.isBG),
				word: block.word,
				...timingParts,
				oldStart: String(block.oldStart),
				newStart: String(block.newStart),
				oldEnd: String(block.oldEnd),
				newEnd: String(block.newEnd),
				startDelta: String(block.newStart - block.oldStart),
				endDelta: String(block.newEnd - block.oldEnd),
			};
		}
	}
};

export const renderReviewReportTemplate = (
	template: string,
	variables: Record<string, string>,
) =>
	template.replace(
		/\{\{\s*([\w.]+)\s*\}\}/g,
		(_match, name: string) => variables[name] ?? "",
	);

export const renderReviewReportBlock = (
	block: ReviewReportBlock,
	formatInput?: Partial<ReviewReportFormat> | null,
) => {
	const format = normalizeReviewReportFormat(formatInput);
	const variables = createReviewReportBlockVariables(block);
	if (!variables) return "";
	const text = renderReviewReportTemplate(
		format.blocks[block.kind].template,
		variables,
	).trim();
	return text;
};

export const renderFormattedReviewReport = (
	report: ReviewReport,
	formatInput?: Partial<ReviewReportFormat> | null,
) => {
	const format = normalizeReviewReportFormat(formatInput);
	const parts = report.blocks
		.filter((block) => block.enabled)
		.map((block) => {
			const text = renderReviewReportBlock(block, format);
			if (!text) return "";
			return format.blocks[block.kind].listItem ? `- ${text}` : text;
		})
		.filter(Boolean);
	if (parts.length === 0)
		return format.emptyText || DEFAULT_REVIEW_REPORT_EMPTY_TEXT;
	return parts.join("\n");
};

export const updateReviewReportBlockFormat = (
	format: ReviewReportFormat,
	kind: ReviewReportBlockKind,
	patch: Partial<ReviewReportBlockFormat>,
) =>
	normalizeReviewReportFormat({
		...format,
		blocks: {
			...format.blocks,
			[kind]: {
				...format.blocks[kind],
				...patch,
			},
		},
	});

export const resetReviewReportBlockFormat = (
	format: ReviewReportFormat,
	kind: ReviewReportBlockKind,
) =>
	updateReviewReportBlockFormat(
		format,
		kind,
		DEFAULT_REVIEW_REPORT_FORMAT.blocks[kind],
	);
