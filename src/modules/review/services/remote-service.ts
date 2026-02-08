import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { useFileOpener } from "$/hooks/useFileOpener";
import {
	githubAmlldbAccessAtom,
	githubLoginAtom,
	githubPatAtom,
	lyricsSiteTokenAtom,
	lyricsSiteUserAtom,
	lyricsSiteLoginPendingAtom,
	type LyricsSiteUser,
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

// ========== 歌词站登录 ==========

const LYRICS_SITE_URL = "https://amlldb.bikonoo.com";

export type { LyricsSiteUser };
export { lyricsSiteTokenAtom, lyricsSiteUserAtom, lyricsSiteLoginPendingAtom };

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

	// 刷新用户信息
	const refreshUserInfo = useCallback(async (): Promise<LyricsSiteUser | null> => {
		if (!token) return null;
		
		try {
			const response = await fetch(`${LYRICS_SITE_URL}/api/user/profile`, {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				throw new Error(`获取用户信息失败: ${response.status}`);
			}

			const userData: LyricsSiteUser = await response.json();
			setUser(userData);
			return userData;
		} catch (error) {
			console.error('[LyricsSiteAuth] 刷新用户信息失败:', error);
			return null;
		}
	}, [token, setUser]);

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

	// 页面加载时刷新用户信息（如果只有 token 没有 user）
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
