import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
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
