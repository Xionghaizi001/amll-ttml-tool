import {
	Avatar,
	Box,
	Button,
	Card,
	Flex,
	Heading,
	Tabs,
	Text,
	TextArea,
	TextField,
} from "@radix-ui/themes";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	githubAmlldbAccessAtom,
	githubLoginAtom,
	githubPatAtom,
	neteaseCookieAtom,
	neteaseUserAtom,
	reviewHiddenLabelsAtom,
	reviewLabelsAtom,
	type NeteaseProfile,
	type ReviewLabel,
} from "../states";
import { pushNotificationAtom } from "$/states/notifications";
const REPO_OWNER = "Steve-xmh";
const REPO_NAME = "amll-ttml-db";
const NETEASE_API_BASE =
	"https://netease-cloud-music-api-1035942257985.asia-east1.run.app";

type AuthStatus = "idle" | "checking" | "authorized" | "unauthorized" | "error";
type NeteaseResponse<T> = {
	code: number;
	message?: string;
	msg?: string;
	cookie?: string;
	data?: T;
	[key: string]: unknown;
};

const requestNetease = async <T,>(
	path: string,
	options: {
		params?: Record<string, string | number | boolean>;
		method?: "GET" | "POST";
		cookie?: string;
	} = {},
): Promise<T> => {
	const url = new URL(`${NETEASE_API_BASE}${path}`);

	const params: Record<string, string | boolean> = {
		timestamp: Date.now().toString(),
		randomCNIP: true,
		...options.params,
	};

	if (options.cookie) {
		params.cookie = options.cookie;
	}

	Object.keys(params).forEach((key) => {
		url.searchParams.append(key, String(params[key]));
	});

	const res = await fetch(url.toString(), {
		method: options.method || "GET",
		credentials: "include",
	});

	const data = (await res.json()) as NeteaseResponse<T>;
	const responseCode = data.code ?? (data.data as { code?: number } | undefined)?.code;

	if (responseCode !== undefined && responseCode !== 200) {
		throw new Error(data.msg || data.message || `API Error: ${responseCode}`);
	}

	return data as T;
};

const NeteaseClient = {
	auth: {
		sendCaptcha: async (phone: string, ctcode = "86") => {
			return requestNetease<NeteaseResponse<boolean>>("/captcha/sent", {
				params: { phone, ctcode },
			});
		},
		loginByPhone: async (phone: string, captcha: string, ctcode = "86") => {
			const res = await requestNetease<
				NeteaseResponse<Record<string, unknown>> & {
					profile: NeteaseProfile;
					cookie: string;
				}
			>("/login/cellphone", {
				params: { phone, captcha, ctcode },
			});

			return {
				cookie: res.cookie ?? "",
				profile: res.profile,
			};
		},
		checkCookieStatus: async (cookieString: string) => {
			const res = await requestNetease<{
				data: {
					profile: NeteaseProfile | null;
					account?: { vipType: number; id: number };
				};
			}>("/login/status", {
				cookie: cookieString,
				method: "POST",
			});

			const profile = res.data?.profile;
			const account = res.data?.account;

			if (profile) {
				if (account && typeof account.vipType === "number") {
					return {
						...profile,
						vipType: account.vipType,
					};
				}
				return profile;
			}
			throw new Error("Cookie 已失效或未登录");
		},
	},
};

export const SettingsConnectTab = () => {
	const { t } = useTranslation();
	const [pat, setPat] = useAtom(githubPatAtom);
	const [login, setLogin] = useAtom(githubLoginAtom);
	const [hasAccess, setHasAccess] = useAtom(githubAmlldbAccessAtom);
	const [neteaseCookie, setNeteaseCookie] = useAtom(neteaseCookieAtom);
	const [neteaseUser, setNeteaseUser] = useAtom(neteaseUserAtom);
	const [hiddenLabels, setHiddenLabels] = useAtom(reviewHiddenLabelsAtom);
	const [labels, setLabels] = useAtom(reviewLabelsAtom);
	const [status, setStatus] = useState<AuthStatus>("idle");
	const [message, setMessage] = useState("");
	const [neteasePhone, setNeteasePhone] = useState("");
	const [neteaseCaptcha, setNeteaseCaptcha] = useState("");
	const [neteaseCookieInput, setNeteaseCookieInput] = useState("");
	const [neteaseCountdown, setNeteaseCountdown] = useState(0);
	const [neteaseLoading, setNeteaseLoading] = useState(false);
	const [neteaseTab, setNeteaseTab] = useState("phone");
	const lastNotifiedMessage = useRef("");
	const setPushNotification = useSetAtom(pushNotificationAtom);

	const trimmedPat = pat.trim();
	const trimmedNeteaseCookie = neteaseCookie.trim();

	useEffect(() => {
		if (!trimmedPat) {
			setStatus("idle");
			setMessage("");
			setLogin("");
			setHasAccess(false);
			setLabels([]);
		}
	}, [trimmedPat, setLogin, setHasAccess, setLabels]);

	const fetchLabels = useCallback(
		async (token: string) => {
			const response = await fetch(
				`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/labels?per_page=100`,
				{
					headers: {
						Accept: "application/vnd.github+json",
						Authorization: `Bearer ${token}`,
					},
				},
			);
			if (!response.ok) {
				setLabels([]);
				return;
			}
			const data = (await response.json()) as ReviewLabel[];
			const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
			setLabels(sorted);
			const labelSet = new Set(
				sorted.map((label) => label.name.trim().toLowerCase()),
			);
			setHiddenLabels((prev) =>
				prev.filter((label) => labelSet.has(label.trim().toLowerCase())),
			);
		},
		[setHiddenLabels, setLabels],
	);

	const verifyAccess = useCallback(async () => {
		if (!trimmedPat) {
			setStatus("error");
			setMessage(t("settings.connect.emptyPat", "请输入 GitHub PAT"));
			setLogin("");
			setHasAccess(false);
			return;
		}

		setStatus("checking");
		setMessage("");

		try {
			const userResponse = await fetch("https://api.github.com/user", {
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${trimmedPat}`,
				},
			});

			if (!userResponse.ok) {
				setStatus("error");
				setLogin("");
				setHasAccess(false);
				if (userResponse.status === 401) {
					setMessage(
						t(
							"settings.connect.invalidPat",
							"PAT 无效或已过期，请检查后重试",
						),
					);
				} else {
					setMessage(
						t("settings.connect.userError", "GitHub 接口返回错误：{code}", {
							code: userResponse.status,
						}),
					);
				}
				return;
			}

			const userData = (await userResponse.json()) as { login?: string };
			const userLogin = userData.login ?? "";
			setLogin(userLogin);

			if (!userLogin) {
				setStatus("error");
				setHasAccess(false);
				setLabels([]);
				setMessage(t("settings.connect.userMissing", "无法获取用户信息"));
				return;
			}

			const isOwner =
				userLogin.toLowerCase() === REPO_OWNER.toLowerCase();

			const collaboratorResponse = await fetch(
				`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/collaborators/${userLogin}`,
				{
					headers: {
						Accept: "application/vnd.github+json",
						Authorization: `Bearer ${trimmedPat}`,
					},
				},
			);

			if (collaboratorResponse.status === 403) {
				setStatus("error");
				setHasAccess(false);
				setLabels([]);
				setMessage(
					t(
						"settings.connect.permissionDenied",
						"PAT 权限不足，无法检查协作者关系",
					),
				);
				return;
			}

			const isCollaborator = collaboratorResponse.status === 204;
			const allowed = isOwner || isCollaborator;

			setHasAccess(allowed);

			if (allowed) {
				setStatus("authorized");
				setMessage(
					t("settings.connect.authorized", "已验证：{login}", {
						login: userLogin,
					}),
				);
				await fetchLabels(trimmedPat);
			} else {
				setStatus("unauthorized");
				setLabels([]);
				setMessage(
					t(
						"settings.connect.unauthorized",
						"该账号不是仓库协作者或所有者",
					),
				);
			}
		} catch (_error) {
			setStatus("error");
			setHasAccess(false);
			setLabels([]);
			setMessage(t("settings.connect.networkError", "网络请求失败"));
		}
	}, [
		fetchLabels,
		trimmedPat,
		setHasAccess,
		setLabels,
		setLogin,
		t,
	]);

	useEffect(() => {
		if (!trimmedPat) return;
		if (status === "checking") return;
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
	}, [trimmedPat, login, hasAccess, status, t]);

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

	useEffect(() => {
		if (!message || status === "checking") return;
		if (lastNotifiedMessage.current === message) return;
		lastNotifiedMessage.current = message;
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

	useEffect(() => {
		if (neteaseCountdown <= 0) return;
		const timer = window.setTimeout(() => {
			setNeteaseCountdown((prev) => Math.max(0, prev - 1));
		}, 1000);
		return () => window.clearTimeout(timer);
	}, [neteaseCountdown]);

	useEffect(() => {
		if (!trimmedNeteaseCookie) {
			setNeteaseUser(null);
			return;
		}
		if (neteaseUser || neteaseLoading) return;
		setNeteaseLoading(true);
		NeteaseClient.auth
			.checkCookieStatus(trimmedNeteaseCookie)
			.then((profile) => {
				setNeteaseUser(profile);
				setPushNotification({
					title: t("settings.connect.netease.recovered", "网易云登录已恢复"),
					level: "success",
					source: "SettingsConnect",
				});
			})
			.catch((error) => {
				setNeteaseUser(null);
				setPushNotification({
					title: t(
						"settings.connect.netease.cookieInvalid",
						"网易云登录已失效：{message}",
						{
							message: error instanceof Error ? error.message : "未知错误",
						},
					),
					level: "warning",
					source: "SettingsConnect",
				});
			})
			.finally(() => {
				setNeteaseLoading(false);
			});
	}, [
		neteaseLoading,
		neteaseUser,
		setNeteaseUser,
		setPushNotification,
		t,
		trimmedNeteaseCookie,
	]);

	const handleSendCaptcha = useCallback(async () => {
		if (!neteasePhone.trim()) {
			setPushNotification({
				title: t("settings.connect.netease.phoneMissing", "请输入手机号"),
				level: "warning",
				source: "SettingsConnect",
			});
			return;
		}
		setNeteaseLoading(true);
		try {
			await NeteaseClient.auth.sendCaptcha(neteasePhone.trim());
			setPushNotification({
				title: t("settings.connect.netease.captchaSent", "验证码已发送"),
				level: "success",
				source: "SettingsConnect",
			});
			setNeteaseCountdown(60);
		} catch (error) {
			setPushNotification({
				title: t(
					"settings.connect.netease.captchaFailed",
					"验证码发送失败：{message}",
					{
						message: error instanceof Error ? error.message : "未知错误",
					},
				),
				level: "error",
				source: "SettingsConnect",
			});
		} finally {
			setNeteaseLoading(false);
		}
	}, [neteasePhone, setPushNotification, t]);

	const handlePhoneLogin = useCallback(async () => {
		const phone = neteasePhone.trim();
		const captcha = neteaseCaptcha.trim();
		if (!phone || !captcha) {
			setPushNotification({
				title: t(
					"settings.connect.netease.phoneIncomplete",
					"请填写手机号与验证码",
				),
				level: "warning",
				source: "SettingsConnect",
			});
			return;
		}
		setNeteaseLoading(true);
		try {
			const result = await NeteaseClient.auth.loginByPhone(phone, captcha);
			setNeteaseCookie(result.cookie);
			setNeteaseUser(result.profile);
			setNeteasePhone("");
			setNeteaseCaptcha("");
			setPushNotification({
				title: t(
					"settings.connect.netease.loginSuccess",
					"欢迎回来，{name}",
					{ name: result.profile.nickname },
				),
				level: "success",
				source: "SettingsConnect",
			});
		} catch (error) {
			setPushNotification({
				title: t("settings.connect.netease.loginFailed", "登录失败：{message}", {
					message: error instanceof Error ? error.message : "未知错误",
				}),
				level: "error",
				source: "SettingsConnect",
			});
		} finally {
			setNeteaseLoading(false);
		}
	}, [
		neteaseCaptcha,
		neteasePhone,
		setNeteaseCookie,
		setNeteaseUser,
		setPushNotification,
		t,
	]);

	const handleCookieLogin = useCallback(async () => {
		const cookie = neteaseCookieInput.trim();
		if (!cookie) {
			setPushNotification({
				title: t("settings.connect.netease.cookieMissing", "请输入 Cookie"),
				level: "warning",
				source: "SettingsConnect",
			});
			return;
		}
		setNeteaseLoading(true);
		try {
			const profile = await NeteaseClient.auth.checkCookieStatus(cookie);
			setNeteaseCookie(cookie);
			setNeteaseUser(profile);
			setNeteaseCookieInput("");
			setPushNotification({
				title: t(
					"settings.connect.netease.cookieSuccess",
					"欢迎回来，{name}",
					{ name: profile.nickname },
				),
				level: "success",
				source: "SettingsConnect",
			});
		} catch (error) {
			setPushNotification({
				title: t(
					"settings.connect.netease.cookieInvalidToast",
					"Cookie 无效：{message}",
					{
						message: error instanceof Error ? error.message : "未知错误",
					},
				),
				level: "error",
				source: "SettingsConnect",
			});
		} finally {
			setNeteaseLoading(false);
		}
	}, [neteaseCookieInput, setNeteaseCookie, setNeteaseUser, setPushNotification, t]);

	const handleNeteaseLogout = useCallback(() => {
		setNeteaseCookie("");
		setNeteaseUser(null);
		setNeteasePhone("");
		setNeteaseCaptcha("");
		setNeteaseCookieInput("");
		setPushNotification({
			title: t("settings.connect.netease.logout", "已退出网易云登录"),
			level: "info",
			source: "SettingsConnect",
		});
	}, [
		setNeteaseCookie,
		setNeteaseUser,
		setPushNotification,
		t,
	]);

	return (
		<Flex direction="column" gap="4">
			<Flex direction="column" gap="1">
				<Heading size="4">{t("settings.connect.title", "连接")}</Heading>
				<Text size="2" color="gray">
					{t(
						"settings.connect.desc",
						"用于验证 GitHub PAT 并开启歌词库审阅入口",
					)}
				</Text>
			</Flex>

			<Card>
				<Flex direction="column" gap="4">
					<Flex direction="column" gap="1">
						<Heading size="3">GitHub</Heading>
						<Text size="2" color="gray">
							{t(
								"settings.connect.github.desc",
								"用于验证 GitHub PAT 并开启歌词库审阅入口",
							)}
						</Text>
					</Flex>
					<Flex direction="column" gap="3">
						<Box>
							<Text as="label" size="2">
								{t("settings.connect.patLabel", "GitHub PAT")}
							</Text>
							<TextField.Root
								type="password"
								placeholder={t(
									"settings.connect.patPlaceholder",
									"输入你的 GitHub Personal Access Token",
								)}
								value={pat}
								onChange={(e) => setPat(e.currentTarget.value)}
								autoComplete="off"
							/>
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
						<Text size="2">
							{t(
								"settings.connect.reviewHiddenLabelsTitle",
								"审阅隐藏标签",
							)}
						</Text>
						<Text size="1" color="gray">
							{t(
								"settings.connect.reviewHiddenLabelsDesc",
								"点击标签可在未隐藏与已隐藏之间切换",
							)}
						</Text>
						<Flex gap="4" wrap="wrap">
							<Flex direction="column" gap="2" style={{ minWidth: "240px" }}>
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
							<Flex direction="column" gap="2" style={{ minWidth: "240px" }}>
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

			<Card>
				<Flex direction="column" gap="4">
					<Flex direction="column" gap="1">
						<Heading size="3">
							{t("settings.connect.netease.title", "网易云音乐")}
						</Heading>
						<Text size="2" color="gray">
							{t(
								"settings.connect.netease.desc",
								"登录后可使用网易云账号相关能力",
							)}
						</Text>
					</Flex>

					<Flex align="center" gap="3" wrap="wrap">
						{neteaseUser ? (
							<>
								<Avatar
									size="3"
									radius="full"
									src={neteaseUser.avatarUrl}
									fallback={neteaseUser.nickname.slice(0, 1)}
								/>
								<Flex direction="column" gap="1">
									<Text size="2" weight="medium">
										{neteaseUser.nickname}
									</Text>
									<Text size="1" color="gray">
										UID: {neteaseUser.userId}
									</Text>
								</Flex>
								<Button
									variant="soft"
									color="red"
									onClick={handleNeteaseLogout}
									disabled={neteaseLoading}
								>
									{t("settings.connect.netease.logoutAction", "退出登录")}
								</Button>
							</>
						) : (
							<Text size="2" color="gray">
								{t("settings.connect.netease.notLoggedIn", "未登录")}
							</Text>
						)}
					</Flex>

					<Tabs.Root value={neteaseTab} onValueChange={setNeteaseTab}>
						<Tabs.List>
							<Tabs.Trigger value="phone">
								{t("settings.connect.netease.phoneTab", "手机号验证码")}
							</Tabs.Trigger>
							<Tabs.Trigger value="cookie">
								{t("settings.connect.netease.cookieTab", "Cookie")}
							</Tabs.Trigger>
						</Tabs.List>
						<Box pt="3">
							<Tabs.Content value="phone">
								<Flex direction="column" gap="3">
									<TextField.Root
										placeholder={t(
											"settings.connect.netease.phonePlaceholder",
											"手机号码",
										)}
										value={neteasePhone}
										onChange={(event) =>
											setNeteasePhone(event.currentTarget.value)
										}
									/>
									<Flex gap="2" align="center">
										<TextField.Root
											placeholder={t(
												"settings.connect.netease.captchaPlaceholder",
												"验证码",
											)}
											value={neteaseCaptcha}
											onChange={(event) =>
												setNeteaseCaptcha(event.currentTarget.value)
											}
											style={{ flex: 1 }}
										/>
										<Button
											variant="soft"
											onClick={handleSendCaptcha}
											disabled={
												neteaseCountdown > 0 || neteaseLoading || !neteasePhone
											}
											style={{ minWidth: "104px" }}
										>
											{neteaseCountdown > 0
												? `${neteaseCountdown}s`
												: t("settings.connect.netease.sendCaptcha", "发送")}
										</Button>
									</Flex>
									<Button
										onClick={handlePhoneLogin}
										disabled={neteaseLoading}
									>
										{neteaseLoading
											? t("settings.connect.netease.loggingIn", "登录中...")
											: t("settings.connect.netease.login", "登录")}
									</Button>
								</Flex>
							</Tabs.Content>
							<Tabs.Content value="cookie">
								<Flex direction="column" gap="3">
									<Text size="1" color="gray">
										{t(
											"settings.connect.netease.cookieHint",
											"请输入包含 MUSIC_U 的 Cookie",
										)}
									</Text>
									<TextArea
										placeholder={t(
											"settings.connect.netease.cookiePlaceholder",
											"MUSIC_U=...;",
										)}
										value={neteaseCookieInput}
										onChange={(event) =>
											setNeteaseCookieInput(event.currentTarget.value)
										}
										rows={4}
									/>
									<Flex gap="2" align="center" wrap="wrap">
										<Button
											onClick={handleCookieLogin}
											disabled={neteaseLoading}
										>
											{neteaseLoading
												? t(
														"settings.connect.netease.verifying",
														"验证中...",
													)
												: t(
														"settings.connect.netease.verifyLogin",
														"验证并登录",
													)}
										</Button>
										<Button
											variant="soft"
											onClick={() => setNeteaseCookieInput("")}
											disabled={neteaseLoading || !neteaseCookieInput.trim()}
										>
											{t("settings.connect.netease.clearCookie", "清除")}
										</Button>
									</Flex>
								</Flex>
							</Tabs.Content>
						</Box>
					</Tabs.Root>
				</Flex>
			</Card>
		</Flex>
	);
};
