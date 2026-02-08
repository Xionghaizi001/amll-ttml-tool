import { openDB } from "idb";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { lyricsSiteUserAtom } from "./remote-service";
import { useFileOpener } from "$/hooks/useFileOpener";
import {
	pushNotificationAtom,
	removeNotificationAtom,
	upsertNotificationAtom,
} from "$/states/notifications";
import {
	ToolMode,
	reviewReviewedPrsAtom,
	reviewSessionAtom,
	reviewSingleRefreshAtom,
	toolModeAtom,
} from "$/states/main";
import { log } from "$/utils/logging";
import { loadNeteaseAudio } from "$/modules/ncm/services/audio-service";
import { loadFileFromPullRequest } from "$/modules/github/services/file-service";
import {
	fetchOpenPullRequestPage,
	fetchPullRequestDetail,
	fetchPullRequestTimelinePage,
} from "$/modules/github/services/PR-service";
import {
	fetchLabels as fetchLabelsService,
	hasPostLabelCommits as hasPostLabelCommitsService,
	refreshPendingLabels as refreshPendingLabelsService,
} from "$/modules/github/services/label-services";
import { syncPendingUpdateNotices } from "$/modules/github/services/notice-service";
import type { ReviewLabel, ReviewPullRequest } from "./card-service";
import { applyReviewFilters } from "./filter-service";
import { useRemoteReviewService } from "./remote-service";

const DB_NAME = "review-cache";
const STORE_NAME = "open-prs";
const RECORD_KEY = "open";
const LABEL_CACHE_KEY = "labels";
const PENDING_COMMIT_CACHE_KEY = "pending-commits";
const TIMELINE_CACHE_KEY = "timeline-reviewed";
const PENDING_LABEL_NAME = "待更新";
const PENDING_LABEL_KEY = PENDING_LABEL_NAME.toLowerCase();
const CACHE_TTL = 30 * 60 * 1000;
const LABEL_CACHE_TTL = 30 * 60 * 1000;
const PENDING_COMMIT_CACHE_TTL = 10 * 60 * 1000;
const TIMELINE_CACHE_TTL = 30 * 60 * 1000;

type CachedPayload = {
	key: string;
	etag: string | null;
	cachedAt: number;
	items: ReviewPullRequest[];
};

type LabelCacheRecord = {
	key: string;
	cachedAt: number;
	items: ReviewLabel[];
};

type PendingCommitCacheRecord = {
	key: string;
	cachedAt: number;
	items: Record<number, { updated: boolean; cachedAt: number }>;
};

type TimelineCacheRecord = {
	key: string;
	cachedAt: number;
	items: Record<number, { reviewed: boolean; cachedAt: number }>;
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

const readLabelCache = async () => {
	try {
		const db = await dbPromise;
		const record = (await db.get(STORE_NAME, LABEL_CACHE_KEY)) as
			| LabelCacheRecord
			| undefined;
		if (!record?.items) return null;
		return record;
	} catch {
		return null;
	}
};

const writeLabelCache = async (items: ReviewLabel[]) => {
	try {
		const db = await dbPromise;
		const payload: LabelCacheRecord = {
			key: LABEL_CACHE_KEY,
			cachedAt: Date.now(),
			items,
		};
		await db.put(STORE_NAME, payload);
	} catch {
		return;
	}
};

const readPendingCommitCache = async () => {
	try {
		const db = await dbPromise;
		const record = (await db.get(STORE_NAME, PENDING_COMMIT_CACHE_KEY)) as
			| PendingCommitCacheRecord
			| undefined;
		if (!record?.items) return null;
		return record;
	} catch {
		return null;
	}
};

const writePendingCommitCache = async (
	items: PendingCommitCacheRecord["items"],
) => {
	try {
		const db = await dbPromise;
		const payload: PendingCommitCacheRecord = {
			key: PENDING_COMMIT_CACHE_KEY,
			cachedAt: Date.now(),
			items,
		};
		await db.put(STORE_NAME, payload);
	} catch {
		return;
	}
};

const readTimelineCache = async () => {
	try {
		const db = await dbPromise;
		const record = (await db.get(STORE_NAME, TIMELINE_CACHE_KEY)) as
			| TimelineCacheRecord
			| undefined;
		if (!record?.items) return null;
		return record;
	} catch {
		return null;
	}
};

const writeTimelineCache = async (items: TimelineCacheRecord["items"]) => {
	try {
		const db = await dbPromise;
		const payload: TimelineCacheRecord = {
			key: TIMELINE_CACHE_KEY,
			cachedAt: Date.now(),
			items,
		};
		await db.put(STORE_NAME, payload);
	} catch {
		return;
	}
};

export const useReviewPageLogic = () => {
	const pat = useAtomValue(githubPatAtom);
	const login = useAtomValue(githubLoginAtom);
	const hasAccess = useAtomValue(githubAmlldbAccessAtom);
	const lyricsSiteUser = useAtomValue(lyricsSiteUserAtom);
	// 歌词站登录也可以获得审阅权限
	const hasLyricsSiteReviewAccess = lyricsSiteUser?.reviewPermission === 1;
	const effectiveHasAccess = hasAccess || hasLyricsSiteReviewAccess;
	const hiddenLabels = useAtomValue(reviewHiddenLabelsAtom);
	const selectedLabels = useAtomValue(reviewSelectedLabelsAtom);
	const pendingChecked = useAtomValue(reviewPendingFilterAtom);
	const updatedChecked = useAtomValue(reviewUpdatedFilterAtom);
	const refreshToken = useAtomValue(reviewRefreshTokenAtom);
	const reviewedByUserMap = useAtomValue(reviewReviewedPrsAtom);
	const reviewSingleRefresh = useAtomValue(reviewSingleRefreshAtom);
	const setReviewLabels = useSetAtom(reviewLabelsAtom);
	const setHiddenLabels = useSetAtom(reviewHiddenLabelsAtom);
	const setReviewReviewedPrs = useSetAtom(reviewReviewedPrsAtom);
	const setReviewSession = useSetAtom(reviewSessionAtom);
	const reviewSession = useAtomValue(reviewSessionAtom);
	const setToolMode = useSetAtom(toolModeAtom);
	const setReviewSingleRefresh = useSetAtom(reviewSingleRefreshAtom);
	const { openFile } = useFileOpener();
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const setUpsertNotification = useSetAtom(upsertNotificationAtom);
	const setRemoveNotification = useSetAtom(removeNotificationAtom);
	const { initFromUrl } = useRemoteReviewService();
	const remoteInitRef = useRef(false);
	const pendingReviewModeSwitchRef = useRef(false);
	const neteaseCookie = useAtomValue(neteaseCookieAtom);
	const pendingUpdateNoticeIdsRef = useRef<Set<string>>(new Set());
	const pendingCommitCacheRef = useRef<
		PendingCommitCacheRecord["items"]
	>({});
	const timelineCacheRef = useRef<TimelineCacheRecord["items"]>({});
	const [selectedUser, setSelectedUser] = useState<string | null>(null);
	const [audioLoadPendingId, setAudioLoadPendingId] = useState<string | null>(
		null,
	);
	const [lastNeteaseIdByPr, setLastNeteaseIdByPr] = useState<
		Record<number, string>
	>({});
	const [neteaseIdDialog, setNeteaseIdDialog] = useState<{
		open: boolean;
		prNumber: number | null;
		ids: string[];
	}>({
		open: false,
		prNumber: null,
		ids: [],
	});

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

	const applyLabelCache = useCallback(
		(labels: ReviewLabel[]) => {
			const sorted = [...labels].sort((a, b) => a.name.localeCompare(b.name));
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

	const fetchLabels = useCallback(
		async (token: string) => {
			const cached = await readLabelCache();
			if (cached && Date.now() - cached.cachedAt < LABEL_CACHE_TTL) {
				applyLabelCache(cached.items);
				return;
			}
			const labels = await fetchLabelsService({
				token,
				setReviewLabels,
				setHiddenLabels,
			});
			await writeLabelCache(labels);
		},
		[applyLabelCache, setHiddenLabels, setReviewLabels],
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
	const refreshReviewTimeline = useCallback(
		async (prNumber: number) => {
			if (!Number.isFinite(prNumber)) return;
			const token = pat.trim();
			const userLogin = login.trim().toLowerCase();
			if (!token || !userLogin || !hasAccess) return;
			const perPage = 100;
			const maxPages = 5;
			let reviewed = false;
			for (let page = 1; page <= maxPages; page += 1) {
				const response = await fetchPullRequestTimelinePage({
					token,
					prNumber,
					perPage,
					page,
				});
				if (!response.ok) break;
				for (const item of response.items) {
					if (item.event !== "reviewed") continue;
					const actorLogin =
						item.user?.login?.toLowerCase() ??
						item.actor?.login?.toLowerCase() ??
						"";
					if (actorLogin === userLogin) {
						reviewed = true;
						break;
					}
				}
				if (reviewed || response.items.length < perPage) break;
			}
			setReviewReviewedPrs((prev) =>
				Number.isFinite(prNumber)
					? { ...prev, [prNumber]: reviewed }
					: prev,
			);
			const now = Date.now();
			const nextCache = {
				...timelineCacheRef.current,
				[prNumber]: { reviewed, cachedAt: now },
			};
			timelineCacheRef.current = nextCache;
			await writeTimelineCache(nextCache);
		},
		[hasAccess, login, pat, setReviewReviewedPrs],
	);
	const refreshSinglePullRequest = useCallback(
		async (prNumber: number) => {
			const token = pat.trim();
			if (!token) return;
			const detail = await fetchPullRequestDetail({ token, prNumber });
			if (!detail) return;
			const refreshedItems = await refreshPendingLabels(token, [detail]);
			const refreshedItem = refreshedItems[0] ?? detail;
			setItems((prev) => {
				const index = prev.findIndex((pr) => pr.number === prNumber);
				if (index < 0) return prev;
				const next = [...prev];
				next[index] = refreshedItem;
				return next;
			});
			const cached = await readCache();
			if (!cached?.items?.length) return;
			const nextCached = cached.items.map((pr) =>
				pr.number === prNumber ? refreshedItem : pr,
			);
			await writeCache(nextCached, cached.etag ?? null);
		},
		[pat, refreshPendingLabels],
	);

	useEffect(() => {
		let cancelled = false;
		const run = async () => {
			const labelCache = await readLabelCache();
			if (cancelled || !labelCache) return;
			if (Date.now() - labelCache.cachedAt >= LABEL_CACHE_TTL) return;
			applyLabelCache(labelCache.items);
		};
		void run();
		return () => {
			cancelled = true;
		};
	}, [applyLabelCache]);

	useEffect(() => {
		let cancelled = false;
		const run = async () => {
			const record = await readPendingCommitCache();
			if (cancelled || !record?.items) return;
			const now = Date.now();
			const freshItems: PendingCommitCacheRecord["items"] = {};
			const mapped: Record<number, boolean> = {};
			for (const [key, value] of Object.entries(record.items)) {
				const prNumber = Number(key);
				if (!Number.isFinite(prNumber)) continue;
				if (now - value.cachedAt >= PENDING_COMMIT_CACHE_TTL) continue;
				freshItems[prNumber] = value;
				mapped[prNumber] = value.updated;
			}
			if (cancelled) return;
			if (Object.keys(mapped).length > 0) {
				setPostPendingCommitMap((prev) => ({ ...mapped, ...prev }));
			}
			pendingCommitCacheRef.current = freshItems;
		};
		void run();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		const run = async () => {
			const record = await readTimelineCache();
			if (cancelled || !record?.items) return;
			const now = Date.now();
			const freshItems: TimelineCacheRecord["items"] = {};
			const mapped: Record<number, boolean> = {};
			for (const [key, value] of Object.entries(record.items)) {
				const prNumber = Number(key);
				if (!Number.isFinite(prNumber)) continue;
				if (now - value.cachedAt >= TIMELINE_CACHE_TTL) continue;
				freshItems[prNumber] = value;
				mapped[prNumber] = value.reviewed;
			}
			if (cancelled) return;
			if (Object.keys(mapped).length > 0) {
				setReviewReviewedPrs((prev) => ({ ...prev, ...mapped }));
			}
			timelineCacheRef.current = freshItems;
		};
		void run();
		return () => {
			cancelled = true;
		};
	}, [setReviewReviewedPrs]);

	useEffect(() => {
		if (remoteInitRef.current) return;
		remoteInitRef.current = true;
		void initFromUrl();
	}, [initFromUrl]);

	useEffect(() => {
		if (!reviewSingleRefresh) return;
		let cancelled = false;
		const run = async () => {
			await refreshSinglePullRequest(reviewSingleRefresh);
			await refreshReviewTimeline(reviewSingleRefresh);
			if (!cancelled) {
				setReviewSingleRefresh(null);
			}
		};
		void run();
		return () => {
			cancelled = true;
		};
	}, [
		refreshReviewTimeline,
		refreshSinglePullRequest,
		reviewSingleRefresh,
		setReviewSingleRefresh,
	]);

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
				const nextIds = await syncPendingUpdateNotices({
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
			const now = Date.now();
			const nextCache: PendingCommitCacheRecord["items"] = {
				...pendingCommitCacheRef.current,
			};
			for (const item of unknownItems) {
				const cached = nextCache[item.number];
				if (cached && now - cached.cachedAt < PENDING_COMMIT_CACHE_TTL) {
					setPostPendingCommitMap((prev) => {
						if (prev[item.number] === cached.updated) return prev;
						return { ...prev, [item.number]: cached.updated };
					});
					continue;
				}
				const updated = await hasPostLabelCommits(token, item.number);
				if (cancelled) return;
				nextCache[item.number] = { updated, cachedAt: Date.now() };
				setPostPendingCommitMap((prev) => {
					if (prev[item.number] === updated) return prev;
					return { ...prev, [item.number]: updated };
				});
			}
			if (cancelled) return;
			pendingCommitCacheRef.current = nextCache;
			await writePendingCommitCache(nextCache);
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

	const runLoadNeteaseAudio = useCallback(
		async (prNumber: number, id: string) => {
			await loadNeteaseAudio({
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

	const closeNeteaseIdDialog = useCallback(() => {
		setNeteaseIdDialog({
			open: false,
			prNumber: null,
			ids: [],
		});
		if (pendingReviewModeSwitchRef.current) {
			pendingReviewModeSwitchRef.current = false;
			setToolMode(ToolMode.Edit);
		}
	}, [setToolMode]);

	const handleSelectNeteaseId = useCallback(
		(id: string) => {
			const prNumber = neteaseIdDialog.prNumber;
			if (!prNumber) {
				closeNeteaseIdDialog();
				return;
			}
			void runLoadNeteaseAudio(prNumber, id);
			closeNeteaseIdDialog();
		},
		[closeNeteaseIdDialog, neteaseIdDialog.prNumber, runLoadNeteaseAudio],
	);

	const handleLoadNeteaseAudio = useCallback(
		(prNumber: number, ids: string[]) => {
			if (audioLoadPendingId) return;
			const cleanedIds = ids.map((id) => id.trim()).filter(Boolean);
			if (cleanedIds.length === 0) return;
			if (cleanedIds.length === 1) {
				void runLoadNeteaseAudio(prNumber, cleanedIds[0]);
				return;
			}
			setNeteaseIdDialog({
				open: true,
				prNumber,
				ids: cleanedIds,
			});
		},
		[audioLoadPendingId, runLoadNeteaseAudio],
	);

	const openReviewFile = useCallback(
		async (pr: ReviewPullRequest, ids: string[] = []) => {
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
				const fileResult = await loadFileFromPullRequest({
					token,
					prNumber: pr.number,
				});
				if (!fileResult) {
					setPushNotification({
						title: "未找到可打开的歌词文件",
						level: "warning",
						source: "review",
					});
					return;
				}
				setReviewSession({
					prNumber: pr.number,
					prTitle: pr.title,
					fileName: fileResult.fileName,
					source: "review",
				});
				openFile(fileResult.file);
				const cleanedIds = ids.map((id) => id.trim()).filter(Boolean);
				if (cleanedIds.length > 0) {
					if (cleanedIds.length > 1) {
						pendingReviewModeSwitchRef.current = true;
					}
					handleLoadNeteaseAudio(pr.number, cleanedIds);
				}
				if (!pendingReviewModeSwitchRef.current) {
					setToolMode(ToolMode.Edit);
				}
			} catch {
				setPushNotification({
					title: "打开 PR 文件失败",
					level: "error",
					source: "review",
				});
			}
		},
		[
			handleLoadNeteaseAudio,
			openFile,
			pat,
			setPushNotification,
			setReviewSession,
			setToolMode,
		],
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
			setError(null);
			const cached = refreshChanged ? null : await readCache();
			if (cached?.items?.length) {
				const cacheAge = Date.now() - cached.cachedAt;
				if (cacheAge < CACHE_TTL) {
					if (!cancelled) {
						setItems(cached.items);
						setLoading(false);
					}
					return;
				}
			}
			setLoading(true);
			try {
				await fetchLabels(token);
				const perPage = 20;
				const maxPages = 50;
				let etag: string | null = null;
				const result: ReviewPullRequest[] = [];
				for (let page = 1; page <= maxPages; page += 1) {
					const listResponse = await fetchOpenPullRequestPage({
						token,
						perPage,
						page,
						etag: page === 1 ? cached?.etag ?? null : null,
					});
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
						etag = listResponse.etag;
						log("review list etag", etag);
					}
					const pageList = listResponse.items;
					if (pageList.length === 0) {
						break;
					}
					result.push(...pageList);
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

	const filteredItems = useMemo(
		() =>
			applyReviewFilters({
				items,
				hiddenLabelSet,
				pendingChecked,
				updatedChecked,
				hasPendingLabel,
				postPendingCommitMap,
				selectedLabels,
				selectedUser,
			}),
		[
			items,
			hiddenLabelSet,
			pendingChecked,
			updatedChecked,
			hasPendingLabel,
			postPendingCommitMap,
			selectedLabels,
			selectedUser,
		],
	);

	return {
		audioLoadPendingId,
		error,
		filteredItems,
		handleLoadNeteaseAudio,
		hasAccess: effectiveHasAccess,
		hiddenLabelSet,
		items,
		lastNeteaseIdByPr,
		loading,
		neteaseIdDialog: {
			open: neteaseIdDialog.open,
			ids: neteaseIdDialog.ids,
			onSelect: handleSelectNeteaseId,
			onClose: closeNeteaseIdDialog,
		},
		openReviewFile,
		refreshReviewTimeline,
		reviewedByUserMap,
		reviewSession,
		selectedUser,
		setSelectedUser,
	};
};
