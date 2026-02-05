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
	githubLoginAtom,
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
import {
	pushNotificationAtom,
	removeNotificationAtom,
	upsertNotificationAtom,
} from "$/states/notifications";
import { reviewSessionAtom, toolModeAtom } from "$/states/main";
import { log } from "$/utils/logging";
import { loadNeteaseAudioForReview } from "$/modules/audio/netease-audio-service";
import { loadReviewFileFromPullRequest } from "$/modules/github/services/review-file-service";
import {
	fetchLabels as fetchLabelsService,
	hasPostLabelCommits as hasPostLabelCommitsService,
	refreshPendingLabels as refreshPendingLabelsService,
} from "$/modules/github/services/label-services";
import { syncPendingUpdateReviewNotices } from "$/modules/github/services/review-notice-service";
import { renderExpandedContent } from "$/modules/review/modals/ReviewCardGroup";
import {
	renderCardContent,
	type ReviewLabel,
	type ReviewPullRequest,
} from "$/modules/review/services/review-card-service";
import { githubFetch } from "$/modules/github/api";
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
	const login = useAtomValue(githubLoginAtom);
	const hasAccess = useAtomValue(githubAmlldbAccessAtom);
	const hiddenLabels = useAtomValue(reviewHiddenLabelsAtom);
	const selectedLabels = useAtomValue(reviewSelectedLabelsAtom);
	const pendingChecked = useAtomValue(reviewPendingFilterAtom);
	const updatedChecked = useAtomValue(reviewUpdatedFilterAtom);
	const refreshToken = useAtomValue(reviewRefreshTokenAtom);
	const setReviewLabels = useSetAtom(reviewLabelsAtom);
	const setHiddenLabels = useSetAtom(reviewHiddenLabelsAtom);
	const setReviewSession = useSetAtom(reviewSessionAtom);
	const reviewSession = useAtomValue(reviewSessionAtom);
	const setToolMode = useSetAtom(toolModeAtom);
	const { openFile } = useFileOpener();
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const setUpsertNotification = useSetAtom(upsertNotificationAtom);
	const setRemoveNotification = useSetAtom(removeNotificationAtom);
	const neteaseCookie = useAtomValue(neteaseCookieAtom);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const closeTimerRef = useRef<number | null>(null);
	const pendingUpdateNoticeIdsRef = useRef<Set<string>>(new Set());
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

	const hasPostLabelCommits = useCallback(
		(token: string, prNumber: number) =>
			hasPostLabelCommitsService(token, prNumber),
		[],
	);

	const fetchLabels = useCallback(
		(token: string) =>
			fetchLabelsService({
				token,
				setReviewLabels,
				setHiddenLabels,
			}),
		[setHiddenLabels, setReviewLabels],
	);

	const refreshPendingLabels = useCallback(
		(token: string, sourceItems: ReviewPullRequest[]) =>
			refreshPendingLabelsService({
				token,
				sourceItems,
				hasPendingLabel,
			}),
		[hasPendingLabel],
	);

	useEffect(() => {
		const token = pat.trim();
		const trimmedLogin = login.trim();
		if (!hasAccess || !token || !trimmedLogin) {
			if (pendingUpdateNoticeIdsRef.current.size > 0) {
				for (const id of pendingUpdateNoticeIdsRef.current) {
					setRemoveNotification(id);
				}
				pendingUpdateNoticeIdsRef.current = new Set();
			}
			return;
		}
		let cancelled = false;
		const run = async () => {
			try {
				const nextIds = await syncPendingUpdateReviewNotices({
					token,
					login: trimmedLogin,
					previousIds: pendingUpdateNoticeIdsRef.current,
					upsertNotification: setUpsertNotification,
					removeNotification: setRemoveNotification,
				});
				if (cancelled) return;
				pendingUpdateNoticeIdsRef.current = nextIds;
			} catch {
			}
		};
		void run();
		return () => {
			cancelled = true;
		};
	}, [
		hasAccess,
		login,
		pat,
		setRemoveNotification,
		setUpsertNotification,
	]);

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
				await loadReviewFileFromPullRequest({
					token,
					prNumber: pr.number,
					prTitle: pr.title,
					source: "review",
					openFile,
					setToolMode,
					setReviewSession,
					pushNotification: setPushNotification,
				});
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
				const perPage = 20;
				const maxPages = 50;
				let etag: string | null = null;
				const result: ReviewPullRequest[] = [];
				for (let page = 1; page <= maxPages; page += 1) {
					const pageHeaders = { ...headers };
					if (page === 1 && cached?.etag) {
						pageHeaders["If-None-Match"] = cached.etag;
					}
					const listResponse = await githubFetch(
						`/repos/${REPO_OWNER}/${REPO_NAME}/pulls`,
						{
							params: { state: "open", per_page: perPage, page },
							init: { headers: pageHeaders },
						},
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
					const detailItems = await Promise.all(
						pageList.map(async (pr) => {
							const detailResponse = await githubFetch(
								`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${pr.number}`,
								{
									init: { headers },
								},
							);
							if (!detailResponse.ok) {
								return null;
							}
							const detail = (await detailResponse.json()) as {
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
						}),
					);
					for (const item of detailItems) {
						if (item) {
							result.push(item);
						}
					}
					if (cancelled) return;
					setItems([...result]);
					if (pageList.length < perPage) {
						break;
					}
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
			const overlayTopInset = 44;
			const containerRect = new DOMRect(
				0,
				overlayTopInset,
				window.innerWidth,
				Math.max(0, window.innerHeight - overlayTopInset),
			);
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
							onOpenFile: openReviewFile,
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
