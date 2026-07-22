import {
	Badge,
	Button,
	Flex,
	Heading,
	Text,
	TextArea,
	TextField,
} from "@radix-ui/themes";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFileOpener } from "$/hooks/useFileOpener";
import { fetchGithubUserProfile } from "$/modules/github/services/identity-service";
import {
	githubLoginAtom,
	githubPatAtom,
	neteaseCookieAtom,
} from "$/modules/settings/states";
import { openReviewUpdateFromNotification } from "$/modules/user/services/update-service";
import {
	fileUpdateSessionAtom,
	reviewSessionAtom,
	ToolMode,
	toolModeAtom,
} from "$/states/main";
import { pushNotificationAtom } from "$/states/notifications";
import styles from "./ProjectTestsSettings.module.css";

type IdentityStatus = "idle" | "checking" | "verified" | "error";

const describeIdentityError = (
	status: Exclude<
		Awaited<ReturnType<typeof fetchGithubUserProfile>>["status"],
		"ok"
	>,
) => {
	switch (status) {
		case "missing-token":
			return "请先在“连接”中填写 GitHub PAT";
		case "invalid-token":
			return "GitHub PAT 无效或已过期";
		case "user-error":
			return "GitHub 用户接口返回错误";
		case "user-missing":
			return "GitHub 返回的数据中没有用户身份";
		case "network-error":
			return "无法连接 GitHub，请检查网络后重试";
	}
};

export const ProjectTestsSettings = () => {
	const pat = useAtomValue(githubPatAtom);
	const neteaseCookie = useAtomValue(neteaseCookieAtom);
	const [login, setLogin] = useAtom(githubLoginAtom);
	const setReviewSession = useSetAtom(reviewSessionAtom);
	const setFileUpdateSession = useSetAtom(fileUpdateSessionAtom);
	const setToolMode = useSetAtom(toolModeAtom);
	const pushNotification = useSetAtom(pushNotificationAtom);
	const { openFile } = useFileOpener();

	const [identityStatus, setIdentityStatus] = useState<IdentityStatus>("idle");
	const [identityMessage, setIdentityMessage] = useState(
		"正在确认当前 GitHub 登录身份",
	);
	const [reviewContent, setReviewContent] = useState("");
	const [reviewFilename, setReviewFilename] = useState("review.ttml");
	const [reviewPrNumber, setReviewPrNumber] = useState("0");
	const [reviewPrTitle, setReviewPrTitle] = useState("");
	const [updatePrNumber, setUpdatePrNumber] = useState("");
	const [updatePrTitle, setUpdatePrTitle] = useState("");
	const [runningAction, setRunningAction] = useState<
		"review-file" | "review-update" | null
	>(null);
	const pendingIdRef = useRef<string | null>(null);
	const [, setLastNeteaseIdByPr] = useState<Record<number, string>>({});

	const verifyIdentity = useCallback(async () => {
		setIdentityStatus("checking");
		setIdentityMessage("正在通过 GitHub 校验 PAT 对应的用户...");
		const result = await fetchGithubUserProfile(pat);
		if (result.status !== "ok") {
			const message = describeIdentityError(result.status);
			setIdentityStatus("error");
			setIdentityMessage(message);
			return null;
		}

		const verifiedLogin = result.profile.login.trim();
		setLogin(verifiedLogin);
		setIdentityStatus("verified");
		setIdentityMessage(`已验证为 ${verifiedLogin}`);
		return { token: pat.trim(), login: verifiedLogin };
	}, [pat, setLogin]);

	useEffect(() => {
		void verifyIdentity();
	}, [verifyIdentity]);

	const notifyIdentityFailure = useCallback(() => {
		pushNotification({
			title: "GitHub 身份验证失败，开发工具操作已取消",
			level: "warning",
			source: "ProjectTests",
		});
	}, [pushNotification]);

	const handleInjectReviewFile = useCallback(async () => {
		if (!reviewContent.trim()) return;
		setRunningAction("review-file");
		try {
			const identity = await verifyIdentity();
			if (!identity) {
				notifyIdentityFailure();
				return;
			}
			const filename = reviewFilename.trim() || "review.ttml";
			const prNumber = Number.parseInt(reviewPrNumber, 10) || 0;
			const file = new File([reviewContent], filename, {
				type: "application/ttml+xml",
			});
			setReviewSession({
				prNumber,
				prTitle: reviewPrTitle.trim() || filename,
				fileName: filename,
				source: "review",
			});
			openFile(file);
			setToolMode(ToolMode.Edit);
			pushNotification({
				title: `已由 ${identity.login} 注入审阅文件 ${filename}`,
				level: "success",
				source: "ProjectTests",
			});
		} finally {
			setRunningAction(null);
		}
	}, [
		notifyIdentityFailure,
		openFile,
		pushNotification,
		reviewContent,
		reviewFilename,
		reviewPrNumber,
		reviewPrTitle,
		setReviewSession,
		setToolMode,
		verifyIdentity,
	]);

	const handleOpenReviewUpdate = useCallback(async () => {
		const prNumber = Number.parseInt(updatePrNumber, 10);
		if (!Number.isFinite(prNumber) || prNumber <= 0) return;
		setRunningAction("review-update");
		try {
			const identity = await verifyIdentity();
			if (!identity) {
				notifyIdentityFailure();
				return;
			}
			await openReviewUpdateFromNotification({
				token: identity.token,
				prNumber,
				prTitle: updatePrTitle.trim() || `PR#${prNumber}`,
				openFile,
				setFileUpdateSession,
				setToolMode,
				pushNotification,
				neteaseCookie,
				pendingId: pendingIdRef.current,
				setPendingId: (value) => {
					pendingIdRef.current = value;
				},
				setLastNeteaseIdByPr,
			});
			pushNotification({
				title: `已由 ${identity.login} 打开 PR #${prNumber} 更新测试`,
				level: "success",
				source: "ProjectTests",
			});
		} catch (error) {
			pushNotification({
				title: `打开 PR 更新失败：${error instanceof Error ? error.message : "未知错误"}`,
				level: "error",
				source: "ProjectTests",
			});
		} finally {
			setRunningAction(null);
		}
	}, [
		neteaseCookie,
		notifyIdentityFailure,
		openFile,
		pushNotification,
		setFileUpdateSession,
		setToolMode,
		updatePrNumber,
		updatePrTitle,
		verifyIdentity,
	]);

	const verified = identityStatus === "verified";
	const identityColor = verified
		? "green"
		: identityStatus === "error"
			? "red"
			: "gray";

	return (
		<div className={styles.root}>
			<div className={styles.identityCard}>
				<div className={styles.identityInfo}>
					<Flex align="center" gap="2" wrap="wrap">
						<Heading size="4">GitHub 身份</Heading>
						<Badge color={identityColor}>
							{verified
								? login
								: identityStatus === "checking"
									? "验证中"
									: "未验证"}
						</Badge>
					</Flex>
					<Text size="2" color={verified ? "green" : "gray"}>
						{identityMessage}
					</Text>
				</div>
				<Button
					variant="soft"
					onClick={() => void verifyIdentity()}
					disabled={identityStatus === "checking"}
				>
					重新验证
				</Button>
			</div>

			<div className={styles.toolGrid}>
				<section className={`${styles.toolCard} ${styles.fullWidth}`}>
					<div className={styles.toolContent}>
						<Heading size="4">注入审阅文件</Heading>
						<Text size="2" color="gray">
							直接创建审阅会话并打开指定的 TTML 内容。
						</Text>
						<Flex gap="3" wrap="wrap">
							<TextField.Root
								aria-label="审阅文件名"
								placeholder="文件名"
								value={reviewFilename}
								onChange={(event) =>
									setReviewFilename(event.currentTarget.value)
								}
								style={{ flex: "2 1 220px" }}
							/>
							<TextField.Root
								aria-label="审阅 PR 编号"
								placeholder="PR 编号（可选）"
								type="number"
								min="0"
								value={reviewPrNumber}
								onChange={(event) =>
									setReviewPrNumber(event.currentTarget.value)
								}
								style={{ flex: "1 1 160px" }}
							/>
							<TextField.Root
								aria-label="审阅 PR 标题"
								placeholder="PR 标题（可选）"
								value={reviewPrTitle}
								onChange={(event) =>
									setReviewPrTitle(event.currentTarget.value)
								}
								style={{ flex: "2 1 260px" }}
							/>
						</Flex>
						<TextArea
							aria-label="TTML 内容"
							className={styles.codeInput}
							placeholder="粘贴要注入的 TTML 内容"
							value={reviewContent}
							onChange={(event) => setReviewContent(event.currentTarget.value)}
						/>
						<div className={styles.actions}>
							<Button
								onClick={() => void handleInjectReviewFile()}
								disabled={!reviewContent.trim() || runningAction !== null}
							>
								{runningAction === "review-file" ? "处理中..." : "注入并打开"}
							</Button>
						</div>
					</div>
				</section>

				<section className={`${styles.toolCard} ${styles.fullWidth}`}>
					<div className={styles.toolContent}>
						<Heading size="4">打开 PR 更新测试</Heading>
						<Text size="2" color="gray">
							使用已验证的 GitHub 身份加载 PR 文件并创建更新会话。
						</Text>
						<Flex gap="3" wrap="wrap">
							<TextField.Root
								aria-label="更新 PR 编号"
								placeholder="PR 编号"
								type="number"
								min="1"
								value={updatePrNumber}
								onChange={(event) =>
									setUpdatePrNumber(event.currentTarget.value)
								}
								style={{ flex: "1 1 180px" }}
							/>
							<TextField.Root
								aria-label="更新 PR 标题"
								placeholder="PR 标题（可选）"
								value={updatePrTitle}
								onChange={(event) =>
									setUpdatePrTitle(event.currentTarget.value)
								}
								style={{ flex: "3 1 300px" }}
							/>
						</Flex>
						<div className={styles.actions}>
							<Button
								onClick={() => void handleOpenReviewUpdate()}
								disabled={
									!Number.isFinite(Number(updatePrNumber)) ||
									Number(updatePrNumber) <= 0 ||
									runningAction !== null
								}
							>
								{runningAction === "review-update"
									? "加载中..."
									: "加载 PR 更新"}
							</Button>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
};
