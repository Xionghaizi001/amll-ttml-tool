import { useAtomValue, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useCallback, useEffect, useRef } from "react";
import { useFileOpener } from "$/hooks/useFileOpener";
import {
	githubAmlldbAccessAtom,
	githubLoginAtom,
	githubPatAtom,
} from "$/modules/settings/states";
import { pushNotificationAtom } from "$/states/notifications";
import { ToolMode, reviewSessionAtom, toolModeAtom } from "$/states/main";

const getSafeUrl = (input: string, requireTtml: boolean) => {
	if (!input || /\s/.test(input)) return null;
	try {
		const url = new URL(input);
		if (!["http:", "https:"].includes(url.protocol)) return null;
		if (url.username || url.password) return null;
		if (requireTtml) {
			const path = url.pathname.toLowerCase();
			if (!path.endsWith(".ttml")) return null;
		}
		return url;
	} catch {
		return null;
	}
};

// ========== 歌词站登录功能 ==========

const LYRICS_SITE_URL = "https://amlldb.bikonoo.com";

export interface LyricsSiteUser {
	username: string;
	displayName: string;
	avatarUrl: string;
	reviewPermission: 0 | 1;
}

export const lyricsSiteTokenAtom = atomWithStorage<string>("lyricsSiteToken", "");
export const lyricsSiteUserAtom = atomWithStorage<LyricsSiteUser | null>("lyricsSiteUser", null);
export const lyricsSiteLoginPendingAtom = atomWithStorage<boolean>("lyricsSiteLoginPending", false);

// PKCE 工具函数
const generateCodeVerifier = (): string => {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return base64URLEncode(array);
};

const base64URLEncode = (buffer: Uint8Array): string => {
	return btoa(String.fromCharCode(...buffer))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
};

const sha256 = async (plain: string): Promise<ArrayBuffer> => {
	const encoder = new TextEncoder();
	const data = encoder.encode(plain);
	return crypto.subtle.digest("SHA-256", data);
};

const generateCodeChallenge = async (verifier: string): Promise<string> => {
	const hashed = await sha256(verifier);
	return base64URLEncode(new Uint8Array(hashed));
};

export const useLyricsSiteAuth = () => {
	const token = useAtomValue(lyricsSiteTokenAtom);
	const user = useAtomValue(lyricsSiteUserAtom);
	const setToken = useSetAtom(lyricsSiteTokenAtom);
	const setUser = useSetAtom(lyricsSiteUserAtom);
	const setLoginPending = useSetAtom(lyricsSiteLoginPendingAtom);
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const popupRef = useRef<Window | null>(null);

	// 生成并存储 PKCE 参数
	const initiateLogin = useCallback(async () => {
		const codeVerifier = generateCodeVerifier();
		const codeChallenge = await generateCodeChallenge(codeVerifier);
		const state = generateCodeVerifier();

		// 存储到 sessionStorage
		sessionStorage.setItem("lyrics_site_code_verifier", codeVerifier);
		sessionStorage.setItem("lyrics_site_state", state);
		setLoginPending(true);

		// 构建授权 URL
		const params = new URLSearchParams({
			client_id: "amll-ttml-tool",
			redirect_uri: `${window.location.origin}/callback`,
			code_challenge: codeChallenge,
			code_challenge_method: "S256",
			state: state,
			response_type: "code",
		});

		const authUrl = `${LYRICS_SITE_URL}/oauth/authorize?${params.toString()}`;

		// 直接跳转到授权页面
		window.location.href = authUrl;
	}, [setLoginPending]);

	// 获取用户信息
	const fetchUserInfo = useCallback(
		async (accessToken: string): Promise<LyricsSiteUser | null> => {
			try {
				const response = await fetch(`${LYRICS_SITE_URL}/api/user/profile`, {
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
				});

				if (!response.ok) {
					throw new Error("获取用户信息失败");
				}

				const userData: LyricsSiteUser = await response.json();
				setUser(userData);
				return userData;
			} catch (error) {
				setPushNotification({
					title: "获取用户信息失败",
					level: "error",
					source: "lyrics-site-auth",
				});
				return null;
			}
		},
		[setUser, setPushNotification],
	);

	// 处理回调
	const handleCallback = useCallback(
		async (code: string, state: string): Promise<boolean> => {
			const storedState = sessionStorage.getItem("lyrics_site_state");
			const codeVerifier = sessionStorage.getItem("lyrics_site_code_verifier");

			if (!storedState || !codeVerifier) {
				setPushNotification({
					title: "授权状态已过期，请重新登录",
					level: "error",
					source: "lyrics-site-auth",
				});
				setLoginPending(false);
				return false;
			}

			if (state !== storedState) {
				setPushNotification({
					title: "授权状态验证失败，请重新登录",
					level: "error",
					source: "lyrics-site-auth",
				});
				setLoginPending(false);
				return false;
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
					const error = await response.text();
					throw new Error(error);
				}

				const data = await response.json();
				setToken(data.access_token);

				// 获取用户信息
				await fetchUserInfo(data.access_token);

				// 清理 sessionStorage
				sessionStorage.removeItem("lyrics_site_code_verifier");
				sessionStorage.removeItem("lyrics_site_state");
				setLoginPending(false);

				setPushNotification({
					title: "歌词站登录成功",
					level: "success",
					source: "lyrics-site-auth",
				});

				return true;
			} catch (error) {
				setPushNotification({
					title: `登录失败: ${error instanceof Error ? error.message : "未知错误"}`,
					level: "error",
					source: "lyrics-site-auth",
				});
				setLoginPending(false);
				return false;
			}
		},
		[setToken, setLoginPending, setPushNotification, fetchUserInfo],
	);

	// 刷新用户信息
	const refreshUserInfo = useCallback(async (): Promise<LyricsSiteUser | null> => {
		if (!token) return null;
		return fetchUserInfo(token);
	}, [token, fetchUserInfo]);

	// 登出
	const logout = useCallback(() => {
		setToken("");
		setUser(null);
		setPushNotification({
			title: "已登出歌词站",
			level: "info",
			source: "lyrics-site-auth",
		});
	}, [setToken, setUser, setPushNotification]);

	// 检查是否已登录
	const isLoggedIn = !!token && !!user;

	// 检查是否有审阅权限
	const hasReviewPermission = user?.reviewPermission === 1;

	// 监听消息（处理授权窗口回调）
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			// 验证来源
			if (!event.origin.includes("bikonoo.com")) return;

			if (event.data?.type === "lyrics-site-auth-callback") {
				const { code, state } = event.data;
				if (code && state) {
					handleCallback(code, state);
				}
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [handleCallback]);

	// 页面加载时检查 URL 参数（处理直接回调）
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const code = params.get("code");
		const state = params.get("state");
		const type = params.get("type");

		if (type === "lyrics-site-callback" && code && state) {
			handleCallback(code, state);
			// 清理 URL
			window.history.replaceState({}, document.title, window.location.pathname);
		}
	}, [handleCallback]);

	// 页面加载时刷新用户信息
	useEffect(() => {
		if (token && !user) {
			refreshUserInfo();
		}
	}, [token, user, refreshUserInfo]);

	return {
		user,
		token,
		isLoggedIn,
		hasReviewPermission,
		initiateLogin,
		logout,
		refreshUserInfo,
	};
};

// ========== 远程审阅服务 ==========

export const useRemoteReviewService = () => {
	const pat = useAtomValue(githubPatAtom);
	const login = useAtomValue(githubLoginAtom);
	const hasAccess = useAtomValue(githubAmlldbAccessAtom);
	const setReviewSession = useSetAtom(reviewSessionAtom);
	const setToolMode = useSetAtom(toolModeAtom);
	const { openFile } = useFileOpener();
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const returnUrlRef = useRef<string | null>(null);

	const openRemoteReview = useCallback(
		async (fileUrl: string) => {
			const tokenOk = Boolean(pat.trim()) && Boolean(login.trim()) && hasAccess;
			if (!tokenOk) {
				setPushNotification({
					title: "请先在设置中登录并获取审阅权限",
					level: "error",
					source: "remote-review",
				});
				return false;
			}
			const url = getSafeUrl(fileUrl, true);
			if (!url) {
				setPushNotification({
					title: "远程文件地址非法",
					level: "error",
					source: "remote-review",
				});
				return false;
			}
			try {
				const response = await fetch(url.toString(), { method: "GET" });
				if (!response.ok) {
					throw new Error("fetch-failed");
				}
				const blob = await response.blob();
				const filename = url.pathname.split("/").pop() || "remote.ttml";
				const file = new File([blob], filename, { type: "text/plain" });
				setReviewSession({
					prNumber: 0,
					prTitle: filename,
					fileName: filename,
					source: "review",
				});
				openFile(file, "ttml");
				setToolMode(ToolMode.Edit);
				return true;
			} catch {
				setPushNotification({
					title: "拉取远程文件失败",
					level: "error",
					source: "remote-review",
				});
				return false;
			}
		},
		[hasAccess, login, openFile, pat, setPushNotification, setReviewSession, setToolMode],
	);

	const initFromUrl = useCallback(async () => {
		const params = new URLSearchParams(window.location.search);
		const type = params.get("type")?.toLowerCase();
		if (type !== "review") return;
		const fileParam = params.get("file") ?? "";
		const returnParam = params.get("return") ?? "";
		if (returnParam) {
			const retUrl = getSafeUrl(returnParam, false);
			if (retUrl) {
				returnUrlRef.current = retUrl.toString();
			}
		}
		if (fileParam) {
			await openRemoteReview(fileParam);
		}
	}, [openRemoteReview]);

	const triggerCallback = useCallback(
		async (data?: Record<string, unknown>) => {
			const ret = returnUrlRef.current;
			if (!ret) return false;
			const url = getSafeUrl(ret, false);
			if (!url) return false;
			try {
				const res = await fetch(url.toString(), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(data ?? { status: "opened" }),
				});
				return res.ok;
			} catch {
				return false;
			}
		},
		[],
	);

	return { initFromUrl, openRemoteReview, triggerCallback };
};
