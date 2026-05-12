import {
	Checkmark20Regular,
	Delete20Regular,
	Dismiss20Regular,
	Merge20Regular,
	MusicNote220Regular,
} from "@fluentui/react-icons";
import { Button, Flex, Text } from "@radix-ui/themes";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { githubFetch } from "$/modules/github/api";
import {
	ensurePullRequestAssigned,
	mergePullRequest,
} from "$/modules/github/services/PR-service";
import { submitReview as submitReviewService } from "$/modules/github/services/submit-service";
import { submitReview as submitLyricsSiteReview } from "$/modules/lyrics-site";
import { githubPatAtom, lyricsSiteTokenAtom } from "$/modules/settings/states";
import {
	confirmDialogAtom,
	type ReviewReportDialogState,
} from "$/states/dialogs";
import { reviewReviewedPrsAtom, reviewSingleRefreshAtom } from "$/states/main";
import { pushNotificationAtom } from "$/states/notifications";

const REPO_OWNER = "Steve-xmh";
const REPO_NAME = "amll-ttml-db";
const PENDING_LABEL_NAME = "待更新";

type ReviewSubmissionEvent = "APPROVE" | "REQUEST_CHANGES";
type ReviewSubmitPending =
	| ReviewSubmissionEvent
	| "MERGE"
	| "MISSING_AUDIO"
	| null;

export type ReviewReportSubmissionBarProps = {
	dialog: ReviewReportDialogState;
	getCleanReport: () => string;
	onDiscard: () => void;
	onSubmitAndClose: () => void;
};

export const ReviewReportSubmissionBar = ({
	dialog,
	getCleanReport,
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

	useEffect(() => {
		if (dialog.open) {
			setApprovedByUser(false);
		}
	}, [dialog.open]);

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
		} catch {
			setPushNotification({
				title: "合并失败：网络错误",
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
				disabled={submitPending !== null}
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
				{dialog.source !== "lyrics-site" && (
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
