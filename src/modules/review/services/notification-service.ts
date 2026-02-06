import type { Dispatch, SetStateAction } from "react";
import type { AppNotification } from "$/states/notifications";
import type { ReviewSessionSource, ToolMode } from "$/states/main";
import { openReviewUpdateFromNotification } from "$/modules/user/services/pr/update-service";

type OpenFile = (file: File, forceExt?: string) => void;
type PushNotification = (
	input: Omit<AppNotification, "id" | "createdAt"> & {
		id?: string;
		createdAt?: string;
	},
) => void;
type ReviewUpdatePayload = { prNumber: number; prTitle: string };

export const createReviewUpdateNotificationHandler = (options: {
	pat: string;
	neteaseCookie: string;
	openFile: OpenFile;
	setToolMode: (mode: ToolMode) => void;
	setReviewSession: (value: {
		prNumber: number;
		prTitle: string;
		fileName: string;
		source: ReviewSessionSource;
	}) => void;
	pushNotification: PushNotification;
	audioLoadPendingId: string | null;
	setAudioLoadPendingId: Dispatch<SetStateAction<string | null>>;
	setLastNeteaseIdByPr: Dispatch<SetStateAction<Record<number, string>>>;
	selectNeteaseId?: (ids: string[]) => Promise<string | null> | string | null;
	onClose: () => void;
}) =>
	async (payload: ReviewUpdatePayload) => {
		const token = options.pat.trim();
		if (!token) {
			options.pushNotification({
				title: "请先在设置中登录以打开文件",
				level: "error",
				source: "review",
			});
			return;
		}
		try {
			await openReviewUpdateFromNotification({
				token,
				prNumber: payload.prNumber,
				prTitle: payload.prTitle,
				openFile: options.openFile,
				setToolMode: options.setToolMode,
				setReviewSession: options.setReviewSession,
				pushNotification: options.pushNotification,
				neteaseCookie: options.neteaseCookie,
				pendingId: options.audioLoadPendingId,
				setPendingId: options.setAudioLoadPendingId,
				setLastNeteaseIdByPr: options.setLastNeteaseIdByPr,
				selectNeteaseId: options.selectNeteaseId,
			});
			options.onClose();
		} catch {
			options.pushNotification({
				title: "打开 PR 文件失败",
				level: "error",
				source: "review",
			});
		}
	};
