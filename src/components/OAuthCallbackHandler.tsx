import { Box, Flex, Spinner, Text, Button } from "@radix-ui/themes";
import { useSetAtom } from "jotai";
import { useEffect, useState, useRef } from "react";
import { lyricsSiteTokenAtom, lyricsSiteUserAtom } from "$/modules/settings/states";

const LYRICS_SITE_URL = "https://amlldb.bikonoo.com";

export const OAuthCallbackHandler = () => {
	const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
	const [errorMessage, setErrorMessage] = useState("");
	const setToken = useSetAtom(lyricsSiteTokenAtom);
	const setUser = useSetAtom(lyricsSiteUserAtom);
	const isProcessing = useRef(false);

	useEffect(() => {
		// 检查是否是歌词站回调
		const params = new URLSearchParams(window.location.search);
		const type = params.get("type");
		const code = params.get("code");
		const state = params.get("state");
		const error = params.get("error");

		if (type !== "lyrics-site-callback" && !code && !error) {
			return;
		}

		// 防止重复处理
		if (isProcessing.current) return;
		isProcessing.current = true;

		const processCallback = async () => {
			setStatus("processing");

			if (error) {
				setStatus("error");
				setErrorMessage("用户拒绝了授权");
				return;
			}

			if (!code || !state) {
				setStatus("error");
				setErrorMessage("缺少必要的授权参数");
				return;
			}

			const storedState = sessionStorage.getItem("lyrics_site_state");
			const codeVerifier = sessionStorage.getItem("lyrics_site_code_verifier");

			if (!storedState || !codeVerifier) {
				setStatus("error");
				setErrorMessage("授权状态已过期，请重新登录");
				return;
			}

			if (state !== storedState) {
				setStatus("error");
				setErrorMessage("授权状态验证失败");
				return;
			}

			try {
				// 换取 token
				const response = await fetch(`${LYRICS_SITE_URL}/api/oauth/token`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						grant_type: "authorization_code",
						code,
						redirect_uri: `${window.location.origin}/callback`,
						client_id: "amll-ttml-tool",
						code_verifier: codeVerifier,
					}),
				});

				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(errorText);
				}

				const data = await response.json();
				const accessToken = data.access_token;

				// 存储 token
				setToken(accessToken);

				// 获取用户信息
				const userResponse = await fetch(`${LYRICS_SITE_URL}/api/user/profile`, {
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
				});

				if (!userResponse.ok) {
					throw new Error("获取用户信息失败");
				}

				const userData = await userResponse.json();
				console.log('[OAuthCallback] 获取到用户信息:', userData);
				setUser(userData);

				// 清理 sessionStorage
				sessionStorage.removeItem("lyrics_site_code_verifier");
				sessionStorage.removeItem("lyrics_site_state");

				// 清理 URL
				window.history.replaceState({}, document.title, window.location.pathname);

				setStatus("success");

				// 延迟恢复正常界面
				setTimeout(() => {
					setStatus("idle");
				}, 1500);
			} catch (err) {
				setStatus("error");
				setErrorMessage(err instanceof Error ? err.message : "登录失败");
			}
		};

		processCallback();
	}, [setToken, setUser]);

	// 关闭错误提示
	const handleClose = () => {
		setStatus("idle");
		// 清理 URL
		window.history.replaceState({}, document.title, window.location.pathname);
	};

	if (status === "idle") {
		return null;
	}

	return (
		<Box
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: "var(--gray-1)",
				zIndex: 9999,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Flex direction="column" align="center" gap="4">
				{status === "processing" && (
					<>
						<Spinner size="3" />
						<Text size="3" color="gray">
							正在完成登录...
						</Text>
					</>
				)}

				{status === "success" && (
					<>
						<Box
							style={{
								width: 48,
								height: 48,
								borderRadius: "50%",
								background: "var(--green-9)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: 24,
							}}
						>
							✓
						</Box>
						<Text size="3" weight="medium">
							登录成功
						</Text>
					</>
				)}

				{status === "error" && (
					<>
						<Box
							style={{
								width: 48,
								height: 48,
								borderRadius: "50%",
								background: "var(--red-9)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: 24,
							}}
						>
							✕
						</Box>
						<Text size="3" weight="medium" color="red">
							登录失败
						</Text>
						<Text size="2" color="gray">
							{errorMessage}
						</Text>
						<Button onClick={handleClose} variant="soft">
							关闭
						</Button>
					</>
				)}
			</Flex>
		</Box>
	);
};
