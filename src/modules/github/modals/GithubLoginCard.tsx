import {
	Box,
	Button,
	Card,
	Dialog,
	Flex,
	Heading,
	ScrollArea,
	Text,
	TextField,
} from "@radix-ui/themes";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { verifyGithubAccess } from "$/modules/github/services/identity-service";
import {
	githubAmlldbAccessAtom,
	githubLoginAtom,
	githubPatAtom,
	reviewHiddenLabelsAtom,
	reviewLabelsAtom,
} from "$/modules/settings/states";
import { pushNotificationAtom } from "$/states/notifications";
import patGuide from "../utils/pat-guide.md?raw";

const REPO_OWNER = "amll-dev";
const REPO_NAME = "amll-ttml-db";

type AuthStatus = "idle" | "checking" | "authorized" | "unauthorized" | "error";

export const GithubLoginCard = () => {
	const { t } = useTranslation();
	const [pat, setPat] = useAtom(githubPatAtom);
	const [login, setLogin] = useAtom(githubLoginAtom);
	const [hasAccess, setHasAccess] = useAtom(githubAmlldbAccessAtom);
	const [hiddenLabels, setHiddenLabels] = useAtom(reviewHiddenLabelsAtom);
	const [labels, setLabels] = useAtom(reviewLabelsAtom);
	const [status, setStatus] = useState<AuthStatus>("idle");
	const [message, setMessage] = useState("");
	const [hasPrivilegedAccess, setHasPrivilegedAccess] = useState(false);
	const [useNormalIdentity, setUseNormalIdentity] = useState(false);
	const [patHelpOpen, setPatHelpOpen] = useState(false);
	const lastNotifiedMessage = useRef("");
	const shouldNotifyAuth = useRef(false);
	const setPushNotification = useSetAtom(pushNotificationAtom);

	const trimmedPat = pat.trim();

	useEffect(() => {
		if (!trimmedPat) {
			setStatus("idle");
			setMessage("");
			setHasPrivilegedAccess(false);
			setUseNormalIdentity(false);
			setLogin("");
			setHasAccess(false);
			setLabels([]);
		}
	}, [trimmedPat, setLogin, setHasAccess, setLabels]);

	const verifyAccess = useCallback(async () => {
		if (!trimmedPat) {
			setStatus("error");
			setMessage(t("settings.connect.emptyPat", "请输入 GitHub PAT"));
			setHasPrivilegedAccess(false);
			setUseNormalIdentity(false);
			setLogin("");
			setHasAccess(false);
			return;
		}

		shouldNotifyAuth.current = true;
		setStatus("checking");
		setMessage("");

		const result = await verifyGithubAccess(trimmedPat, REPO_OWNER, REPO_NAME);
		if (result.status === "authorized") {
			setHasPrivilegedAccess(true);
			setLogin(result.login);
			if (useNormalIdentity) {
				setHasAccess(false);
				setStatus("unauthorized");
				setMessage(
					t("settings.connect.normalIdentity", "已切换为普通用户"),
				);
				setLabels([]);
			} else {
				setHasAccess(true);
				setStatus("authorized");
				setMessage(
					t("settings.connect.authorized", "已验证：{login}", {
						login: result.login,
					}),
				);
				setLabels(result.labels);
				const labelSet = new Set(
					result.labels.map((label) => label.name.trim().toLowerCase()),
				);
				setHiddenLabels((prev) =>
					prev.filter((label) => labelSet.has(label.trim().toLowerCase())),
				);
			}
			return;
		}

		if (result.status === "unauthorized") {
			setHasPrivilegedAccess(false);
			setUseNormalIdentity(false);
			setLogin(result.login);
			setHasAccess(false);
			setStatus("unauthorized");
			setLabels([]);
			setMessage(
				t(
					"settings.connect.unauthorized",
					"该账号不是仓库协作者或所有者",
				),
			);
			return;
		}

		setLogin("");
		setHasAccess(false);
		setHasPrivilegedAccess(false);
		setUseNormalIdentity(false);
		setLabels([]);
		if (result.status === "invalid-token") {
			setStatus("error");
			setMessage(
				t("settings.connect.invalidPat", "PAT 无效或已过期，请检查后重试"),
			);
			return;
		}
		if (result.status === "user-error") {
			setStatus("error");
			setMessage(
				t("settings.connect.userError", "GitHub 接口返回错误：{code}", {
					code: result.code,
				}),
			);
			return;
		}
		if (result.status === "user-missing") {
			setStatus("error");
			setMessage(t("settings.connect.userMissing", "无法获取用户信息"));
			return;
		}
		if (result.status === "permission-denied") {
			setStatus("error");
			setMessage(
				t(
					"settings.connect.permissionDenied",
					"PAT 权限不足，无法检查协作者关系",
				),
			);
			return;
		}
		setStatus("error");
		setMessage(t("settings.connect.networkError", "网络请求失败"));
	}, [
		trimmedPat,
		useNormalIdentity,
		setHasAccess,
		setHiddenLabels,
		setLabels,
		setLogin,
		t,
	]);

	useEffect(() => {
		if (!trimmedPat) return;
		if (status === "checking") return;
		if (useNormalIdentity) return;
		const trimmedLogin = login.trim();
		if (trimmedLogin && hasAccess) {
			setStatus("authorized");
			setMessage(
				t("settings.connect.authorized", "已验证：{login}", {
					login: trimmedLogin,
				}),
			);
			return;
		}
		if (trimmedLogin && !hasAccess) {
			setStatus("unauthorized");
			setMessage(
				t("settings.connect.unauthorized", "该账号不是仓库协作者或所有者"),
			);
			return;
		}
		if (status === "idle") {
			setMessage("");
		}
	}, [trimmedPat, login, hasAccess, status, t, useNormalIdentity]);

	const hiddenLabelSet = useMemo(
		() =>
			new Set(
				hiddenLabels
					.map((label) => label.trim().toLowerCase())
					.filter((label) => label.length > 0),
			),
		[hiddenLabels],
	);

	const visibleLabels = useMemo(
		() =>
			labels.filter((label) => !hiddenLabelSet.has(label.name.toLowerCase())),
		[hiddenLabelSet, labels],
	);

	const hiddenLabelList = useMemo(
		() =>
			labels.filter((label) => hiddenLabelSet.has(label.name.toLowerCase())),
		[hiddenLabelSet, labels],
	);

	const hideLabel = useCallback(
		(name: string) => {
			setHiddenLabels((prev) => {
				if (prev.some((item) => item.toLowerCase() === name.toLowerCase()))
					return prev;
				return [...prev, name];
			});
		},
		[setHiddenLabels],
	);

	const showLabel = useCallback(
		(name: string) => {
			setHiddenLabels((prev) =>
				prev.filter((item) => item.toLowerCase() !== name.toLowerCase()),
			);
		},
		[setHiddenLabels],
	);

	const toggleIdentity = useCallback(() => {
		if (useNormalIdentity) {
			setUseNormalIdentity(false);
			void verifyAccess();
			return;
		}
		setUseNormalIdentity(true);
		setHasAccess(false);
		setStatus("unauthorized");
		setMessage(t("settings.connect.normalIdentity", "已切换为普通用户"));
		setLabels([]);
	}, [setHasAccess, setLabels, t, useNormalIdentity, verifyAccess]);

	useEffect(() => {
		if (!message || status === "checking") return;
		if (!shouldNotifyAuth.current) return;
		if (lastNotifiedMessage.current === message) return;
		lastNotifiedMessage.current = message;
		shouldNotifyAuth.current = false;
		const level =
			status === "authorized"
				? "success"
				: status === "unauthorized"
					? "warning"
					: status === "error"
						? "error"
						: "info";
		setPushNotification({
			title: message,
			level,
			source: "SettingsConnect",
		});
	}, [message, status, setPushNotification]);

	const statusMessage = useMemo(() => {
		if (!message) return null;
		const color =
			status === "authorized"
				? "green"
				: status === "unauthorized"
					? "orange"
					: status === "error"
						? "red"
						: "gray";
		return (
			<Text size="2" color={color}>
				{message}
			</Text>
		);
	}, [message, status]);

	return (
		<Card>
			<Flex direction="column" gap="4">
				<Flex direction="column" gap="1">
					<Heading size="3">GitHub</Heading>
					<Text size="2" color="gray">
						{t(
							"settings.connect.github.desc",
							"用于登录 GitHub 并使用相关能力",
						)}
					</Text>
				</Flex>
				<Flex direction="column" gap="3">
					<Box>
						<Text as="label" size="2">
							{t("settings.connect.patLabel", "GitHub PAT")}
						</Text>
						<Flex align="center" gap="2">
							<TextField.Root
								type="password"
								placeholder={t(
									"settings.connect.patPlaceholder",
									"输入你的 GitHub Personal Access Token",
								)}
								value={pat}
								onChange={(e) => setPat(e.currentTarget.value)}
								autoComplete="off"
								style={{ flex: 1 }}
							/>
							<Dialog.Root open={patHelpOpen} onOpenChange={setPatHelpOpen}>
								<Button
									size="1"
									variant="soft"
									onClick={() => setPatHelpOpen(true)}
								>
									{t("settings.connect.patHelp", "申请 PAT")}
								</Button>
								<Dialog.Content style={{ maxWidth: "640px" }}>
									<Dialog.Title>
										{t("settings.connect.patGuideTitle", "GitHub PAT 申请指引")}
									</Dialog.Title>
									<Dialog.Description size="2" color="gray" mb="3">
										{t(
											"settings.connect.patGuideDesc",
											"按步骤创建访问令牌后粘贴到上方输入框即可。",
										)}
									</Dialog.Description>
									<ScrollArea
										type="auto"
										scrollbars="vertical"
										style={{ maxHeight: "360px" }}
									>
										<Box>
											<ReactMarkdown remarkPlugins={[remarkGfm]}>
												{patGuide}
											</ReactMarkdown>
										</Box>
									</ScrollArea>
									<Flex justify="end" mt="4">
										<Button
											variant="soft"
											color="gray"
											onClick={() => setPatHelpOpen(false)}
										>
											{t("common.close", "关闭")}
										</Button>
									</Flex>
								</Dialog.Content>
							</Dialog.Root>
						</Flex>
					</Box>

					<Flex gap="2" align="center" wrap="wrap">
						<Button
							onClick={verifyAccess}
							disabled={!trimmedPat || status === "checking"}
						>
							{status === "checking"
								? t("settings.connect.checking", "验证中...")
								: t("settings.connect.verify", "验证")}
						</Button>
						<Button
							variant="soft"
							onClick={() => setPat("")}
							disabled={!trimmedPat || status === "checking"}
						>
							{t("settings.connect.clear", "清除")}
						</Button>
						{login && (
							<Text size="2" color="gray">
								{t("settings.connect.currentUser", "当前账号：{login}", {
									login,
								})}
							</Text>
						)}
					</Flex>

					{statusMessage}
				</Flex>

				<Flex direction="column" gap="3">
					<Box asChild>
						<details open>
							<Text asChild size="2">
								<summary style={{ cursor: "pointer" }}>
									{t(
										"settings.connect.reviewHiddenLabelsTitle",
										"审阅隐藏标签",
									)}
								</summary>
							</Text>
							<Flex direction="column" gap="3" mt="2">
								<Text size="1" color="gray">
									{t(
										"settings.connect.reviewHiddenLabelsDesc",
										"点击标签可在未隐藏与已隐藏之间切换",
									)}
								</Text>
								<Flex gap="4" wrap="wrap">
									<Flex
										direction="column"
										gap="2"
										style={{ minWidth: "240px" }}
									>
										<Text size="1" color="gray">
											{t(
												"settings.connect.reviewHiddenLabelsVisible",
												"未隐藏",
											)}
										</Text>
										<Flex gap="2" wrap="wrap">
											{visibleLabels.length === 0 ? (
												<Text size="1" color="gray">
													{t(
														"settings.connect.reviewHiddenLabelsEmpty",
														"暂无标签",
													)}
												</Text>
											) : (
												visibleLabels.map((label) => (
													<Button
														key={`visible-${label.name}`}
														size="1"
														variant="soft"
														color="gray"
														onClick={() => hideLabel(label.name)}
													>
														<Flex align="center" gap="2">
															<Box
																style={{
																	width: "8px",
																	height: "8px",
																	borderRadius: "999px",
																	backgroundColor: `#${label.color}`,
																}}
															/>
															<Text size="1" weight="medium">
																{label.name}
															</Text>
														</Flex>
													</Button>
												))
											)}
										</Flex>
									</Flex>
									<Flex
										direction="column"
										gap="2"
										style={{ minWidth: "240px" }}
									>
										<Text size="1" color="gray">
											{t(
												"settings.connect.reviewHiddenLabelsHidden",
												"已隐藏",
											)}
										</Text>
										<Flex gap="2" wrap="wrap">
											{hiddenLabelList.length === 0 ? (
												<Text size="1" color="gray">
													{t(
														"settings.connect.reviewHiddenLabelsNone",
														"暂无隐藏标签",
													)}
												</Text>
											) : (
												hiddenLabelList.map((label) => (
													<Button
														key={`hidden-${label.name}`}
														size="1"
														variant="soft"
														color="red"
														onClick={() => showLabel(label.name)}
													>
														<Flex align="center" gap="2">
															<Box
																style={{
																	width: "8px",
																	height: "8px",
																	borderRadius: "999px",
																	backgroundColor: `#${label.color}`,
																}}
															/>
															<Text size="1" weight="medium">
																{label.name}
															</Text>
														</Flex>
													</Button>
												))
											)}
										</Flex>
									</Flex>
								</Flex>
							</Flex>
						</details>
					</Box>
					{(hasPrivilegedAccess || useNormalIdentity) && (
						<Button variant="soft" onClick={toggleIdentity}>
							{useNormalIdentity
								? t("settings.connect.restoreIdentity", "恢复特权身份")
								: t("settings.connect.switchIdentity", "切换为普通用户")}
						</Button>
					)}
					<Button asChild variant="soft">
						<a
							href={
								login
									? `https://gist.github.com/${login}`
									: "https://gist.github.com/"
							}
							target="_blank"
							rel="noreferrer"
						>
							{t("settings.connect.viewGist", "查看 Gist")}
						</a>
					</Button>
				</Flex>

				{hasAccess && (
					<Box>
						<Text size="2">
							{t(
								"settings.connect.reviewEnabled",
								"已启用审阅入口，可在标题栏打开",
							)}
						</Text>
					</Box>
				)}
			</Flex>
		</Card>
	);
};
