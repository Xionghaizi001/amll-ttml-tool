import {
	Checkmark20Regular,
	Dismiss20Regular,
	LightbulbCheckmark20Regular,
	Merge20Regular,
} from "@fluentui/react-icons";
import {
	Box,
	Button,
	Dialog,
	Flex,
	Text,
	TextArea,
	TextField,
} from "@radix-ui/themes";
import { openDB } from "idb";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { uid } from "uid";
import { githubFetch } from "$/modules/github/api";
import { githubPatAtom } from "$/modules/settings/states";
import { reviewReportDialogAtom } from "$/states/dialogs";
import { reviewReportDraftsAtom } from "$/states/main";
import { pushNotificationAtom, upsertNotificationAtom } from "$/states/notifications";

const REPO_OWNER = "Steve-xmh";
const REPO_NAME = "amll-ttml-db";
const TEMPLATE_DB_NAME = "review-template-db";
const TEMPLATE_STORE = "templates";
const TEMPLATE_KEY = "custom";
const DEFAULT_REPORT_TEXT = "未检测到差异。";
const PENDING_LABEL_NAME = "待更新";

type ReviewTemplate = {
	id: string;
	title: string;
	content: string;
	createdAt: string;
};

type TemplateRecord = {
	key: string;
	items: ReviewTemplate[];
	updatedAt: string;
};

const presetTemplates: ReviewTemplate[] = [
	{
		id: "preset-first-pass",
		title: "✅完美通过（首次投稿）",
		content:
			"恭喜你，人工审核通过，你的贡献将会被更多人看到。感谢你对本项目的支持。欢迎下次投稿！\nCongratulations, you are passed manual review, your contribute will be seen by others. Thanks for your support to our project. You are welcome to post next time!\n\n_推荐使用 [AMLL Player](https://github.com/Steve-xmh/applemusic-like-lyrics/actions/workflows/build-player.yaml) 以获得更好的体验_\n_To get a better experience, we are recommend to use [AMLL Player](https://github.com/Steve-xmh/applemusic-like-lyrics/actions/workflows/build-player.yaml)._ \n\n_[Chinese Only] 欢迎加入我们的QQ群 719423243 和开发者一起玩哦！_\n_[Chinese Only] 如果你在群里可以在群名片附上你的 ID 以停止接收这条小广告~_",
		createdAt: "preset",
	},
	{
		id: "preset-pass",
		title: "✅完美通过",
		content:
			"恭喜你，人工审核通过，你的贡献会被更多人看到。感谢你对本项目的支持。欢迎下次投稿！",
		createdAt: "preset",
	},
	{
		id: "preset-update",
		title: "⚠️需要修改",
		content:
			"感谢你的慷慨贡献，但是很遗憾，本次人工审核你没有成功通过。建议参考以下内容修改并更新歌词，期待你更高质量的投稿！\n以下为这份歌词存在的问题：",
		createdAt: "preset",
	},
];

const templateDbPromise = openDB(TEMPLATE_DB_NAME, 1, {
	upgrade(db) {
		if (!db.objectStoreNames.contains(TEMPLATE_STORE)) {
			db.createObjectStore(TEMPLATE_STORE, { keyPath: "key" });
		}
	},
});

const readCustomTemplates = async () => {
	try {
		const db = await templateDbPromise;
		const record = (await db.get(TEMPLATE_STORE, TEMPLATE_KEY)) as
			| TemplateRecord
			| undefined;
		return record?.items ?? [];
	} catch {
		return [];
	}
};

const writeCustomTemplates = async (items: ReviewTemplate[]) => {
	const db = await templateDbPromise;
	await db.put(TEMPLATE_STORE, {
		key: TEMPLATE_KEY,
		items,
		updatedAt: new Date().toISOString(),
	} satisfies TemplateRecord);
};

export const ReviewReportDialog = () => {
	const [dialog, setDialog] = useAtom(reviewReportDialogAtom);
	const reviewReportDrafts = useAtomValue(reviewReportDraftsAtom);
	const setReviewReportDrafts = useSetAtom(reviewReportDraftsAtom);
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const setUpsertNotification = useSetAtom(upsertNotificationAtom);
	const pat = useAtomValue(githubPatAtom);
	const submittedRef = useRef(false);
	const [approvedByUser, setApprovedByUser] = useState(false);
	const [customTemplates, setCustomTemplates] = useState<ReviewTemplate[]>([]);
	const [templateTitle, setTemplateTitle] = useState("");
	const [templateContent, setTemplateContent] = useState("");
	const [templateLoading, setTemplateLoading] = useState(false);
	const [templateSaving, setTemplateSaving] = useState(false);
	const [showTemplateEditor, setShowTemplateEditor] = useState(false);
	const [submitPending, setSubmitPending] = useState<
		"APPROVE" | "REQUEST_CHANGES" | "MERGE" | null
	>(null);
	const titleText = useMemo(() => {
		if (!dialog.prNumber) return "对当前 PR 做出的审阅结果如下：";
		const title = dialog.prTitle?.trim() ? ` ${dialog.prTitle}` : "";
		return `对 PR#${dialog.prNumber}${title} 做出的审阅结果如下：`;
	}, [dialog.prNumber, dialog.prTitle]);

	useEffect(() => {
		if (dialog.open) {
			submittedRef.current = false;
			setApprovedByUser(false);
			setShowTemplateEditor(false);
		}
	}, [dialog.open]);

	useEffect(() => {
		if (!dialog.open) return;
		let cancelled = false;
		setTemplateLoading(true);
		readCustomTemplates()
			.then((items) => {
				if (!cancelled) {
					setCustomTemplates(items);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setTemplateLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [dialog.open]);

	const closeDialog = () => {
		if (!submittedRef.current && dialog.report.trim()) {
			const existingDraft = dialog.draftId
				? reviewReportDrafts.find((item) => item.id === dialog.draftId)
				: reviewReportDrafts.find(
						(item) =>
							item.prNumber === dialog.prNumber &&
							item.prTitle === dialog.prTitle,
					);
			const draftId = existingDraft?.id ?? dialog.draftId ?? uid();
			const createdAt = new Date().toISOString();
			setReviewReportDrafts((prev) => {
				const existingIndex = prev.findIndex((item) => item.id === draftId);
				if (existingIndex >= 0) {
					const next = [...prev];
					const existing = next[existingIndex];
					next[existingIndex] = {
						...existing,
						prNumber: dialog.prNumber,
						prTitle: dialog.prTitle,
						report: dialog.report,
						createdAt: existing.createdAt ?? createdAt,
					};
					return next;
				}
				return [
					{
						id: draftId,
						prNumber: dialog.prNumber,
						prTitle: dialog.prTitle,
						report: dialog.report,
						createdAt,
					},
					...prev,
				];
			});
			const prLabel = dialog.prNumber
				? `PR#${dialog.prNumber}${dialog.prTitle ? ` ${dialog.prTitle}` : ""}`
				: "当前文件";
			setUpsertNotification({
				id: `review-report-draft-${draftId}`,
				title: "审阅报告已暂存",
				description: `点击打开 ${prLabel} 的审阅报告`,
				level: "info",
				source: "Review",
				pinned: true,
				dismissible: false,
				action: {
					type: "open-review-report",
					payload: { draftId },
				},
			});
		}
		setDialog((prev) => ({ ...prev, open: false }));
		setShowTemplateEditor(false);
		setTemplateTitle("");
		setTemplateContent("");
	};
	const submitAndClose = () => {
		submittedRef.current = true;
		closeDialog();
	};
	const getCleanReport = () => {
		const trimmed = dialog.report.trim();
		if (!trimmed || trimmed === DEFAULT_REPORT_TEXT) {
			return "";
		}
		return trimmed;
	};
	const insertTemplate = (content: string) => {
		const trimmed = content.trim();
		if (!trimmed) return;
		setDialog((prev) => {
			const current = prev.report;
			const trimmedCurrent = current.trim();
			const base =
				!trimmedCurrent || trimmedCurrent === DEFAULT_REPORT_TEXT ? "" : current;
			const nextReport = base ? `${trimmed}\n${base}` : trimmed;
			return {
				...prev,
				report: nextReport,
			};
		});
	};
	const handleSaveTemplate = async () => {
		if (templateSaving) return;
		const trimmedTitle = templateTitle.trim();
		const trimmedContent = templateContent.trim();
		if (!trimmedTitle || !trimmedContent) {
			setPushNotification({
				title: "请填写模板标题与内容",
				level: "warning",
				source: "Review",
			});
			return;
		}
		setTemplateSaving(true);
		try {
			const nextTemplates = [
				...customTemplates,
				{
					id: uid(),
					title: trimmedTitle,
					content: trimmedContent,
					createdAt: new Date().toISOString(),
				},
			];
			setCustomTemplates(nextTemplates);
			await writeCustomTemplates(nextTemplates);
			setTemplateTitle("");
			setTemplateContent("");
			setPushNotification({
				title: "已保存自定义模板",
				level: "success",
				source: "Review",
			});
		} catch {
			setPushNotification({
				title: "保存模板失败",
				level: "error",
				source: "Review",
			});
		} finally {
			setTemplateSaving(false);
		}
	};
	const submitReview = async (event: "APPROVE" | "REQUEST_CHANGES") => {
		if (!dialog.prNumber) {
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
			const response = await githubFetch(
				`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${dialog.prNumber}/reviews`,
				{
					init: {
						method: "POST",
						headers: {
							Accept: "application/vnd.github+json",
							Authorization: `Bearer ${token}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							event,
							...(reportBody ? { body: reportBody } : {}),
						}),
					},
				},
			);
			if (!response.ok) {
				setPushNotification({
					title: `提交审阅结果失败：${response.status}`,
					level: "error",
					source: "Review",
				});
				return;
			}
			if (event === "REQUEST_CHANGES") {
				const labelResponse = await githubFetch(
					`/repos/${REPO_OWNER}/${REPO_NAME}/issues/${dialog.prNumber}/labels`,
					{
						init: {
							method: "POST",
							headers: {
								Accept: "application/vnd.github+json",
								Authorization: `Bearer ${token}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ labels: [PENDING_LABEL_NAME] }),
						},
					},
				);
				if (!labelResponse.ok) {
					setPushNotification({
						title: `已提交审阅结果，但设置待更新标签失败：${labelResponse.status}`,
						level: "warning",
						source: "Review",
					});
				}
			}
			if (event === "APPROVE") {
				setApprovedByUser(true);
			}
			setPushNotification({
				title: "已提交审阅结果",
				level: "success",
				source: "Review",
			});
			submitAndClose();
		} catch {
			setPushNotification({
				title: "提交审阅结果失败：网络错误",
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
			const response = await githubFetch(
				`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${dialog.prNumber}/merge`,
				{
					init: {
						method: "PUT",
						headers: {
							Accept: "application/vnd.github+json",
							Authorization: `Bearer ${token}`,
							"Content-Type": "application/json",
						},
					},
				},
			);
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
			submitAndClose();
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
		<Dialog.Root open={dialog.open} onOpenChange={(open) => !open && closeDialog()}>
			<Dialog.Content style={{ maxWidth: "760px" }}>
				<Flex direction="column" gap="3">
					<Flex align="center" justify="between" gap="3">
						<Text size="3" weight="medium">
							{titleText}
						</Text>
					</Flex>
					<Flex direction="column" gap="2">
						<Text size="2" weight="medium">
							模板
						</Text>
						<Flex wrap="wrap" gap="2">
							{[...presetTemplates, ...customTemplates].map((template) => (
								<Button
									key={template.id}
									size="1"
									variant="soft"
									onClick={() => insertTemplate(template.content)}
								>
									<Flex align="center" gap="2">
										<LightbulbCheckmark20Regular />
										<Text size="1">{template.title}</Text>
									</Flex>
								</Button>
							))}
							{templateLoading && (
								<Text size="1" color="gray">
									正在加载模板...
								</Text>
							)}
						</Flex>
						{showTemplateEditor ? (
							<Flex direction="column" gap="2">
								<TextField.Root
									value={templateTitle}
									onChange={(event) =>
										setTemplateTitle(event.currentTarget.value)
									}
									placeholder="模板标题"
								/>
								<TextArea
									value={templateContent}
									onChange={(event) =>
										setTemplateContent(event.currentTarget.value)
									}
									placeholder="模板内容"
									style={{ minHeight: "120px" }}
								/>
								<Flex justify="end" gap="2">
									<Button
										size="2"
										variant="soft"
										color="gray"
										onClick={() => {
											setTemplateTitle("");
											setTemplateContent("");
											setShowTemplateEditor(false);
										}}
										disabled={templateSaving}
									>
										取消
									</Button>
									<Button
										size="2"
										variant="soft"
										onClick={handleSaveTemplate}
										disabled={templateSaving}
									>
										保存模板
									</Button>
								</Flex>
							</Flex>
						) : (
							<Flex justify="end">
								<Button
									size="1"
									variant="soft"
									onClick={() => setShowTemplateEditor(true)}
								>
									新增自定义模板
								</Button>
							</Flex>
						)}
					</Flex>
					<Box>
						<TextArea
							value={dialog.report}
							onChange={(event) =>
								setDialog((prev) => ({
									...prev,
									report: event.currentTarget.value,
								}))
							}
							style={{ minHeight: "180px" }}
						/>
					</Box>
					<Flex align="center" justify="end" gap="2">
						<Button
							size="2"
							variant="soft"
							color="green"
							onClick={() => submitReview("APPROVE")}
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
							onClick={() => submitReview("REQUEST_CHANGES")}
							disabled={
								submitPending !== null ||
								getCleanReport().length === 0
							}
						>
							<Flex align="center" gap="2">
								<Dismiss20Regular />
								<Text size="2">需要修改</Text>
							</Flex>
						</Button>
						<Button
							size="2"
							variant="soft"
							color="gray"
							onClick={submitMerge}
							disabled={submitPending !== null}
						>
							<Flex align="center" gap="2">
								<Merge20Regular	/>
								<Text size="2">合并</Text>
							</Flex>
						</Button>
					</Flex>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};

export default ReviewReportDialog;
