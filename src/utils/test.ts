import type { AppNotification } from "$/states/notifications";
import { ToolMode, type FileUpdateSession, type ReviewSession } from "$/states/main";
import type { Dispatch, SetStateAction } from "react";
import { openReviewUpdateFromNotification } from "$/modules/user/services/update-service";

type OpenFile = (file: File, forceExt?: string) => void;
type PushNotification = (
	input: Omit<AppNotification, "id" | "createdAt"> & {
		id?: string;
		createdAt?: string;
	},
) => void;

type InjectReviewFileOptions = {
	filename?: string;
	prNumber?: number;
	prTitle?: string;
};

type InjectReviewUpdateOptions = {
	token: string;
	prNumber: number;
	prTitle?: string;
	neteaseCookie?: string;
	selectNeteaseId?: (ids: string[]) => Promise<string | null> | string | null;
};

type DevTestHooksOptions = {
	openFile: OpenFile;
	setReviewSession: (value: ReviewSession) => void;
	setFileUpdateSession: (value: FileUpdateSession | null) => void;
	setToolMode: (mode: ToolMode) => void;
	pushNotification: PushNotification;
	neteaseCookie?: string;
};

export const setupDevTestHooks = (options: DevTestHooksOptions) => {
	if (!import.meta.env.DEV) return () => {};
	const injectReviewFile = (
		content: string,
		injectOptions?: InjectReviewFileOptions,
	) => {
		const filename = injectOptions?.filename ?? "review.ttml";
		const file = new File([content], filename, { type: "text/plain" });
		options.setReviewSession({
			prNumber: injectOptions?.prNumber ?? 0,
			prTitle: injectOptions?.prTitle ?? filename,
			fileName: filename,
			source: "review",
		});
		options.openFile(file);
		options.setToolMode(ToolMode.Edit);
	};
	let pendingId: string | null = null;
	const setPendingId = (value: string | null) => {
		pendingId = value;
	};
	const setLastNeteaseIdByPr: Dispatch<
		SetStateAction<Record<number, string>>
	> = (value) => {
		if (typeof value === "function") {
			value({});
		}
	};
	const injectReviewUpdate = async (injectOptions: InjectReviewUpdateOptions) => {
		await openReviewUpdateFromNotification({
			token: injectOptions.token,
			prNumber: injectOptions.prNumber,
			prTitle: injectOptions.prTitle ?? `PR#${injectOptions.prNumber}`,
			openFile: options.openFile,
			setFileUpdateSession: options.setFileUpdateSession,
			setToolMode: options.setToolMode,
			pushNotification: options.pushNotification,
			neteaseCookie: injectOptions.neteaseCookie ?? options.neteaseCookie ?? "",
			pendingId,
			setPendingId,
			setLastNeteaseIdByPr,
			selectNeteaseId: injectOptions.selectNeteaseId,
		});
	};
	const target = window as typeof window & {
		injectReviewFile?: typeof injectReviewFile;
		injectReviewUpdate?: typeof injectReviewUpdate;
	};
	target.injectReviewFile = injectReviewFile;
	target.injectReviewUpdate = injectReviewUpdate;
	return () => {
		delete target.injectReviewFile;
		delete target.injectReviewUpdate;
	};
};
