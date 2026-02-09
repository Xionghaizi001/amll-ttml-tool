type SubmitLyricIssueInput = {
	title: string;
	ttmlDownloadUrl: string;
	uploadReason: "新歌词提交" | "修正已有歌词";
	titleVariant?: "提交" | "补正";
	comment?: string;
	labels?: string[];
	assignees?: string[];
	includeLabels?: boolean;
};

type SubmitLyricIssuePayload = {
	name: string;
	description: string;
	title: string;
	labels?: string[];
	assignees: string[];
	body: Array<
		| {
				type: "markdown";
				attributes: { value: string };
		  }
		| {
				type: "input";
				id: "ttml-download-url";
				value: string;
		  }
		| {
				type: "dropdown";
				id: "upload-reason";
				value: "新歌词提交" | "修正已有歌词";
		  }
		| {
				type: "textarea";
				id: "comment";
				value: string;
		  }
	>;
};

const SUBMIT_LYRIC_TEMPLATE = {
	name: "提交/补正歌词",
	description: "我想提交/补正一个歌曲的 TTML 歌词文件！",
	titlePrefixes: {
		submit: "[歌词提交] ",
		correct: "[歌词补正] ",
	},
	labels: ["歌词提交/补正"],
	assignees: ["Steve-xmh"],
	body: {
		markdown:
			"标题中的 `歌词提交/补正` 请尽量根据实际提交内容改为 `歌词提交` 或 `歌词补正`，并填写上类似 `艺术家 - 歌曲名` 的歌曲信息，以便审核。\n在上传歌词之前请详细阅读[歌词规范文档](https://github.com/amll-dev/amll-ttml-db/blob/main/instructions/instruction.md)，并确认上传内容遵守了歌词规范。否则可能会被审核打回修改哦！",
	},
};

const resolveTitlePrefix = (input: SubmitLyricIssueInput) => {
	const variant =
		input.titleVariant ??
		(input.uploadReason === "新歌词提交" ? "提交" : "补正");
	return variant === "补正"
		? SUBMIT_LYRIC_TEMPLATE.titlePrefixes.correct
		: SUBMIT_LYRIC_TEMPLATE.titlePrefixes.submit;
};

const buildTitle = (rawTitle: string, prefix: string) => {
	const trimmed = rawTitle.trim();
	if (!trimmed) {
		return prefix.trim();
	}
	if (trimmed.startsWith(prefix)) {
		return trimmed;
	}
	return `${prefix}${trimmed}`;
};

export const buildSubmitLyricIssueBoyJson = (
	input: SubmitLyricIssueInput,
) => {
	const payload: SubmitLyricIssuePayload = {
		name: SUBMIT_LYRIC_TEMPLATE.name,
		description: SUBMIT_LYRIC_TEMPLATE.description,
		title: buildTitle(input.title, resolveTitlePrefix(input)),
		assignees: input.assignees ?? SUBMIT_LYRIC_TEMPLATE.assignees,
		body: [
			{
				type: "markdown",
				attributes: { value: SUBMIT_LYRIC_TEMPLATE.body.markdown },
			},
			{
				type: "input",
				id: "ttml-download-url",
				value: input.ttmlDownloadUrl,
			},
			{
				type: "dropdown",
				id: "upload-reason",
				value: input.uploadReason,
			},
			{
				type: "textarea",
				id: "comment",
				value: input.comment?.trim() ?? "",
			},
		],
	};

	if (input.includeLabels ?? true) {
		payload.labels = input.labels ?? SUBMIT_LYRIC_TEMPLATE.labels;
	}

	return JSON.stringify(payload);
};
