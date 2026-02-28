import type { AppNotification } from "$/states/notifications";
import type { FileUpdateSession, ReviewReportDraft, ToolMode } from "$/states/main";
import { openReviewUpdateFromNotification } from "$/modules/user/services/update-service";
import type { Dispatch, SetStateAction } from "react";

type OpenFile = (file: File, forceExt?: string) => void;
type PushNotification = (
	input: Omit<AppNotification, "id" | "createdAt"> & {
		id?: string;
		createdAt?: string;
	},
) => void;
type ReviewUpdatePayload = { prNumber: number; prTitle: string };
type ReviewReportDialogState = {
	open: boolean;
	prNumber: number | null;
	prTitle: string;
	report: string;
	draftId: string | null;
};
type ReviewReportDraftAction = Extract<
	NonNullable<AppNotification["action"]>,
	{ type: "open-review-report" }
>;

export const getReviewReportDraftAction = (item: AppNotification) =>
	item.action?.type === "open-review-report" ? item.action : null;

export const createReviewReportDraftHandler =
	(options: {
		drafts: ReviewReportDraft[];
		setReviewReportDialog: (value: ReviewReportDialogState) => void;
		onClose: () => void;
	}) =>
	(action: ReviewReportDraftAction | null) => {
		if (!action) return;
		const draft = options.drafts.find(
			(candidate) => candidate.id === action.payload.draftId,
		);
		if (!draft) return;
		options.setReviewReportDialog({
			open: true,
			prNumber: draft.prNumber,
			prTitle: draft.prTitle,
			report: draft.report,
			draftId: draft.id,
		});
		options.onClose();
	};

export const createReviewUpdateNotificationHandler = (options: {
	pat: string;
	openFile: OpenFile;
	setFileUpdateSession: (value: FileUpdateSession | null) => void;
	setToolMode: (mode: ToolMode) => void;
	pushNotification: PushNotification;
	neteaseCookie: string;
	pendingId: string | null;
	setPendingId: (value: string | null) => void;
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
				setFileUpdateSession: options.setFileUpdateSession,
				setToolMode: options.setToolMode,
				pushNotification: options.pushNotification,
				neteaseCookie: options.neteaseCookie,
				pendingId: options.pendingId,
				setPendingId: options.setPendingId,
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
