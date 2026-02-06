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
import { useFileOpener } from "$/hooks/useFileOpener";
import {
	pushNotificationAtom,
	removeNotificationAtom,
	upsertNotificationAtom,
} from "$/states/notifications";
import { ToolMode, reviewSessionAtom, toolModeAtom } from "$/states/main";
import { log } from "$/utils/logging";
import { loadNeteaseAudio } from "$/modules/ncm/services/audio-service";
import { loadFileFromPullRequest } from "$/modules/github/services/file-service";
import {
	fetchOpenPullRequestPage,
	fetchPullRequestDetail,
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

export const useReviewPageLogic = () => {
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
	const { initFromUrl } = useRemoteReviewService();
	const remoteInitRef = useRef(false);
	const pendingReviewModeSwitchRef = useRef(false);
	const neteaseCookie = useAtomValue(neteaseCookieAtom);
	const pendingUpdateNoticeIdsRef = useRef<Set<string>>(new Set());
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
		if (remoteInitRef.current) return;
		remoteInitRef.current = true;
		void initFromUrl();
	}, [initFromUrl]);

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
			setLoading(true);
			setError(null);
			try {
				await fetchLabels(token);
				const cached = refreshChanged ? null : await readCache();
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
							return fetchPullRequestDetail({
								token,
								prNumber: pr.number,
							});
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
		hasAccess,
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
		reviewSession,
		selectedUser,
		setSelectedUser,
	};
};
