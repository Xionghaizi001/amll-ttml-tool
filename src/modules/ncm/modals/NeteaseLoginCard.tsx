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
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NeteaseAuthClient } from "$/modules/ncm/services";
import {
	githubAmlldbAccessAtom,
	neteaseCookieAtom,
	neteaseRiskConfirmedAtom,
	neteaseUserAtom,
} from "$/modules/settings/states";
import { riskConfirmDialogAtom } from "$/states/dialogs";	
import { pushNotificationAtom } from "$/states/notifications";

export const NeteaseLoginCard = () => {
	const { t } = useTranslation();
	const [neteaseCookie, setNeteaseCookie] = useAtom(neteaseCookieAtom);
	const [neteaseUser, setNeteaseUser] = useAtom(neteaseUserAtom);
	const [riskConfirmed, setRiskConfirmed] = useAtom(neteaseRiskConfirmedAtom);
	const [neteasePhone, setNeteasePhone] = useState("");
	const [neteaseCaptcha, setNeteaseCaptcha] = useState("");
	const [neteaseCookieInput, setNeteaseCookieInput] = useState("");
	const [neteaseCountdown, setNeteaseCountdown] = useState(0);
	const [neteaseLoading, setNeteaseLoading] = useState(false);
	const [neteaseTab, setNeteaseTab] = useState("phone");
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const setRiskConfirmDialog = useSetAtom(riskConfirmDialogAtom);
	const hasGithubAccess = useAtomValue(githubAmlldbAccessAtom);

	const trimmedNeteaseCookie = useMemo(
		() => neteaseCookie.trim(),
		[neteaseCookie],
	);
	const showLoginForm = !neteaseUser;

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
		NeteaseAuthClient.checkCookieStatus(trimmedNeteaseCookie)
			.then((profile) => {
				setNeteaseUser(profile);
				setPushNotification({
					title: t("settings.connect.netease.recovered", "网易云登录已恢复"),
					level: "success",
					source: "ncm",
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
					source: "ncm",
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

	useEffect(() => {
		if (!neteaseUser) {
			if (riskConfirmed) {
				setRiskConfirmed(false);
			}
		}
	}, [neteaseUser, riskConfirmed, setRiskConfirmed]);

	const runWithRiskConfirm = useCallback(
		(action: () => Promise<void>) => {
			if (hasGithubAccess || riskConfirmed) {
				void action();
				return;
			}
			setRiskConfirmDialog({
				open: true,
				onConfirmed: () => {
					setRiskConfirmed(true);
					void action();
				},
			});
		},
		[hasGithubAccess, riskConfirmed, setRiskConfirmDialog, setRiskConfirmed],
	);

	const handleSendCaptcha = useCallback(() => {
		runWithRiskConfirm(async () => {
			if (!neteasePhone.trim()) {
				setPushNotification({
					title: t("settings.connect.netease.phoneMissing", "请输入手机号"),
					level: "warning",
					source: "ncm",
				});
				return;
			}
			setNeteaseLoading(true);
			try {
				await NeteaseAuthClient.sendCaptcha(neteasePhone.trim());
				setPushNotification({
					title: t("settings.connect.netease.captchaSent", "验证码已发送"),
					level: "success",
					source: "ncm",
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
					source: "ncm",
				});
			} finally {
				setNeteaseLoading(false);
			}
		});
	}, [neteasePhone, runWithRiskConfirm, setPushNotification, t]);

	const handlePhoneLogin = useCallback(() => {
		runWithRiskConfirm(async () => {
			const phone = neteasePhone.trim();
			const captcha = neteaseCaptcha.trim();
			if (!phone || !captcha) {
				setPushNotification({
					title: t(
						"settings.connect.netease.phoneIncomplete",
						"请填写手机号与验证码",
					),
					level: "warning",
					source: "ncm",
				});
				return;
			}
			setNeteaseLoading(true);
			try {
				const result = await NeteaseAuthClient.loginByPhone(phone, captcha);
				setNeteaseCookie(result.cookie);
				setNeteaseUser(result.profile);
				setNeteasePhone("");
				setNeteaseCaptcha("");
				setNeteaseCookieInput("");
				setPushNotification({
					title: t(
						"settings.connect.netease.loginSuccess",
						"欢迎回来，{name}",
						{ name: result.profile.nickname },
					),
					level: "success",
					source: "ncm",
				});
			} catch (error) {
				setPushNotification({
					title: t(
						"settings.connect.netease.loginFailed",
						"登录失败：{message}",
						{
							message: error instanceof Error ? error.message : "未知错误",
						},
					),
					level: "error",
					source: "ncm",
				});
			} finally {
				setNeteaseLoading(false);
			}
		});
	}, [
		neteaseCaptcha,
		neteasePhone,
		runWithRiskConfirm,
		setNeteaseCookie,
		setNeteaseUser,
		setPushNotification,
		t,
	]);

	const handleCookieLogin = useCallback(() => {
		runWithRiskConfirm(async () => {
			const cookie = neteaseCookieInput.trim();
			if (!cookie) {
				setPushNotification({
					title: t("settings.connect.netease.cookieMissing", "请输入 Cookie"),
					level: "warning",
					source: "ncm",
				});
				return;
			}
			setNeteaseLoading(true);
			try {
				const profile = await NeteaseAuthClient.checkCookieStatus(cookie);
				setNeteaseCookie(cookie);
				setNeteaseUser(profile);
				setNeteaseCookieInput("");
				setNeteasePhone("");
				setNeteaseCaptcha("");
				setPushNotification({
					title: t(
						"settings.connect.netease.cookieSuccess",
						"欢迎回来，{name}",
						{ name: profile.nickname },
					),
					level: "success",
					source: "ncm",
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
					source: "ncm",
				});
			} finally {
				setNeteaseLoading(false);
			}
		});
	}, [
		neteaseCookieInput,
		runWithRiskConfirm,
		setNeteaseCookie,
		setNeteaseUser,
		setPushNotification,
		t,
	]);

	const handleNeteaseLogout = useCallback(() => {
		setNeteaseCookie("");
		setNeteaseUser(null);
		setNeteasePhone("");
		setNeteaseCaptcha("");
		setNeteaseCookieInput("");
		setPushNotification({
			title: t("settings.connect.netease.logout", "已退出网易云登录"),
			level: "info",
			source: "ncm",
		});
	}, [
		setNeteaseCookie,
		setNeteaseUser,
		setPushNotification,
		t,
	]);

	return (
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

				{showLoginForm && (
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
												neteaseCountdown > 0 ||
												neteaseLoading ||
												!neteasePhone
											}
											style={{ minWidth: "104px" }}
										>
											{neteaseCountdown > 0
												? `${neteaseCountdown}s`
												: t("settings.connect.netease.sendCaptcha", "发送")}
										</Button>
									</Flex>
									<Button onClick={handlePhoneLogin} disabled={neteaseLoading}>
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
				)}
			</Flex>
		</Card>
	);
};
