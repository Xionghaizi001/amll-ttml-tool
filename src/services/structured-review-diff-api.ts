import type { StructuredReviewReport } from "$/types/structured-review-report";

/**
 * AMLL DB 结构化审阅报告（diff）云端接口。
 *
 * 同一个 /diff 端点的读（GET，公开）与写（POST，需审核员 token）此前分散在
 * review 与 user 两个模块里，各自维护一份 URL 拼装与错误映射。统一收在这里，
 * 让「云端协议」只有一个来源。
 */

export const AMLLDB_DIFF_BASE_URL = "https://amlldb.bikonoo.com/diff/";

export type StructuredReviewDiffPlatform = "gcz" | "github";

export type StructuredReviewDiffTarget = {
	platform: StructuredReviewDiffPlatform | string;
	id: string | number;
};

export type StructuredReviewDiffUploadResult = {
	success: boolean;
	message: string;
	filename: string;
	createdAt: string;
};

export const buildStructuredReviewDiffUrl = (
	options: StructuredReviewDiffTarget,
): string => {
	const platform = String(options.platform).trim();
	const id = String(options.id).trim();
	if (!platform) throw new Error("缺少 platform");
	if (!id) throw new Error("缺少稿件 id");
	const url = new URL(AMLLDB_DIFF_BASE_URL);
	url.searchParams.set("platform", platform);
	url.searchParams.set("id", id);
	return url.toString();
};

const readDiffErrorDetail = async (response: Response): Promise<string> => {
	const raw = (await response.text().catch(() => "")).trim();
	if (!raw) return "";
	try {
		const json = JSON.parse(raw) as {
			message?: unknown;
			error?: unknown;
		};
		if (typeof json.message === "string" && json.message.trim()) {
			return json.message.trim();
		}
		if (typeof json.error === "string" && json.error.trim()) {
			return json.error.trim();
		}
	} catch {
		// plain text
	}
	return raw;
};

export const mapStructuredReviewDiffHttpError = (
	status: number,
	detail: string,
	action: "读取" | "上传",
) => {
	const mapped =
		status === 400
			? "参数无效（请检查 platform / id）"
			: status === 401
				? "未登录或 Token 无效/过期"
				: status === 403
					? "无审核员权限"
					: status === 404
						? "未找到对应结构化报告"
						: status === 500
							? "服务器内部错误"
							: `HTTP ${status}`;
	return detail
		? `${action}结构化报告失败：${mapped}（${detail}）`
		: `${action}结构化报告失败：${mapped}`;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

/**
 * 剥掉云端的 `{ platform, id, metadata, diff, updates }` 信封，取出报告本体。
 * 已经是裸报告时原样返回，可重复调用。
 */
export const unwrapStructuredReviewReport = (
	input: string | unknown,
): unknown => {
	let value: unknown = input;
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			throw new Error("结构化报告不是有效 JSON");
		}
	}
	if (isObject(value) && "diff" in value) {
		const wrapper = value;
		let diffValue = wrapper.diff;
		if (typeof diffValue === "string") {
			try {
				diffValue = JSON.parse(diffValue);
			} catch {
				throw new Error("结构化报告 diff 字段不是有效 JSON");
			}
		}
		if (isObject(diffValue)) {
			value = {
				...diffValue,
				metadata: isObject(diffValue.metadata)
					? diffValue.metadata
					: wrapper.metadata,
				updates: isObject(diffValue.updates)
					? diffValue.updates
					: wrapper.updates,
			};
		} else {
			value = diffValue;
		}
	}
	return value;
};

/**
 * 读取云端结构化审阅报告（GET，无需鉴权）。
 * 成功时返回已剥信封的报告 JSON 对象。
 */
export const fetchStructuredReviewDiff = async (
	options: StructuredReviewDiffTarget,
): Promise<unknown> => {
	const response = await fetch(buildStructuredReviewDiffUrl(options), {
		method: "GET",
		headers: {
			Accept: "application/json",
		},
	});
	if (!response.ok) {
		const detail = await readDiffErrorDetail(response);
		throw new Error(
			mapStructuredReviewDiffHttpError(response.status, detail, "读取"),
		);
	}
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		return unwrapStructuredReviewReport(await response.json());
	}
	const textBody = await response.text();
	let payload: unknown;
	try {
		payload = JSON.parse(textBody);
	} catch {
		throw new Error("云端返回的结构化报告不是有效 JSON");
	}
	return unwrapStructuredReviewReport(payload);
};

/** 上传结构化审阅报告（POST，需歌词站审核员 token）。 */
export const uploadStructuredReviewDiff = async (
	options: StructuredReviewDiffTarget & {
		token: string;
		report: StructuredReviewReport;
	},
): Promise<StructuredReviewDiffUploadResult> => {
	const token = options.token.trim();
	if (!token) throw new Error("请先登录歌词站以上传结构化报告");
	const response = await fetch(buildStructuredReviewDiffUrl(options), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify(options.report),
	});
	if (!response.ok) {
		const detail = await readDiffErrorDetail(response);
		throw new Error(
			mapStructuredReviewDiffHttpError(response.status, detail, "上传"),
		);
	}
	const payload = (await response
		.json()
		.catch(() => null)) as StructuredReviewDiffUploadResult | null;
	if (payload?.success !== true) {
		throw new Error(
			typeof payload?.message === "string" && payload.message
				? `上传结构化报告失败：${payload.message}`
				: "上传结构化报告失败：响应无效",
		);
	}
	return payload;
};
