import { Box, Card, Flex, Spinner, Text } from "@radix-ui/themes";
import { openDB } from "idb";
import { useAtomValue, useSetAtom } from "jotai";
import {
	type MouseEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	githubAmlldbAccessAtom,
	githubPatAtom,
	neteaseCookieAtom,
	reviewHiddenLabelsAtom,
	reviewLabelsAtom,
	reviewPendingFilterAtom,
	reviewRefreshTokenAtom,
	reviewSelectedLabelsAtom,
	reviewUpdatedFilterAtom,
} from "$/modules/settings/states";
import { useFileOpener } from "$/hooks/useFileOpener";
import { pushNotificationAtom } from "$/states/notifications";
import { reviewSessionAtom, ToolMode, toolModeAtom } from "$/states/main";
import { log } from "$/utils/logging";
import { loadNeteaseAudioForReview } from "./netease-audio-service";
import {
	renderCardContent,
	renderExpandedContent,
	type ReviewLabel,
	type ReviewPullRequest,
} from "./review-card-service";
import styles from "./index.module.css";

const REPO_OWNER = "Steve-xmh";
const REPO_NAME = "amll-ttml-db";
const DB_NAME = "review-cache";
const STORE_NAME = "open-prs";
const RECORD_KEY = "open";
const PENDING_LABEL_NAME = "待更新";
const PENDING_LABEL_KEY = PENDING_LABEL_NAME.toLowerCase();
type CachedPayload = {
	key: string;
	etag: string | null;
	cachedAt: number;
	items: ReviewPullRequest[];
};

const dbPromise = openDB(DB_NAME, 1, {
	upgrade(db) {
		if (!db.objectStoreNames.contains(STORE_NAME)) {
			db.createObjectStore(STORE_NAME, { keyPath: "key" });
		}
	},
});

const readCache = async () => {
	try {
		const db = await dbPromise;
		const record = (await db.get(STORE_NAME, RECORD_KEY)) as
			| CachedPayload
			| undefined;
		log("review cache read", record);
		if (!record?.items) return null;
		return record;
	} catch {
		log("review cache read failed");
		return null;
	}
};

const writeCache = async (items: ReviewPullRequest[], etag: string | null) => {
	try {
		const db = await dbPromise;
		const payload: CachedPayload = {
			key: RECORD_KEY,
			etag,
			cachedAt: Date.now(),
			items,
		};
		await db.put(STORE_NAME, payload);
		log("review cache write", {
			etag,
			count: items.length,
		});
	} catch {
		log("review cache write failed");
		return;
	}
};


const ReviewPage = () => {
	const pat = useAtomValue(githubPatAtom);
	const hasAccess = useAtomValue(githubAmlldbAccessAtom);
	const hiddenLabels = useAtomValue(reviewHiddenLabelsAtom);
	const selectedLabels = useAtomValue(reviewSelectedLabelsAtom);
	const pendingChecked = useAtomValue(reviewPendingFilterAtom);
	const updatedChecked = useAtomValue(reviewUpdatedFilterAtom);
	const refreshToken = useAtomValue(reviewRefreshTokenAtom);
	const setReviewLabels = useSetAtom(reviewLabelsAtom);
	const setHiddenLabels = useSetAtom(reviewHiddenLabelsAtom);
	const setReviewRefreshToken = useSetAtom(reviewRefreshTokenAtom);
	const setReviewSession = useSetAtom(reviewSessionAtom);
	const reviewSession = useAtomValue(reviewSessionAtom);
	const setToolMode = useSetAtom(toolModeAtom);
	const { openFile } = useFileOpener();
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const neteaseCookie = useAtomValue(neteaseCookieAtom);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const closeTimerRef = useRef<number | null>(null);
	const [expandedCard, setExpandedCard] = useState<{
		pr: ReviewPullRequest;
		from: DOMRect;
		to: DOMRect;
		phase: "opening" | "open" | "closing";
	} | null>(null);
	const [audioLoadPendingId, setAudioLoadPendingId] = useState<string | null>(
		null,
	);
	const [lastNeteaseIdByPr, setLastNeteaseIdByPr] = useState<
		Record<number, string>
	>({});
	const [reviewActionPending, setReviewActionPending] = useState<{
		prNumber: number;
		action: "approve" | "requestChanges" | "merge";
	} | null>(null);
	const approveRefreshTimersRef = useRef<Map<number, number>>(new Map());
	const githubLoginRef = useRef<string>("");

	const hiddenLabelSet = useMemo(
		() =>
			new Set(
				hiddenLabels
					.map((label) => label.trim().toLowerCase())
					.filter((label) => label.length > 0),
			),
		[hiddenLabels],
	);

	const [items, setItems] = useState<ReviewPullRequest[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [postPendingCommitMap, setPostPendingCommitMap] = useState<
		Record<number, boolean>
	>({});
	const lastRefreshTokenRef = useRef(refreshToken);

	const hasPendingLabel = useCallback(
		(labels: ReviewLabel[]) =>
			labels.some(
				(label) => label.name.trim().toLowerCase() === PENDING_LABEL_KEY,
			),
		[],
	);

	const fetchPendingLabelTime = useCallback(
		async (token: string, prNumber: number) => {
			if (!token) return null;
			const response = await fetch(
				`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${prNumber}/events?per_page=100`,
				{
					headers: {
						Accept: "application/vnd.github+json",
						Authorization: `Bearer ${token}`,
					},
				},
			);
			if (!response.ok) {
				return null;
			}
			const events = (await response.json()) as Array<{
				event?: string;
				created_at?: string;
				label?: { name?: string };
			}>;
			const latest = events.reduce<string | null>((acc, event) => {
				if (event.event !== "labeled") return acc;
				if (event.label?.name?.trim() !== PENDING_LABEL_NAME) return acc;
				if (!event.created_at) return acc;
				if (!acc) return event.created_at;
				return new Date(event.created_at).getTime() >= new Date(acc).getTime()
					? event.created_at
					: acc;
			}, null);
			if (!latest) return null;
			return new Date(latest).getTime();
		},
		[],
	);

	const fetchHeadCommitTime = useCallback(
		async (token: string, prNumber: number) => {
			if (!token) return null;
			const pullResponse = await fetch(
				`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`,
				{
					headers: {
						Accept: "application/vnd.github+json",
						Authorization: `Bearer ${token}`,
					},
				},
			);
			if (!pullResponse.ok) {
				return null;
			}
			const pull = (await pullResponse.json()) as {
				head?: { sha?: string };
			};
			const sha = pull.head?.sha;
			if (!sha) return null;
			const commitResponse = await fetch(
				`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${sha}`,
				{
					headers: {
						Accept: "application/vnd.github+json",
						Authorization: `Bearer ${token}`,
					},
				},
			);
			if (!commitResponse.ok) {
				return null;
			}
			const commit = (await commitResponse.json()) as {
				commit?: {
					author?: { date?: string };
					committer?: { date?: string };
				};
			};
			const commitDate =
				commit.commit?.committer?.date ?? commit.commit?.author?.date;
			if (!commitDate) return null;
			return new Date(commitDate).getTime();
		},
		[],
	);

	const hasPostLabelCommits = useCallback(
		async (token: string, prNumber: number) => {
			const labelTime = await fetchPendingLabelTime(token, prNumber);
			if (!labelTime) return false;
			const commitTime = await fetchHeadCommitTime(token, prNumber);
			if (!commitTime) return false;
			return commitTime > labelTime;
		},
		[fetchHeadCommitTime, fetchPendingLabelTime],
	);

	const fetchLabels = useCallback(
		async (token: string) => {
			if (!token) return;
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
				setReviewLabels([]);
				return;
			}
			const data = (await response.json()) as ReviewLabel[];
			const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
			setReviewLabels(sorted);
			const labelSet = new Set(
				sorted.map((label) => label.name.trim().toLowerCase()),
			);
			setHiddenLabels((prev) =>
				prev.filter((label) => labelSet.has(label.trim().toLowerCase())),
			);
		},
		[setHiddenLabels, setReviewLabels],
	);

	const refreshPendingLabels = useCallback(
		async (token: string, sourceItems: ReviewPullRequest[]) => {
			if (!token) return sourceItems;
			const pendingItems = sourceItems
				.map((item, index) => ({ item, index }))
				.filter(({ item }) => hasPendingLabel(item.labels));
			if (pendingItems.length === 0) return sourceItems;
			const headers: Record<string, string> = {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${token}`,
			};
			const updated = [...sourceItems];
			for (const pending of pendingItems) {
				const response = await fetch(
					`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${pending.item.number}/labels?per_page=100`,
					{ headers },
				);
				if (!response.ok) {
					continue;
				}
				const labels = (await response.json()) as Array<{
					name: string;
					color: string;
				}>;
				updated[pending.index] = {
					...pending.item,
					labels: labels.map((label) => ({
						name: label.name,
						color: label.color,
					})),
				};
			}
			return updated;
		},
		[hasPendingLabel],
	);

	useEffect(() => {
		if (!updatedChecked) return;
		const token = pat.trim();
		if (!token) return;
		let cancelled = false;
		const pendingItems = items.filter((item) => hasPendingLabel(item.labels));
		const unknownItems = pendingItems.filter(
			(item) => postPendingCommitMap[item.number] === undefined,
		);
		if (unknownItems.length === 0) return;
		const run = async () => {
			for (const item of unknownItems) {
				const updated = await hasPostLabelCommits(token, item.number);
				if (cancelled) return;
				setPostPendingCommitMap((prev) => {
					if (prev[item.number] === updated) return prev;
					return { ...prev, [item.number]: updated };
				});
			}
		};
		void run();
		return () => {
			cancelled = true;
		};
	}, [
		hasPendingLabel,
		hasPostLabelCommits,
		items,
		pat,
		postPendingCommitMap,
		updatedChecked,
	]);

	const resolveGithubLogin = useCallback(
		async (token: string) => {
			const cached = githubLoginRef.current.trim();
			if (cached) return cached;
			const response = await fetch("https://api.github.com/user", {
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${token}`,
				},
			});
			if (!response.ok) {
				return "";
			}
			const data = (await response.json()) as { login?: string };
			const login = data.login?.trim() ?? "";
			if (login) {
				githubLoginRef.current = login;
			}
			return login;
		},
		[],
	);

	const fetchPullRequestDetail = useCallback(
		async (token: string, prNumber: number) => {
			const response = await fetch(
				`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`,
				{
					headers: {
						Accept: "application/vnd.github+json",
						Authorization: `Bearer ${token}`,
					},
				},
			);
			if (!response.ok) {
				return null;
			}
			const detail = (await response.json()) as {
				number: number;
				title: string;
				body?: string | null;
				created_at: string;
				labels?: Array<{ name: string; color: string }>;
			};
			return {
				number: detail.number,
				title: detail.title ?? "",
				body: detail.body ?? "",
				createdAt: detail.created_at,
				labels:
					detail.labels?.map((label) => ({
						name: label.name,
						color: label.color,
					})) ?? [],
			} satisfies ReviewPullRequest;
		},
		[],
	);

	const refreshSinglePr = useCallback(
		async (prNumber: number) => {
			const token = pat.trim();
			if (!token) return;
			const detail = await fetchPullRequestDetail(token, prNumber);
			if (!detail) return;
			const cached = await readCache();
			const cachedEtag = cached?.etag ?? null;
			setItems((prev) => {
				const updated = prev.some((item) => item.number === prNumber)
					? prev.map((item) => (item.number === prNumber ? detail : item))
					: [...prev, detail];
				void writeCache(updated, cachedEtag);
				return updated;
			});
		},
		[fetchPullRequestDetail, pat],
	);

	const scheduleApproveRefresh = useCallback(
		(prNumber: number) => {
			const existing = approveRefreshTimersRef.current.get(prNumber);
			if (existing) {
				window.clearTimeout(existing);
			}
			const timer = window.setTimeout(() => {
				approveRefreshTimersRef.current.delete(prNumber);
				void refreshSinglePr(prNumber);
			}, 15000);
			approveRefreshTimersRef.current.set(prNumber, timer);
		},
		[refreshSinglePr],
	);

	const clearApproveRefresh = useCallback((prNumber: number) => {
		const timer = approveRefreshTimersRef.current.get(prNumber);
		if (timer) {
			window.clearTimeout(timer);
			approveRefreshTimersRef.current.delete(prNumber);
		}
	}, []);

	const openReviewFile = useCallback(
		async (pr: ReviewPullRequest) => {
			const token = pat.trim();
			if (!token) {
				setPushNotification({
					title: "请先在设置中登录以打开文件",
					level: "error",
					source: "review",
				});
				return;
			}
			try {
				const headers: Record<string, string> = {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${token}`,
				};
				const fileResponse = await fetch(
					`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${pr.number}/files?per_page=100`,
					{ headers },
				);
				if (!fileResponse.ok) {
					throw new Error("load-pr-files-failed");
				}
				const files = (await fileResponse.json()) as Array<{
					filename: string;
					raw_url?: string | null;
				}>;
				const supported = [
					"ttml",
					"lrc",
					"eslrc",
					"qrc",
					"yrc",
					"lys",
				];
				const priority = new Map(
					supported.map((ext, index) => [ext, index]),
				);
				const pick = files
					.map((file) => {
						const ext =
							file.filename.split(".").pop()?.toLowerCase() ?? "";
						return { ...file, ext };
					})
					.filter((file) => priority.has(file.ext))
					.sort(
						(a, b) =>
							(priority.get(a.ext) ?? 999) -
							(priority.get(b.ext) ?? 999),
					)[0];
				if (!pick?.raw_url) {
					setPushNotification({
						title: "未找到可打开的歌词文件",
						level: "warning",
						source: "review",
					});
					return;
				}
				const rawResponse = await fetch(pick.raw_url, { headers });
				if (!rawResponse.ok) {
					throw new Error("load-raw-file-failed");
				}
				const blob = await rawResponse.blob();
				const fileName = pick.filename.split("/").pop() ?? pick.filename;
				const file = new File([blob], fileName);
				setReviewSession({
					prNumber: pr.number,
					prTitle: pr.title,
					fileName,
				});
				openFile(file);
				setToolMode(ToolMode.Edit);
			} catch {
				setPushNotification({
					title: "打开 PR 文件失败",
					level: "error",
					source: "review",
				});
			}
		},
		[openFile, pat, setPushNotification, setReviewSession, setToolMode],
	);

	const submitReview = useCallback(
		async (
			token: string,
			prNumber: number,
			event: "APPROVE" | "REQUEST_CHANGES",
		) => {
			const response = await fetch(
				`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}/reviews`,
				{
					method: "POST",
					headers: {
						Accept: "application/vnd.github+json",
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						event,
						body:
							event === "REQUEST_CHANGES"
								? "请根据审阅意见修改后重新提交。"
								: undefined,
					}),
				},
			);
			if (!response.ok) {
				throw new Error(`review failed: ${response.status}`);
			}
		},
		[],
	);

	const addPendingLabel = useCallback(async (token: string, prNumber: number) => {
			const response = await fetch(
				`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${prNumber}/labels`,
				{
					method: "POST",
					headers: {
						Accept: "application/vnd.github+json",
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						labels: [PENDING_LABEL_NAME],
					}),
				},
			);
			if (!response.ok) {
				throw new Error(`label failed: ${response.status}`);
			}
		}, []);

	const hasApprovedAfterLatestCommit = useCallback(
		async (token: string, prNumber: number) => {
			const login = await resolveGithubLogin(token);
			if (!login) {
				throw new Error("无法获取 GitHub 用户信息");
			}
			const pullResponse = await fetch(
				`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`,
				{
					headers: {
						Accept: "application/vnd.github+json",
						Authorization: `Bearer ${token}`,
					},
				},
			);
			if (!pullResponse.ok) {
				throw new Error(`pull failed: ${pullResponse.status}`);
			}
			const pull = (await pullResponse.json()) as { head?: { sha?: string } };
			const headSha = pull.head?.sha;
			if (!headSha) {
				throw new Error("找不到最新提交");
			}
			const commitResponse = await fetch(
				`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${headSha}`,
				{
					headers: {
						Accept: "application/vnd.github+json",
						Authorization: `Bearer ${token}`,
					},
				},
			);
			if (!commitResponse.ok) {
				throw new Error(`commit failed: ${commitResponse.status}`);
			}
			const commit = (await commitResponse.json()) as {
				commit?: {
					committer?: { date?: string };
					author?: { date?: string };
				};
			};
			const commitTimeText =
				commit.commit?.committer?.date ?? commit.commit?.author?.date ?? "";
			const commitTime = commitTimeText
				? new Date(commitTimeText).getTime()
				: 0;
			const reviewResponse = await fetch(
				`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}/reviews?per_page=100`,
				{
					headers: {
						Accept: "application/vnd.github+json",
						Authorization: `Bearer ${token}`,
					},
				},
			);
			if (!reviewResponse.ok) {
				throw new Error(`reviews failed: ${reviewResponse.status}`);
			}
			const reviews = (await reviewResponse.json()) as Array<{
				user?: { login?: string };
				state?: string;
				submitted_at?: string;
			}>;
			const normalizedLogin = login.toLowerCase();
			const latestApproved = reviews.reduce<{
				time: number;
				state?: string;
			} | null>((acc, item) => {
				if (item.user?.login?.toLowerCase() !== normalizedLogin) {
					return acc;
				}
				if (item.state !== "APPROVED") {
					return acc;
				}
				const time = item.submitted_at
					? new Date(item.submitted_at).getTime()
					: 0;
				if (!acc || time >= acc.time) {
					return { time, state: item.state };
				}
				return acc;
			}, null);
			if (!latestApproved) return false;
			return latestApproved.time >= commitTime;
		},
		[resolveGithubLogin],
	);

	const handleApprove = useCallback(
		async (prNumber: number) => {
			if (reviewActionPending) return;
			const token = pat.trim();
			if (!token) {
				setPushNotification({
					title: "请先在设置中登录以提交审阅",
					level: "error",
					source: "review",
				});
				return;
			}
			setReviewActionPending({ prNumber, action: "approve" });
			try {
				await submitReview(token, prNumber, "APPROVE");
				scheduleApproveRefresh(prNumber);
				setPushNotification({
					title: `已接受 PR #${prNumber}`,
					level: "success",
					source: "review",
				});
			} catch (error) {
				setPushNotification({
					title: `接受失败：${
						error instanceof Error ? error.message : "未知错误"
					}`,
					level: "error",
					source: "review",
				});
			} finally {
				setReviewActionPending(null);
			}
		},
		[
			pat,
			reviewActionPending,
			scheduleApproveRefresh,
			setPushNotification,
			submitReview,
		],
	);

	const handleRequestChanges = useCallback(
		async (prNumber: number) => {
			if (reviewActionPending) return;
			const token = pat.trim();
			if (!token) {
				setPushNotification({
					title: "请先在设置中登录以提交审阅",
					level: "error",
					source: "review",
				});
				return;
			}
			setReviewActionPending({ prNumber, action: "requestChanges" });
			try {
				await submitReview(token, prNumber, "REQUEST_CHANGES");
				await addPendingLabel(token, prNumber);
				clearApproveRefresh(prNumber);
				await refreshSinglePr(prNumber);
				setPushNotification({
					title: `已要求修改 PR #${prNumber}`,
					level: "success",
					source: "review",
				});
			} catch (error) {
				setPushNotification({
					title: `要求修改失败：${
						error instanceof Error ? error.message : "未知错误"
					}`,
					level: "error",
					source: "review",
				});
			} finally {
				setReviewActionPending(null);
			}
		},
		[
			addPendingLabel,
			clearApproveRefresh,
			pat,
			refreshSinglePr,
			reviewActionPending,
			setPushNotification,
			submitReview,
		],
	);

	const handleMerge = useCallback(
		async (prNumber: number) => {
			if (reviewActionPending) return;
			const token = pat.trim();
			if (!token) {
				setPushNotification({
					title: "请先在设置中登录以合并 PR",
					level: "error",
					source: "review",
				});
				return;
			}
			setReviewActionPending({ prNumber, action: "merge" });
			try {
				const approved = await hasApprovedAfterLatestCommit(token, prNumber);
				if (!approved) {
					await submitReview(token, prNumber, "APPROVE");
				}
				const mergeResponse = await fetch(
					`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}/merge`,
					{
						method: "PUT",
						headers: {
							Accept: "application/vnd.github+json",
							Authorization: `Bearer ${token}`,
						},
					},
				);
				if (!mergeResponse.ok) {
					throw new Error(`merge failed: ${mergeResponse.status}`);
				}
				clearApproveRefresh(prNumber);
				setReviewRefreshToken(Date.now());
				setPushNotification({
					title: `已合并 PR #${prNumber}`,
					level: "success",
					source: "review",
				});
			} catch (error) {
				setPushNotification({
					title: `合并失败：${
						error instanceof Error ? error.message : "未知错误"
					}`,
					level: "error",
					source: "review",
				});
			} finally {
				setReviewActionPending(null);
			}
		},
		[
			clearApproveRefresh,
			hasApprovedAfterLatestCommit,
			pat,
			reviewActionPending,
			setPushNotification,
			setReviewRefreshToken,
			submitReview,
		],
	);

	const handleLoadNeteaseAudio = useCallback(
		async (prNumber: number, id: string) => {
			await loadNeteaseAudioForReview({
				prNumber,
				id,
				pendingId: audioLoadPendingId,
				setPendingId: setAudioLoadPendingId,
				setLastNeteaseIdByPr,
				openFile,
				pushNotification: setPushNotification,
				cookie: neteaseCookie,
			});
		},
		[audioLoadPendingId, neteaseCookie, openFile, setPushNotification],
	);

	useEffect(() => {
		let cancelled = false;
		const loadCached = async () => {
			const cached = await readCache();
			if (!cancelled && cached?.items?.length) {
				setItems(cached.items);
			}
		};
		loadCached();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		const token = pat.trim();
		if (!hasAccess || !token) {
			setItems([]);
			setError(null);
			setLoading(false);
			return;
		}

		const refreshChanged = refreshToken !== lastRefreshTokenRef.current;
		lastRefreshTokenRef.current = refreshToken;
		let cancelled = false;

		const load = async () => {
			setLoading(true);
			setError(null);
			try {
				await fetchLabels(token);
				const cached = refreshChanged ? null : await readCache();
				const headers: Record<string, string> = {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${token}`,
				};
				const maxPages = 10;
				let etag: string | null = null;
				const list: Array<{ number: number }> = [];
				for (let page = 1; page <= maxPages; page += 1) {
					const pageHeaders = { ...headers };
					if (page === 1 && cached?.etag) {
						pageHeaders["If-None-Match"] = cached.etag;
					}
					const listResponse = await fetch(
						`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open&per_page=100&page=${page}`,
						{ headers: pageHeaders },
					);
					log("review list response", listResponse.status);
					if (page === 1 && listResponse.status === 304 && cached?.items?.length) {
						const refreshed = await refreshPendingLabels(token, cached.items);
						if (!cancelled) {
							setItems(refreshed);
						}
						await writeCache(refreshed, cached.etag ?? null);
						log("review list not modified, use cache");
						return;
					}
					if (!listResponse.ok) {
						if (page === 1) {
							throw new Error(`List failed: ${listResponse.status}`);
						}
						break;
					}
					if (page === 1) {
						etag = listResponse.headers.get("etag");
						log("review list etag", etag);
					}
					const pageList = (await listResponse.json()) as Array<{
						number: number;
					}>;
					if (pageList.length === 0) {
						break;
					}
					list.push(...pageList);
					if (pageList.length < 100) {
						break;
					}
				}
				const result: ReviewPullRequest[] = [];
				for (const pr of list) {
					const detailResponse = await fetch(
						`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${pr.number}`,
						{ headers },
					);
					if (!detailResponse.ok) {
						continue;
					}
					const detail = (await detailResponse.json()) as {
						number: number;
						title: string;
						body?: string | null;
						created_at: string;
						labels?: Array<{ name: string; color: string }>;
					};
					result.push({
						number: detail.number,
						title: detail.title ?? "",
						body: detail.body ?? "",
						createdAt: detail.created_at,
						labels:
							detail.labels?.map((label) => ({
								name: label.name,
								color: label.color,
							})) ?? [],
					});
				}
				const refreshed = await refreshPendingLabels(token, result);
				if (cancelled) return;
				setItems(refreshed);
				await writeCache(refreshed, etag);
		} catch {
				if (!cancelled) {
					setError("加载审阅 PR 失败");
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		};

		load();

		return () => {
			cancelled = true;
		};
	}, [hasAccess, pat, refreshToken, fetchLabels, refreshPendingLabels]);

	const closeExpanded = useCallback(() => {
		if (!expandedCard || expandedCard.phase === "closing") return;
		if (closeTimerRef.current) {
			window.clearTimeout(closeTimerRef.current);
		}
		setExpandedCard((prev) =>
			prev ? { ...prev, phase: "closing" } : prev,
		);
		closeTimerRef.current = window.setTimeout(() => {
			setExpandedCard(null);
			closeTimerRef.current = null;
		}, 200);
	}, [expandedCard]);

	const openExpanded = useCallback(
		(pr: ReviewPullRequest, rect: DOMRect) => {
			if (closeTimerRef.current) {
				window.clearTimeout(closeTimerRef.current);
				closeTimerRef.current = null;
			}
			const containerRect =
				containerRef.current?.getBoundingClientRect() ??
				new DOMRect(0, 0, window.innerWidth, window.innerHeight);
			const padding = 24;
			const maxWidth = Math.max(0, containerRect.width - padding * 2);
			const maxHeight = Math.max(0, containerRect.height - padding * 2);
			const targetWidth = Math.min(730, maxWidth);
			const targetHeight = Math.min(460, maxHeight);
			const centerX = rect.left + rect.width / 2;
			const centerY = rect.top + rect.height / 2;
			const minLeft = containerRect.left + padding;
			const maxLeft = containerRect.right - targetWidth - padding;
			const minTop = containerRect.top + padding;
			const maxTop = containerRect.bottom - targetHeight - padding;
			const left =
				maxLeft < minLeft
					? minLeft
					: Math.min(
							Math.max(centerX - targetWidth / 2, minLeft),
							maxLeft,
						);
			const top =
				maxTop < minTop
					? minTop
					: Math.min(Math.max(centerY - targetHeight / 2, minTop), maxTop);
			const toRect = new DOMRect(left, top, targetWidth, targetHeight);
			setExpandedCard({
				pr,
				from: rect,
				to: toRect,
				phase: "opening",
			});
			requestAnimationFrame(() => {
				setExpandedCard((prev) =>
					prev && prev.phase === "opening"
						? { ...prev, phase: "open" }
						: prev,
				);
			});
		},
		[],
	);

	const handleCardClick = useCallback(
		(pr: ReviewPullRequest, event: MouseEvent<HTMLDivElement>) => {
			event.stopPropagation();
			const rect = event.currentTarget.getBoundingClientRect();
			openExpanded(pr, rect);
		},
		[openExpanded],
	);


	const filteredItems = useMemo(() => {
		const visibleItems = items.filter(
			(pr) =>
				!pr.labels.some((label) =>
					hiddenLabelSet.has(label.name.toLowerCase()),
				),
		);
		const statusFilteredItems = visibleItems.filter((pr) => {
			if (!pendingChecked && !updatedChecked) return true;
			const isPending = hasPendingLabel(pr.labels);
			const isUpdated = isPending && postPendingCommitMap[pr.number] === true;
			const pendingMatch = isPending && !isUpdated;
			const updatedMatch = isUpdated;
			if (pendingChecked && updatedChecked) return pendingMatch || updatedMatch;
			if (pendingChecked) return pendingMatch;
			if (updatedChecked) return updatedMatch;
			return true;
		});
		if (selectedLabels.length === 0) return statusFilteredItems;
		const selectedSet = new Set(
			selectedLabels.map((label) => label.toLowerCase()),
		);
		return statusFilteredItems.filter((pr) =>
			pr.labels.some((label) => selectedSet.has(label.name.toLowerCase())),
		);
	}, [
		hasPendingLabel,
		hiddenLabelSet,
		items,
		pendingChecked,
		postPendingCommitMap,
		selectedLabels,
		updatedChecked,
	]);

	useEffect(() => {
		return () => {
			if (closeTimerRef.current) {
				window.clearTimeout(closeTimerRef.current);
			}
			for (const timer of approveRefreshTimersRef.current.values()) {
				window.clearTimeout(timer);
			}
			approveRefreshTimersRef.current.clear();
		};
	}, []);

	if (!hasAccess) {
		return (
			<Box className={styles.emptyState}>
				<Text color="gray">当前账号无审阅权限</Text>
			</Box>
		);
	}

	return (
		<Box className={styles.container} ref={containerRef}>
			{loading && items.length === 0 && (
				<Flex align="center" gap="2" className={styles.loading}>
					<Spinner size="2" />
					<Text size="2" color="gray">
						正在获取 PR 列表...
					</Text>
				</Flex>
			)}
			{error && (
				<Text size="2" color="red" className={styles.error}>
					{error}
				</Text>
			)}
			<Box className={styles.grid}>
				{filteredItems.map((pr) => {
					return (
						<Card
							key={pr.number}
							className={`${styles.card} ${
								reviewSession?.prNumber === pr.number ? styles.reviewCard : ""
							}`}
							onClick={(event) => handleCardClick(pr, event)}
						>
						{renderCardContent({ pr, hiddenLabelSet, styles })}
						</Card>
					);
				})}
			</Box>
			{expandedCard && (
				<Box
					className={`${styles.overlay} ${
						expandedCard.phase === "open" ? styles.overlayVisible : ""
					}`}
					onClick={closeExpanded}
				>
					<Card
						className={`${styles.overlayCard} ${styles.overlayCardExpanded}`}
						style={{
							left: expandedCard.phase === "open"
								? expandedCard.to.left
								: expandedCard.from.left,
							top: expandedCard.phase === "open"
								? expandedCard.to.top
								: expandedCard.from.top,
							width: expandedCard.phase === "open"
								? expandedCard.to.width
								: expandedCard.from.width,
							height: expandedCard.phase === "open"
								? expandedCard.to.height
								: expandedCard.from.height,
						}}
						onClick={(event) => event.stopPropagation()}
					>
						{renderExpandedContent({
							pr: expandedCard.pr,
							hiddenLabelSet,
							audioLoadPendingId,
							lastNeteaseIdByPr,
							onLoadNeteaseAudio: handleLoadNeteaseAudio,
							onApprove: handleApprove,
							onRequestChanges: handleRequestChanges,
							onMerge: handleMerge,
							onOpenFile: openReviewFile,
							reviewActionPending,
							repoOwner: REPO_OWNER,
							repoName: REPO_NAME,
							styles,
						})}
					</Card>
				</Box>
			)}
		</Box>
	);
};

export default ReviewPage;
