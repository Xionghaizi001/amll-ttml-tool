import { githubFetch, githubFetchRaw } from "$/modules/github/api";
import { ToolMode, type ReviewSessionSource } from "$/states/main";
import type { AppNotification } from "$/states/notifications";

const REPO_OWNER = "Steve-xmh";
const REPO_NAME = "amll-ttml-db";

type ReviewFileEntry = {
	filename: string;
	raw_url?: string | null;
};

type OpenFile = (file: File, forceExt?: string) => void;
type PushNotification = (
	input: Omit<AppNotification, "id" | "createdAt"> & {
		id?: string;
		createdAt?: string;
	},
) => void;

const pickReviewFile = (files: ReviewFileEntry[]) => {
	const supported = ["ttml", "lrc", "eslrc", "qrc", "yrc", "lys"];
	const priority = new Map(supported.map((ext, index) => [ext, index]));
	return files
		.map((file) => {
			const ext = file.filename.split(".").pop()?.toLowerCase() ?? "";
			return { ...file, ext };
		})
		.filter((file) => priority.has(file.ext))
		.sort(
			(a, b) =>
				(priority.get(a.ext) ?? 999) - (priority.get(b.ext) ?? 999),
		)[0];
};

export const loadReviewFileFromPullRequest = async (options: {
	token: string;
	prNumber: number;
	prTitle: string;
	source: ReviewSessionSource;
	openFile: OpenFile;
	setToolMode: (mode: ToolMode) => void;
	setReviewSession: (value: {
		prNumber: number;
		prTitle: string;
		fileName: string;
		source: ReviewSessionSource;
	}) => void;
	pushNotification: PushNotification;
}) => {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${options.token}`,
	};
	const fileResponse = await githubFetch(
		`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${options.prNumber}/files`,
		{
			params: { per_page: 100 },
			init: { headers },
		},
	);
	if (!fileResponse.ok) {
		throw new Error("load-pr-files-failed");
	}
	const files = (await fileResponse.json()) as ReviewFileEntry[];
	const pick = pickReviewFile(files);
	if (!pick?.raw_url) {
		options.pushNotification({
			title: "未找到可打开的歌词文件",
			level: "warning",
			source: "review",
		});
		return null;
	}
	const rawResponse = await githubFetchRaw(pick.raw_url, {
		init: { headers },
	});
	if (!rawResponse.ok) {
		throw new Error("load-raw-file-failed");
	}
	const blob = await rawResponse.blob();
	const fileName = pick.filename.split("/").pop() ?? pick.filename;
	const file = new File([blob], fileName);
	options.setReviewSession({
		prNumber: options.prNumber,
		prTitle: options.prTitle,
		fileName,
		source: options.source,
	});
	options.openFile(file);
	options.setToolMode(ToolMode.Edit);
	return { fileName, rawUrl: pick.raw_url };
};
