import {
	ArrowDownload20Regular,
	ArrowUpload20Regular,
	Checkmark20Regular,
	Delete20Regular,
	Dismiss20Regular,
	Merge20Regular,
	MusicNote220Regular,
} from "@fluentui/react-icons";
import { Button, Flex, Text } from "@radix-ui/themes";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import saveFile from "save-file";
import { githubFetch } from "$/modules/github/api";
import {
	ensurePullRequestAssigned,
	fetchPullRequestApprovalCount,
	fetchPullRequestDetail,
	mergePullRequest,
} from "$/modules/github/services/PR-service";
import { submitReview as submitReviewService } from "$/modules/github/services/submit-service";
import { submitReview as submitLyricsSiteReview } from "$/modules/lyrics-site";
import {
	githubLoginAtom,
	githubPatAtom,
	lyricsSiteTokenAtom,
} from "$/modules/settings/states";
import { generateTTMLLyric } from "$/modules/ttml-processor";
import {
	type StructuredReviewDiffPlatform,
	uploadStructuredReviewDiff,
} from "$/services/structured-review-diff-api";
import {
	confirmDialogAtom,
	type ReviewReportDialogState,
} from "$/states/dialogs";
import {
	lyricLinesAtom,
	type ReviewSnapshot,
	reviewFreezeAtom,
	reviewReviewedPrsAtom,
	reviewSingleRefreshAtom,
} from "$/states/main";
import { pushNotificationAtom } from "$/states/notifications";
import type { StructuredReviewReport } from "$/types/structured-review-report";
import type { TTMLLyric } from "$/types/ttml";
import { error as logError } from "$/utils/logging";
import {
	REVIEW_APPROVAL_TARGET,
	REVIEW_RECRUITMENT_LABEL_NAME,
} from "./card-service";
import { buildStructuredReviewUpdates } from "./report-service/structured-report-builder";
import type { ReviewReport } from "./report-service/types";
import { updateReviewHistoryReport } from "./review-history-db";

const REPO_OWNER = "amll-dev";
const REPO_NAME = "amll-ttml-db";
const PENDING_LABEL_NAME = "待更新";

const resolveReviewDiffPlatform = (
	source?: "github" | "lyrics-site" | string | null,
): StructuredReviewDiffPlatform =>
	source === "lyrics-site" ? "gcz" : "github";

const getFirstMetadataValue = (lyrics: TTMLLyric, key: string) =>
	lyrics.metadata
		.find((entry) => entry.key === key)
		?.value.find((value) => value.trim())
		?.trim() ?? "";

export const buildStructuredReviewReport = (options: {
	freeze: ReviewSnapshot;
	staged: TTMLLyric;
	modifiedTtml: string;
	report: ReviewReport;
	submitter: string;
}): StructuredReviewReport => {
	const generatedOriginal = generateTTMLLyric(options.freeze.data);
	const original =
		options.freeze.originalTtml ||
		(generatedOriginal.success ? generatedOriginal.data : "");
	return {
		original,
		modified: options.modifiedTtml,
		metadata: {
			title: getFirstMetadataValue(options.staged, "musicName"),
			artist: getFirstMetadataValue(options.staged, "artists"),
			submitter: options.submitter.trim(),
		},
		updates: buildStructuredReviewUpdates({
			freeze: options.freeze.data,
			staged: options.staged,
			contentHash: options.freeze.structure.contentHash,
			report: options.report,
		}),
	};
};

type ReviewSubmissionEvent = "APPROVE" | "REQUEST_CHANGES";
type ReviewSubmitPending =
	| ReviewSubmissionEvent
	| "MERGE"
	| "MISSING_AUDIO"
	| null;

/**
 * 参与审核招募的稿件需要集齐足够的批准才能合并，所以进入审阅会话时要
 * 先确认稿件是否带这个标签、以及当前已有多少人批准过。
 *
 * - pending：还没拿到结论（正在拉取 / 缺少 token / 拉取失败），一律不放开合并；
 *   宁可少显示一个按钮，也不要在招募稿件上误开一个绕过批准数的入口。
 * - plain：不带招募标签，保持原有行为。
 * - recruitment：带招募标签，按批准数判断。
 */
type MergeGateState =
	| { kind: "pending" }
	| { kind: "plain" }
	| { kind: "recruitment"; approvalCount: number; viewerApproved: boolean };

const PENDING_MERGE_GATE: MergeGateState = { kind: "pending" };

/**
 * 招募稿件只有两种情况可以合并：已经集齐目标批准数，或当前用户就是补上
 * 最后一票的那个人。
 */
const isMergeAllowed = (gate: MergeGateState) => {
	if (gate.kind === "pending") return false;
	if (gate.kind === "plain") return true;
	// 合并流程本身会补上当前用户的批准，所以还没投过票的人相当于预占一票：
	// 这让“当前用户正好是最后一位批准者”的情况也能直接合并。
	const effectiveCount = gate.viewerApproved
		? gate.approvalCount
		: gate.approvalCount + 1;
	return effectiveCount >= REVIEW_APPROVAL_TARGET;
};

export type ReviewReportSubmissionBarProps = {
	dialog: ReviewReportDialogState;
	getCleanReport: () => string;
	getCurrentReport: () => ReviewReport;
	onDiscard: () => void;
	onSubmitAndClose: () => void;
};

export const ReviewReportSubmissionBar = ({
	dialog,
	getCleanReport,
	getCurrentReport,
	onDiscard,
	onSubmitAndClose,
}: ReviewReportSubmissionBarProps) => {
	const setReviewReviewedPrs = useSetAtom(reviewReviewedPrsAtom);
	const setReviewSingleRefresh = useSetAtom(reviewSingleRefreshAtom);
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const pat = useAtomValue(githubPatAtom);
	const lyricsSiteToken = useAtomValue(lyricsSiteTokenAtom);
	const [approvedByUser, setApprovedByUser] = useState(false);
	const [submitPending, setSubmitPending] = useState<ReviewSubmitPending>(null);
	const [exportPending, setExportPending] = useState(false);
	const [uploadPending, setUploadPending] = useState(false);
	const lyricLines = useAtomValue(lyricLinesAtom);
	const reviewFreeze = useAtomValue(reviewFreezeAtom);
	const githubLogin = useAtomValue(githubLoginAtom);
	const [mergeGate, setMergeGate] = useState<MergeGateState>(PENDING_MERGE_GATE);

	useEffect(() => {
		if (dialog.open) {
			setApprovedByUser(false);
		}
	}, [dialog.open]);

	/**
	 * 参与审核招募的稿件需要集齐足够的批准才能合并：这里在打开报告时拉一次
	 * 标签与批准列表，只有已达标、或当前用户就是补上最后一票的人才放开合并按钮。
	 */
	useEffect(() => {
		if (!dialog.open || !dialog.prNumber) {
			setMergeGate(PENDING_MERGE_GATE);
			return;
		}
		// 歌词站稿件本来就没有合并按钮，不需要判定。
		if (dialog.source === "lyrics-site") {
			setMergeGate(PENDING_MERGE_GATE);
			return;
		}
		const token = pat.trim();
		if (!token) {
			setMergeGate(PENDING_MERGE_GATE);
			return;
		}
		const prNumber = dialog.prNumber;
		let cancelled = false;
		setMergeGate(PENDING_MERGE_GATE);
		const run = async () => {
			try {
				const detail = await fetchPullRequestDetail({ token, prNumber });
				if (cancelled) return;
				if (!detail) return;
				const isRecruitment = detail.labels.some(
					(label) => label.name.trim() === REVIEW_RECRUITMENT_LABEL_NAME,
				);
				if (!isRecruitment) {
					setMergeGate({ kind: "plain" });
					return;
				}
				const result = await fetchPullRequestApprovalCount({ token, prNumber });
				if (cancelled || !result.ok) return;
				const viewer = githubLogin.trim().toLowerCase();
				setMergeGate({
					kind: "recruitment",
					approvalCount: result.count,
					viewerApproved: viewer
						? result.approvedLogins.includes(viewer)
						: false,
				});
			} catch (cause) {
				logError("[review] failed to resolve merge gate", cause);
			}
		};
		void run();
		return () => {
			cancelled = true;
		};
	}, [dialog.open, dialog.prNumber, dialog.source, githubLogin, pat]);

	const mergeAllowed = isMergeAllowed(mergeGate);

	const markReviewedAndRefresh = () => {
		setReviewReviewedPrs((prev: Record<number, boolean>) =>
			dialog.prNumber ? { ...prev, [dialog.prNumber]: true } : prev,
		);
		if (dialog.prNumber) {
			setReviewSingleRefresh(dialog.prNumber);
		}
	};

	const getCurrentUserLogin = async (token: string) => {
		const userResponse = await githubFetch("/user", {
			init: {
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${token}`,
				},
			},
		});
		if (!userResponse.ok) {
			setPushNotification({
				title: `获取用户信息失败：${userResponse.status}`,
				level: "error",
				source: "Review",
			});
			return "";
		}
		const userData = (await userResponse.json()) as { login?: string };
		const userLogin = userData.login?.trim() ?? "";
		if (!userLogin) {
			setPushNotification({
				title: "无法识别当前登录用户",
				level: "error",
				source: "Review",
			});
		}
		return userLogin;
	};

	const ensureAssigned = async (token: string, prNumber: number) => {
		const userLogin = await getCurrentUserLogin(token);
		if (!userLogin) return "";
		const assignResult = await ensurePullRequestAssigned({
			token,
			prNumber,
			login: userLogin,
		});
		if (!assignResult.ok) {
			setPushNotification({
				title: `设置 PR 负责人失败：${assignResult.status ?? "未知"}`,
				level: "error",
				source: "Review",
			});
			return "";
		}
		return userLogin;
	};

	const createCurrentStructuredReport = (): StructuredReviewReport => {
		if (!reviewFreeze) {
			throw new Error("当前审阅文件尚未完成结构化快照");
		}
		const modifiedResult = generateTTMLLyric(lyricLines);
		if (!modifiedResult.success) {
			throw new Error(modifiedResult.error.message);
		}
		return buildStructuredReviewReport({
			freeze: reviewFreeze,
			staged: lyricLines,
			modifiedTtml: modifiedResult.data,
			report: getCurrentReport(),
			submitter: githubLogin,
		});
	};

	const persistCurrentStructuredReport = async () => {
		if (!reviewFreeze) {
			throw new Error("当前审阅文件尚未完成结构化快照");
		}
		const structuredReport = createCurrentStructuredReport();
		await updateReviewHistoryReport(reviewFreeze.historyId, structuredReport);
		return structuredReport;
	};

	/**
	 * 结构化报告只是审阅的附带产物：报告为空、快照未就绪或写库失败都不应该
	 * 阻塞接受 / 需要修改 / 合并这些真正的审阅动作。
	 */
	const persistStructuredReportBestEffort = async () => {
		try {
			await persistCurrentStructuredReport();
		} catch (cause) {
			logError("[review] failed to persist structured review report", cause);
			// 快照尚未生成属于预期情况（例如未走审阅会话直接打开报告），静默跳过；
			// 其余失败说明写入确实出错，提示一次但仍继续提交。
			if (reviewFreeze) {
				setPushNotification({
					title: "结构化报告未能保存，已继续提交",
					description: cause instanceof Error ? cause.message : undefined,
					level: "warning",
					source: "Review",
				});
			}
		}
	};

	const submitReview = async (event: ReviewSubmissionEvent) => {
		if (!dialog.prNumber && !dialog.submissionId) {
			setPushNotification({
				title: "无法提交审阅结果：缺少稿件编号",
				level: "error",
				source: "Review",
			});
			return;
		}

		const reportBody = getCleanReport();
		if (event === "REQUEST_CHANGES" && !reportBody) {
			setPushNotification({
				title: "请填写需要修改内容再提交",
				level: "warning",
				source: "Review",
			});
			return;
		}

		setSubmitPending(event);
		try {
			await persistStructuredReportBestEffort();
			if (dialog.source === "lyrics-site") {
				const token = lyricsSiteToken?.trim();
				if (!token) {
					setPushNotification({
						title: "请先登录歌词站以提交审阅结果",
						level: "error",
						source: "Review",
					});
					return;
				}

				const submissionId = dialog.submissionId || String(dialog.prNumber);
				const action = event === "APPROVE" ? "approve" : "revision";

				await submitLyricsSiteReview(token, submissionId, action, reportBody);

				if (event === "APPROVE") {
					setApprovedByUser(true);
				}
				setPushNotification({
					title: "已提交审阅结果",
					level: "success",
					source: "Review",
				});
				markReviewedAndRefresh();
				onSubmitAndClose();
			} else {
				const prNumber = dialog.prNumber;
				if (!prNumber) {
					setPushNotification({
						title: "无法提交审阅结果：缺少 PR 编号",
						level: "error",
						source: "Review",
					});
					return;
				}
				const token = pat.trim();
				if (!token) {
					setPushNotification({
						title: "请先在设置中登录以提交审阅结果",
						level: "error",
						source: "Review",
					});
					return;
				}

				const userLogin = await ensureAssigned(token, prNumber);
				if (!userLogin) return;
				const result = await submitReviewService({
					token,
					prNumber,
					event,
					reportBody,
					repoOwner: REPO_OWNER,
					repoName: REPO_NAME,
					pendingLabelName: PENDING_LABEL_NAME,
				});
				if (!result.ok) {
					setPushNotification({
						title: `提交审阅结果失败：${result.status ?? "未知"}`,
						level: "error",
						source: "Review",
					});
					return;
				}
				if (result.labelStatus) {
					setPushNotification({
						title: `已提交审阅结果，但设置待更新标签失败：${result.labelStatus}`,
						level: "warning",
						source: "Review",
					});
				}
				if (event === "APPROVE") {
					setApprovedByUser(true);
				}
				setPushNotification({
					title: "已提交审阅结果",
					level: "success",
					source: "Review",
				});
				markReviewedAndRefresh();
				onSubmitAndClose();
			}
		} catch (error) {
			setPushNotification({
				title: `提交审阅结果失败：${error instanceof Error ? error.message : "网络错误"}`,
				level: "error",
				source: "Review",
			});
		} finally {
			setSubmitPending(null);
		}
	};

	const exportStructuredReport = async () => {
		setExportPending(true);
		try {
			const structuredReport = await persistCurrentStructuredReport();
			const blob = new Blob([JSON.stringify(structuredReport, null, 2)], {
				type: "application/json",
			});
			const suffix = dialog.prNumber ? `pr-${dialog.prNumber}` : "review";
			await saveFile(blob, `structured-review-${suffix}.json`);
			setPushNotification({
				title: "结构化审阅报告已导出",
				level: "success",
				source: "Review",
			});
		} catch (error) {
			setPushNotification({
				title: `导出结构化报告失败：${error instanceof Error ? error.message : "未知错误"}`,
				level: "error",
				source: "Review",
			});
		} finally {
			setExportPending(false);
		}
	};

	const resolveDiffTarget = () => {
		const platform = resolveReviewDiffPlatform(dialog.source);
		const id =
			platform === "gcz"
				? dialog.submissionId ||
					(dialog.prNumber != null ? String(dialog.prNumber) : "")
				: dialog.prNumber != null
					? String(dialog.prNumber)
					: (dialog.submissionId ?? "");
		if (!id) {
			throw new Error("无法上传：缺少稿件编号");
		}
		return { platform, id };
	};

	const uploadStructuredReport = async () => {
		const token = lyricsSiteToken?.trim();
		if (!token) {
			setPushNotification({
				title: "请先登录歌词站以上传结构化报告",
				level: "error",
				source: "Review",
			});
			return;
		}
		setUploadPending(true);
		try {
			const { platform, id } = resolveDiffTarget();
			const structuredReport = await persistCurrentStructuredReport();
			const result = await uploadStructuredReviewDiff({
				token,
				platform,
				id,
				report: structuredReport,
			});
			setPushNotification({
				title: result.message || "Diff文件已保存",
				level: "success",
				source: "Review",
				description: result.filename
					? `${result.filename}${result.createdAt ? ` · ${result.createdAt}` : ""}`
					: undefined,
			});
		} catch (error) {
			setPushNotification({
				title: error instanceof Error ? error.message : "上传结构化报告失败",
				level: "error",
				source: "Review",
			});
		} finally {
			setUploadPending(false);
		}
	};

	const submitMissingAudio = async () => {
		if (!dialog.submissionId && !dialog.prNumber) {
			setPushNotification({
				title: "无法提交：缺少稿件编号",
				level: "error",
				source: "Review",
			});
			return;
		}

		const token = lyricsSiteToken?.trim();
		if (!token) {
			setPushNotification({
				title: "请先登录歌词站",
				level: "error",
				source: "Review",
			});
			return;
		}

		setSubmitPending("MISSING_AUDIO");
		try {
			const submissionId = dialog.submissionId || String(dialog.prNumber);
			await submitLyricsSiteReview(
				token,
				submissionId,
				"missing_audio",
				getCleanReport(),
			);

			setPushNotification({
				title: "已标记为缺少音源",
				level: "success",
				source: "Review",
			});
			onSubmitAndClose();
		} catch (error) {
			setPushNotification({
				title: `标记失败：${error instanceof Error ? error.message : "网络错误"}`,
				level: "error",
				source: "Review",
			});
		} finally {
			setSubmitPending(null);
		}
	};

	const submitMerge = async () => {
		if (!dialog.prNumber) {
			setPushNotification({
				title: "无法合并：缺少 PR 编号",
				level: "error",
				source: "Review",
			});
			return;
		}
		const token = pat.trim();
		if (!token) {
			setPushNotification({
				title: "请先在设置中登录以合并 PR",
				level: "error",
				source: "Review",
			});
			return;
		}
		setSubmitPending("MERGE");
		try {
			await persistStructuredReportBestEffort();
			const userLogin = await ensureAssigned(token, dialog.prNumber);
			if (!userLogin) {
				return;
			}
			const reviewsResponse = await githubFetch(
				`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${dialog.prNumber}/reviews`,
				{
					init: {
						headers: {
							Accept: "application/vnd.github+json",
							Authorization: `Bearer ${token}`,
						},
					},
				},
			);
			if (!reviewsResponse.ok) {
				setPushNotification({
					title: `获取审阅状态失败：${reviewsResponse.status}`,
					level: "error",
					source: "Review",
				});
				return;
			}
			const reviews = (await reviewsResponse.json()) as Array<{
				user?: { login?: string };
				state?: string;
				submitted_at?: string;
			}>;
			const normalizedUser = userLogin.toLowerCase();
			let latestReview: { state?: string; submitted_at?: string } | null = null;
			for (const review of reviews) {
				const reviewLogin = review.user?.login?.toLowerCase();
				if (reviewLogin !== normalizedUser) continue;
				if (
					!latestReview ||
					(review.submitted_at &&
						(!latestReview.submitted_at ||
							review.submitted_at > latestReview.submitted_at))
				) {
					latestReview = review;
				}
			}
			if (latestReview?.state !== "APPROVED") {
				const approveResponse = await githubFetch(
					`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${dialog.prNumber}/reviews`,
					{
						init: {
							method: "POST",
							headers: {
								Accept: "application/vnd.github+json",
								Authorization: `Bearer ${token}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ event: "APPROVE" }),
						},
					},
				);
				if (!approveResponse.ok) {
					setPushNotification({
						title: `自动批准失败：${approveResponse.status}`,
						level: "error",
						source: "Review",
					});
					return;
				}
				setApprovedByUser(true);
			}
			const reportBody = getCleanReport();
			if (reportBody) {
				const commentResponse = await githubFetch(
					`/repos/${REPO_OWNER}/${REPO_NAME}/issues/${dialog.prNumber}/comments`,
					{
						init: {
							method: "POST",
							headers: {
								Accept: "application/vnd.github+json",
								Authorization: `Bearer ${token}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ body: reportBody }),
						},
					},
				);
				if (commentResponse.status !== 201) {
					setPushNotification({
						title: `发送评论失败：${commentResponse.status}`,
						level: "error",
						source: "Review",
					});
					return;
				}
			}
			const response = await mergePullRequest({
				token,
				prNumber: dialog.prNumber,
				mergeMethod: "squash",
			});
			if (!response.ok) {
				setPushNotification({
					title: `合并失败：${response.status}`,
					level: "error",
					source: "Review",
				});
				return;
			}
			setPushNotification({
				title: "已合并 PR",
				level: "success",
				source: "Review",
			});
			markReviewedAndRefresh();
			onSubmitAndClose();
		} catch (error) {
			console.error("[ReviewSubmission] Failed to merge pull request:", error);
			setPushNotification({
				title: `合并失败：${error instanceof Error ? error.message : "未知错误"}`,
				level: "error",
				source: "Review",
			});
		} finally {
			setSubmitPending(null);
		}
	};

	return (
		<Flex align="center" justify="between" gap="2">
			<Button
				size="2"
				variant="soft"
				color="gray"
				onClick={onDiscard}
				disabled={submitPending !== null || exportPending || uploadPending}
			>
				<Flex align="center" gap="2">
					<Delete20Regular />
					<Text size="2">放弃</Text>
				</Flex>
			</Button>
			<Flex align="center" justify="end" gap="2">
				<Button
					size="2"
					variant="soft"
					onClick={() => void exportStructuredReport()}
					disabled={submitPending !== null || exportPending || uploadPending}
				>
					<Flex align="center" gap="2">
						<ArrowDownload20Regular />
						<Text size="2">{exportPending ? "导出中..." : "导出 JSON"}</Text>
					</Flex>
				</Button>
				<Button
					size="2"
					variant="soft"
					color="blue"
					onClick={() => void uploadStructuredReport()}
					disabled={submitPending !== null || exportPending || uploadPending}
				>
					<Flex align="center" gap="2">
						<ArrowUpload20Regular />
						<Text size="2">{uploadPending ? "上传中..." : "上传 JSON"}</Text>
					</Flex>
				</Button>
				<Button
					size="2"
					variant="soft"
					color="green"
					onClick={() =>
						setConfirmDialog({
							open: true,
							title: "确认接受",
							description: `确定要接受 PR#${dialog.prNumber}${dialog.prTitle ? ` ${dialog.prTitle}` : ""} 吗？`,
							onConfirm: () => submitReview("APPROVE"),
						})
					}
					disabled={approvedByUser || submitPending !== null}
				>
					<Flex align="center" gap="2">
						<Checkmark20Regular />
						<Text size="2">接受</Text>
					</Flex>
				</Button>
				<Button
					size="2"
					variant="soft"
					color="red"
					onClick={() =>
						setConfirmDialog({
							open: true,
							title: "确认需要修改",
							description: `确定要标记 PR#${dialog.prNumber}${dialog.prTitle ? ` ${dialog.prTitle}` : ""} 为需要修改吗？`,
							onConfirm: () => submitReview("REQUEST_CHANGES"),
						})
					}
					disabled={submitPending !== null || getCleanReport().length === 0}
				>
					<Flex align="center" gap="2">
						<Dismiss20Regular />
						<Text size="2">需要修改</Text>
					</Flex>
				</Button>
				{dialog.source === "lyrics-site" && (
					<Button
						size="2"
						variant="soft"
						color="orange"
						onClick={() =>
							setConfirmDialog({
								open: true,
								title: "确认标记缺少音源",
								description: `确定要标记稿件"${dialog.prTitle}"为缺少音源吗？`,
								onConfirm: submitMissingAudio,
							})
						}
						disabled={submitPending !== null}
					>
						<Flex align="center" gap="2">
							<MusicNote220Regular />
							<Text size="2">缺少音源</Text>
						</Flex>
					</Button>
				)}
				{dialog.source !== "lyrics-site" && mergeAllowed && (
					<Button
						size="2"
						variant="soft"
						color="gray"
						onClick={() =>
							setConfirmDialog({
								open: true,
								title: "确认合并",
								description: `确定要合并 PR#${dialog.prNumber}${dialog.prTitle ? ` ${dialog.prTitle}` : ""} 吗？`,
								onConfirm: submitMerge,
							})
						}
						disabled={submitPending !== null}
					>
						<Flex align="center" gap="2">
							<Merge20Regular />
							<Text size="2">合并</Text>
						</Flex>
					</Button>
				)}
			</Flex>
		</Flex>
	);
};
