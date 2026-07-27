import {
	Avatar,
	Box,
	Button,
	Card,
	Flex,
	Select,
	Spinner,
	Text,
} from "@radix-ui/themes";
import {
	type MouseEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useLyricsSiteReviewService } from "$/modules/lyrics-site";
import { NeteaseIdSelectDialog } from "$/modules/ncm/modals/NeteaseIdSelectDialog";
import { ReviewExpandedContent } from "$/modules/review/modals/ReviewCardGroup";
import styles from "../index.module.css";
import {
	getReviewItemCreatedAt,
	getReviewItemKey,
	groupReviewItemsByUser,
	isGitHubPullRequest,
	isLyricsSiteSubmission,
	type ReviewItem,
	ReviewSmallCard,
	type ReviewUserCardGroup,
} from "./card-service";
import { useReviewPageLogic } from "./page-hooks";
import { useLyricsSiteAuth } from "./remote-service";

const OVERLAY_PADDING = 24;
const LARGE_CARD_WIDTH = 730;
const LARGE_CARD_HEIGHT = 460;
const GROUP_PANEL_HEADER_HEIGHT = 64;
const GROUP_PANEL_INSET = 16;
const GROUP_PANEL_GRID_PADDING_TOP = 12;
const GROUP_PANEL_GRID_PADDING_BOTTOM = 16;
const GROUP_PANEL_HEIGHT_ALLOWANCE = 8;
const GROUP_PANEL_GAP = 12;
const GROUP_CARD_MAX_WIDTH = 350;
const GROUP_CARD_MIN_WIDTH = 256;
const GROUP_CARD_HEIGHT = 180;
const GROUP_PANEL_MAX_COLUMNS = 3;
const GROUP_PANEL_MAX_ROWS = 3;

const ReviewPage = () => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const closeTimerRef = useRef<number | null>(null);
	const cardRefs = useRef<Map<string | number, HTMLDivElement>>(new Map());
	const cardRectsRef = useRef<Map<string | number, DOMRect>>(new Map());
	const cardAnimationsRef = useRef<Map<string | number, Animation>>(new Map());
	const [expandedCard, setExpandedCard] = useState<{
		item: ReviewItem;
		from: DOMRect;
		to: DOMRect;
		phase: "opening" | "open" | "closing";
		overlayTopInset: number;
		overlayBottomInset: number;
	} | null>(null);
	const [expandedGroup, setExpandedGroup] = useState<{
		group: ReviewUserCardGroup;
		from: DOMRect;
		to: DOMRect;
		columns: number;
		phase: "opening" | "open" | "closing";
		overlayTopInset: number;
		overlayBottomInset: number;
	} | null>(null);
	const {
		audioLoadPendingId,
		error,
		filteredItems,
		hasAccess,
		hiddenLabelSet,
		items,
		lastNeteaseIdByPr,
		loading,
		neteaseIdDialog,
		openReviewFile,
		refreshReviewTimeline,
		reviewedByUserMap,
		reviewSession,
		selectedUser,
		setSelectedUser,
		selectedLanguage,
		setSelectedLanguage,
		sourceFilter,
		setSourceFilter,
	} = useReviewPageLogic();
	const {
		user: lyricsSiteUser,
		isLoggedIn: isLyricsSiteLoggedIn,
		hasReviewPermission: hasLyricsSiteReviewPermission,
		initiateLogin: initiateLyricsSiteLogin,
		logout: logoutLyricsSite,
	} = useLyricsSiteAuth();
	const { openSubmissionFile } = useLyricsSiteReviewService();

	const priorityLabelName = "参与审核招募";
	const sortedItems = useMemo(() => {
		const itemsWithMeta = filteredItems.map((item) => ({
			item,
			createdAt: new Date(getReviewItemCreatedAt(item)).getTime(),
			hasPriorityLabel:
				isGitHubPullRequest(item) &&
				item.labels.some((label) => label.name.trim() === priorityLabelName),
		}));
		itemsWithMeta.sort((a, b) => {
			if (a.hasPriorityLabel !== b.hasPriorityLabel) {
				return a.hasPriorityLabel ? -1 : 1;
			}
			return b.createdAt - a.createdAt;
		});
		return itemsWithMeta.map((meta) => meta.item);
	}, [filteredItems]);
	const groupedCards = useMemo(
		() => groupReviewItemsByUser(sortedItems),
		[sortedItems],
	);

	const closeExpanded = useCallback(() => {
		if (!expandedCard || expandedCard.phase === "closing") return;
		if (closeTimerRef.current) {
			window.clearTimeout(closeTimerRef.current);
		}
		setExpandedCard((prev) => (prev ? { ...prev, phase: "closing" } : prev));
		closeTimerRef.current = window.setTimeout(() => {
			setExpandedCard(null);
			closeTimerRef.current = null;
		}, 200);
	}, [expandedCard]);

	const closeGroupPreview = useCallback(() => {
		if (!expandedGroup || expandedGroup.phase === "closing") return;
		if (closeTimerRef.current) {
			window.clearTimeout(closeTimerRef.current);
		}
		setExpandedGroup((prev) => (prev ? { ...prev, phase: "closing" } : prev));
		closeTimerRef.current = window.setTimeout(() => {
			setExpandedGroup(null);
			closeTimerRef.current = null;
		}, 200);
	}, [expandedGroup]);

	const closeOverlay = useCallback(() => {
		if (expandedCard) {
			closeExpanded();
			return;
		}
		if (expandedGroup) {
			closeGroupPreview();
		}
	}, [expandedCard, expandedGroup, closeExpanded, closeGroupPreview]);

	const setCardRef = useCallback(
		(itemId: string | number) => (node: HTMLDivElement | null) => {
			if (node) {
				cardRefs.current.set(itemId, node);
			} else {
				cardRefs.current.delete(itemId);
			}
		},
		[],
	);

	const getOverlayTopInset = useCallback(() => {
		if (typeof document === "undefined") return 52;
		const ribbonBar = document.querySelector("[data-ribbon-bar]");
		if (ribbonBar instanceof HTMLElement) {
			const top = ribbonBar.getBoundingClientRect().top;
			if (Number.isFinite(top)) {
				return Math.round(top);
			}
		}
		return 52;
	}, []);

	const getOverlayBottomInset = useCallback(() => {
		if (typeof document === "undefined") return 0;
		const audioControls = document.querySelector("[data-audio-controls]");
		if (audioControls instanceof HTMLElement) {
			const height = audioControls.getBoundingClientRect().height;
			if (Number.isFinite(height) && height > 0) {
				return Math.round(height);
			}
		}
		return 0;
	}, []);

	const getOverlayBounds = useCallback(() => {
			const overlayTopInset = getOverlayTopInset();
			const overlayBottomInset = getOverlayBottomInset();
			const containerEl = containerRef.current;
			const containerRect = containerEl
				? containerEl.getBoundingClientRect()
				: new DOMRect(
						0,
						overlayTopInset,
						window.innerWidth,
						Math.max(
							0,
							window.innerHeight - overlayTopInset - overlayBottomInset,
						),
					);
			return { overlayTopInset, overlayBottomInset, containerRect };
		}, [getOverlayTopInset, getOverlayBottomInset]);

	const getTargetRect = useCallback(
		(rect: DOMRect, targetWidth: number, targetHeight: number) => {
			const { containerRect } = getOverlayBounds();
			const maxWidth = Math.max(0, containerRect.width - OVERLAY_PADDING * 2);
			const maxHeight = Math.max(0, containerRect.height - OVERLAY_PADDING * 2);
			const width = Math.min(targetWidth, maxWidth);
			const height = Math.min(targetHeight, maxHeight);
			const centerX = rect.left + rect.width / 2;
			const centerY = rect.top + rect.height / 2;
			const minLeft = containerRect.left + OVERLAY_PADDING;
			const maxLeft = containerRect.right - width - OVERLAY_PADDING;
			const minTop = containerRect.top + OVERLAY_PADDING;
			const maxTop = containerRect.bottom - height - OVERLAY_PADDING;
			const left =
				maxLeft < minLeft
					? minLeft
					: Math.min(Math.max(centerX - width / 2, minLeft), maxLeft);
			const top =
				maxTop < minTop
					? minTop
					: Math.min(Math.max(centerY - height / 2, minTop), maxTop);
			return new DOMRect(left, top, width, height);
		},
		[getOverlayBounds],
	);

	const getGroupTargetRect = useCallback(
		(rect: DOMRect, targetWidth: number, targetHeight: number) => {
			const { containerRect } = getOverlayBounds();
			const maxWidth = Math.max(0, containerRect.width - OVERLAY_PADDING * 2);
			const maxHeight = Math.max(0, containerRect.height - OVERLAY_PADDING * 2);
			const width = Math.min(targetWidth, maxWidth);
			const height = Math.min(targetHeight, maxHeight);
			const centerX = rect.left + rect.width / 2;
			const minLeft = containerRect.left + OVERLAY_PADDING;
			const maxLeft = containerRect.right - width - OVERLAY_PADDING;
			const minTop = containerRect.top + OVERLAY_PADDING;
			const maxTop = containerRect.bottom - height - OVERLAY_PADDING;
			const left =
				maxLeft < minLeft
					? minLeft
					: Math.min(Math.max(centerX - width / 2, minLeft), maxLeft);
			const top =
				maxTop < minTop ? minTop : Math.min(Math.max(rect.top, minTop), maxTop);
			return new DOMRect(left, top, width, height);
		},
		[getOverlayBounds],
	);

	const getGroupPreviewLayout = useCallback(
		(groupSize: number, rect: DOMRect) => {
			const { containerRect } = getOverlayBounds();
			const maxPanelWidth =
				GROUP_PANEL_INSET * 2 +
				GROUP_PANEL_MAX_COLUMNS * GROUP_CARD_MAX_WIDTH +
				(GROUP_PANEL_MAX_COLUMNS - 1) * GROUP_PANEL_GAP;
			const maxPanelHeight =
				GROUP_PANEL_HEADER_HEIGHT +
				GROUP_PANEL_GRID_PADDING_TOP +
				GROUP_PANEL_MAX_ROWS * GROUP_CARD_HEIGHT +
				(GROUP_PANEL_MAX_ROWS - 1) * GROUP_PANEL_GAP +
				GROUP_PANEL_GRID_PADDING_BOTTOM +
				GROUP_PANEL_HEIGHT_ALLOWANCE;
			const maxWidth = Math.min(
				maxPanelWidth,
				Math.max(0, containerRect.width - OVERLAY_PADDING * 2),
			);
			const maxHeight = Math.min(
				maxPanelHeight,
				Math.max(0, containerRect.height - OVERLAY_PADDING * 2),
			);
			const maxColumns = Math.max(
				1,
				Math.floor(
					(maxWidth - GROUP_PANEL_INSET * 2 + GROUP_PANEL_GAP) /
						(GROUP_CARD_MIN_WIDTH + GROUP_PANEL_GAP),
				),
			);
			const columns = Math.max(
				1,
				Math.min(groupSize, GROUP_PANEL_MAX_COLUMNS, maxColumns),
			);
			const naturalWidth =
				GROUP_PANEL_INSET * 2 +
				columns * GROUP_CARD_MAX_WIDTH +
				(columns - 1) * GROUP_PANEL_GAP;
			const targetWidth = Math.min(maxWidth, naturalWidth);
			const rows = Math.ceil(groupSize / columns);
			const naturalHeight =
				GROUP_PANEL_HEADER_HEIGHT +
				GROUP_PANEL_GRID_PADDING_TOP +
				rows * GROUP_CARD_HEIGHT +
				Math.max(0, rows - 1) * GROUP_PANEL_GAP +
				GROUP_PANEL_GRID_PADDING_BOTTOM +
				GROUP_PANEL_HEIGHT_ALLOWANCE;
			const targetHeight = Math.min(maxHeight, naturalHeight);
			return {
				columns,
				to: getGroupTargetRect(rect, targetWidth, targetHeight),
			};
		},
		[getOverlayBounds, getGroupTargetRect],
	);

	const openExpanded = useCallback(
		(item: ReviewItem, rect: DOMRect) => {
			if (closeTimerRef.current) {
				window.clearTimeout(closeTimerRef.current);
				closeTimerRef.current = null;
			}
			const { overlayTopInset, overlayBottomInset } = getOverlayBounds();
			const toRect = getTargetRect(rect, LARGE_CARD_WIDTH, LARGE_CARD_HEIGHT);
			setExpandedCard({
				item,
				from: rect,
				to: toRect,
				phase: "opening",
				overlayTopInset,
				overlayBottomInset,
			});
			requestAnimationFrame(() => {
				setExpandedCard((prev) =>
					prev && prev.phase === "opening" ? { ...prev, phase: "open" } : prev,
				);
			});
		},
		[getOverlayBounds, getTargetRect],
	);

	const openGroupPreview = useCallback(
		(group: ReviewUserCardGroup, rect: DOMRect) => {
			if (closeTimerRef.current) {
				window.clearTimeout(closeTimerRef.current);
				closeTimerRef.current = null;
			}
			const { overlayTopInset, overlayBottomInset } = getOverlayBounds();
			const { columns, to } = getGroupPreviewLayout(group.items.length, rect);
			setExpandedGroup({
				group,
				from: rect,
				to,
				columns,
				phase: "opening",
				overlayTopInset,
				overlayBottomInset,
			});
			requestAnimationFrame(() => {
				setExpandedGroup((prev) =>
					prev && prev.phase === "opening" ? { ...prev, phase: "open" } : prev,
				);
			});
		},
		[getOverlayBounds, getGroupPreviewLayout],
	);

	const handleCardClick = useCallback(
		(item: ReviewItem, event: MouseEvent<HTMLDivElement>) => {
			event.stopPropagation();
			if (isGitHubPullRequest(item)) {
				void refreshReviewTimeline(item.number);
			}
			const rect = event.currentTarget.getBoundingClientRect();
			openExpanded(item, rect);
		},
		[openExpanded, refreshReviewTimeline],
	);

	const handleGroupClick = useCallback(
		(group: ReviewUserCardGroup, event: MouseEvent<HTMLDivElement>) => {
			event.stopPropagation();
			if (group.items.length <= 1) {
				handleCardClick(group.latestItem, event);
				return;
			}
			const rect = event.currentTarget.getBoundingClientRect();
			openGroupPreview(group, rect);
		},
		[handleCardClick, openGroupPreview],
	);

	const handleGroupPreviewCardClick = useCallback(
		(item: ReviewItem, event: MouseEvent<HTMLDivElement>) => {
			event.stopPropagation();
			if (isGitHubPullRequest(item)) {
				void refreshReviewTimeline(item.number);
			}
			const rect = event.currentTarget.getBoundingClientRect();
			setExpandedGroup(null);
			openExpanded(item, rect);
		},
		[openExpanded, refreshReviewTimeline],
	);

	const handleOpenFile = useCallback(
		async (item: ReviewItem, ids?: string[]) => {
			if (isLyricsSiteSubmission(item)) {
				await openSubmissionFile(item);
			} else if (isGitHubPullRequest(item)) {
				await openReviewFile(item, ids || []);
			}
		},
		[openSubmissionFile, openReviewFile],
	);

	useLayoutEffect(() => {
		const listSize = groupedCards.length;
		const prefersReducedMotion =
			typeof window !== "undefined" &&
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const shouldAnimate =
			!prefersReducedMotion && listSize > 0 && listSize <= 140;
		const containerRect = containerRef.current?.getBoundingClientRect();
		const viewportMargin = 80;
		const maxAnimated = 80;
		let animatedCount = 0;
		const previousRects = cardRectsRef.current;
		const nextRects = new Map<string | number, DOMRect>();
		cardRefs.current.forEach((node, key) => {
			if (!node) return;
			const rect = node.getBoundingClientRect();
			nextRects.set(key, rect);
			const previous = previousRects.get(key);
			if (!previous) return;
			const deltaX = previous.left - rect.left;
			const deltaY = previous.top - rect.top;
			if (deltaX === 0 && deltaY === 0) return;
			if (!shouldAnimate) return;
			if (
				containerRect &&
				(rect.bottom < containerRect.top - viewportMargin ||
					rect.top > containerRect.bottom + viewportMargin)
			) {
				return;
			}
			if (animatedCount >= maxAnimated) return;
			animatedCount += 1;
			if (typeof node.animate !== "function") return;
			const existing = cardAnimationsRef.current.get(key);
			if (existing) existing.cancel();
			const animation = node.animate(
				[
					{ transform: `translate(${deltaX}px, ${deltaY}px)` },
					{ transform: "translate(0, 0)" },
				],
				{
					duration: 220,
					easing: "cubic-bezier(0.2, 0.1, 0, 1)",
				},
			);
			cardAnimationsRef.current.set(key, animation);
			animation.finished
				.then(() => {
					if (cardAnimationsRef.current.get(key) === animation) {
						cardAnimationsRef.current.delete(key);
					}
				})
				.catch(() => {});
		});
		cardRectsRef.current = nextRects;
	}, [groupedCards]);

	useEffect(() => {
		return () => {
			if (closeTimerRef.current) {
				window.clearTimeout(closeTimerRef.current);
			}
		};
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				closeOverlay();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [closeOverlay]);

	const hasReviewAccess = hasAccess || hasLyricsSiteReviewPermission;

	if (!hasReviewAccess) {
		return (
			<Box className={styles.emptyState}>
				<Flex direction="column" align="center" gap="4">
					{isLyricsSiteLoggedIn && !hasLyricsSiteReviewPermission ? (
						<>
							<Text color="gray">当前账号无审阅权限</Text>
							<Text size="2" color="gray">
								你当前不是歌词库审核员，无法参与审阅
							</Text>
							<Button
								size="1"
								variant="soft"
								color="gray"
								onClick={logoutLyricsSite}
							>
								登出并切换账号
							</Button>
						</>
					) : (
						<>
							<Text color="gray">当前账号无审阅权限</Text>
							<Text size="2" color="gray">
								请先登录以获取审阅权限
							</Text>
							<Button variant="soft" onClick={initiateLyricsSiteLogin}>
								登录歌词站
							</Button>
						</>
					)}
				</Flex>
			</Box>
		);
	}

	return (
		<Box className={styles.wrapper}>
			<Flex align="center" justify="between" className={styles.userBar}>
				<Flex align="center" gap="2">
					{isLyricsSiteLoggedIn && lyricsSiteUser ? (
						<>
							<Avatar
								size="2"
								src={lyricsSiteUser.avatarUrl}
								fallback={lyricsSiteUser.displayName?.[0] || "U"}
								radius="full"
							/>
							<Flex direction="column">
								<Text size="2" weight="medium">
									{lyricsSiteUser.displayName}
								</Text>
								<Text size="1" color="gray">
									@{lyricsSiteUser.username}
									{lyricsSiteUser.reviewPermission === 1 && (
										<span style={{ marginLeft: "8px" }}>审核员</span>
									)}
								</Text>
							</Flex>
							<Button
								size="1"
								variant="soft"
								color="gray"
								onClick={logoutLyricsSite}
							>
								登出
							</Button>
						</>
					) : (
						<Button size="2" variant="soft" onClick={initiateLyricsSiteLogin}>
							登录歌词站
						</Button>
					)}
				</Flex>
				<Flex align="center" gap="4">
					<Flex align="center" gap="2">
						<Text size="2" color="gray">
							语言筛选:
						</Text>
						<Select.Root
							value={selectedLanguage || "all"}
							onValueChange={(value) =>
								setSelectedLanguage(value === "all" ? null : value)
							}
						>
							<Select.Trigger variant="soft" />
							<Select.Content>
								<Select.Item value="all">全部</Select.Item>
								<Select.Item value="ja">日语</Select.Item>
								<Select.Item value="zh">中文</Select.Item>
								<Select.Item value="en">英语</Select.Item>
								<Select.Item value="ko">韩语</Select.Item>
								<Select.Item value="others">其他</Select.Item>
							</Select.Content>
						</Select.Root>
					</Flex>
					<Flex align="center" gap="2">
						<Text size="2" color="gray">
							来源筛选:
						</Text>
						<Button
							size="1"
							variant={sourceFilter === "all" ? "solid" : "soft"}
							color={sourceFilter === "all" ? "blue" : "gray"}
							onClick={() => setSourceFilter("all")}
						>
							全部
						</Button>
						<Button
							size="1"
							variant={sourceFilter === "github" ? "solid" : "soft"}
							color={sourceFilter === "github" ? "green" : "gray"}
							onClick={() => setSourceFilter("github")}
						>
							GitHub
						</Button>
						<Button
							size="1"
							variant={sourceFilter === "lyrics-site" ? "solid" : "soft"}
							color={sourceFilter === "lyrics-site" ? "violet" : "gray"}
							onClick={() => setSourceFilter("lyrics-site")}
						>
							歌词站
						</Button>
					</Flex>
				</Flex>
			</Flex>

			<Box className={styles.container} ref={containerRef}>
				{loading && items.length === 0 && (
					<Flex align="center" gap="2" className={styles.loading}>
						<Spinner size="2" />
						<Text size="2" color="gray">
							正在获取稿件列表...
						</Text>
					</Flex>
				)}
				{error && (
					<Text size="2" color="red" className={styles.error}>
						{error}
					</Text>
				)}
				{selectedUser && (
					<Flex align="center" gap="2" className={styles.filterBar}>
						<Text size="2" color="gray">
							用户筛选
						</Text>
						<Box className={styles.filterChip}>
							<Flex align="center" gap="1">
								<Text size="2" weight="medium">
									@{selectedUser}
								</Text>
								<Box className={styles.filterCount}>
									<Text size="1" weight="medium">
										{filteredItems.length}
									</Text>
								</Box>
							</Flex>
						</Box>
						<Button
							size="1"
							variant="soft"
							color="gray"
							onClick={() => setSelectedUser(null)}
						>
							清除
						</Button>
					</Flex>
				)}
				<Box className={styles.grid}>
					{groupedCards.map((group) => {
						const item = group.latestItem;
						const itemId = group.key;
						const latestReviewedByUser =
							isGitHubPullRequest(item) &&
							reviewedByUserMap[item.number] === true;
						const isExpanded =
							(expandedGroup && expandedGroup.group.key === group.key) ||
							(expandedCard &&
								group.items.some(
									(groupItem) =>
										getReviewItemKey(groupItem) ===
										getReviewItemKey(expandedCard.item),
								));
						const isPlaceholder = Boolean(isExpanded);
						const placeholderStyle =
							isPlaceholder && expandedCard
								? { height: expandedCard.from.height }
								: isPlaceholder && expandedGroup
									? { height: expandedGroup.from.height }
								: undefined;
						return (
							<ReviewSmallCard
								key={itemId}
								item={item}
								hiddenLabelSet={hiddenLabelSet}
								reviewedByUser={latestReviewedByUser}
								onSelectUser={(user) =>
									setSelectedUser((prev) => (prev === user ? null : user))
								}
								className={`${
									isGitHubPullRequest(item) &&
									reviewSession?.prNumber === item.number
										? styles.reviewCard
										: ""
								} ${group.items.length > 1 ? styles.groupedCard : ""} ${
									isPlaceholder ? styles.cardPlaceholder : ""
								}`}
								onClick={(event) => handleGroupClick(group, event)}
								cardRef={setCardRef(itemId)}
								style={placeholderStyle}
								contentHidden={isPlaceholder}
								childrenBeforeContent={
									group.items.length > 1 ? (
										<>
											<Box className={styles.cardStackLayerOne} />
											<Box className={styles.cardStackLayerTwo} />
											<Box className={styles.groupCountBadge}>
												<Text size="1" weight="medium">
													{group.items.length}
												</Text>
											</Box>
										</>
									) : null
								}
							/>
						);
					})}
				</Box>
				{expandedGroup && (
					<Box
						className={`${styles.overlay} ${
							expandedGroup.phase === "open" ? styles.overlayVisible : ""
						}`}
						style={{
							inset: `${expandedGroup.overlayTopInset}px 0 ${expandedGroup.overlayBottomInset}px 0`,
						}}
						onClick={closeGroupPreview}
					>
						<Card
							className={`${styles.overlayCard} ${styles.overlayCardExpanded} ${styles.overlayCardDetail} ${styles.groupPreviewPanel} ${
								expandedGroup.phase === "open"
									? styles.overlayCardDetailVisible
									: ""
							}`}
							style={{
								left: expandedGroup.to.left,
								top: expandedGroup.to.top,
								width: expandedGroup.to.width,
								height: expandedGroup.to.height,
								transform:
									expandedGroup.phase === "opening" ||
									expandedGroup.phase === "closing"
										? `translate(${expandedGroup.from.left - expandedGroup.to.left}px, ${expandedGroup.from.top - expandedGroup.to.top}px) scale(${expandedGroup.from.width / Math.max(expandedGroup.to.width, 1)}, ${expandedGroup.from.height / Math.max(expandedGroup.to.height, 1)})`
										: "translate(0, 0) scale(1, 1)",
							}}
							onClick={(event) => event.stopPropagation()}
						>
							<Flex
								align="center"
								justify="between"
								className={styles.groupPreviewHeader}
							>
								<Flex direction="column" gap="1">
									<Text size="2" weight="medium">
										{expandedGroup.group.username
											? `@${expandedGroup.group.username}`
											: "未提到用户"}
									</Text>
									<Text size="1" color="gray">
										{expandedGroup.group.items.length} 份投稿
									</Text>
								</Flex>
								<Text size="1" color="gray">
									最新投稿在上
								</Text>
							</Flex>
							<Box
								className={styles.groupPreviewGrid}
								style={{
									gridTemplateColumns: `repeat(${expandedGroup.columns}, minmax(0, 1fr))`,
								}}
							>
								{expandedGroup.group.items.map((item) => {
									const previewKey = `${expandedGroup.group.key}:${getReviewItemKey(
										item,
									)}`;
									const itemReviewedByUser =
										isGitHubPullRequest(item) &&
										reviewedByUserMap[item.number] === true;
									return (
										<ReviewSmallCard
											key={previewKey}
											item={item}
											hiddenLabelSet={hiddenLabelSet}
											reviewedByUser={itemReviewedByUser}
											onSelectUser={(user) =>
												setSelectedUser((prev) =>
													prev === user ? null : user,
												)
											}
											className={`${styles.groupPreviewCard} ${
												isGitHubPullRequest(item) &&
												reviewSession?.prNumber === item.number
													? styles.reviewCard
													: ""
											}`}
											onClick={(event) =>
												handleGroupPreviewCardClick(item, event)
											}
										/>
									);
								})}
							</Box>
						</Card>
						<Card
							className={`${styles.overlayCard} ${styles.overlayCardShell} ${
								expandedGroup.phase === "open"
									? styles.overlayCardShellHidden
									: ""
							}`}
							style={{
								left: expandedGroup.from.left,
								top: expandedGroup.from.top,
								width: expandedGroup.from.width,
								height: expandedGroup.from.height,
								transform:
									expandedGroup.phase === "opening" ||
									expandedGroup.phase === "closing"
										? "translate(0, 0) scale(1, 1)"
										: `translate(${expandedGroup.to.left - expandedGroup.from.left}px, ${expandedGroup.to.top - expandedGroup.from.top}px) scale(${expandedGroup.to.width / expandedGroup.from.width}, ${expandedGroup.to.height / expandedGroup.from.height})`,
								filter:
									expandedGroup.phase === "opening" ||
									expandedGroup.phase === "closing"
										? "brightness(1.08)"
										: "brightness(1)",
							}}
							onClick={(event) => event.stopPropagation()}
						/>
					</Box>
				)}
				{expandedCard && (
					<Box
						className={`${styles.overlay} ${
							expandedCard.phase === "open" ? styles.overlayVisible : ""
						}`}
						style={{
							inset: `${expandedCard.overlayTopInset}px 0 ${expandedCard.overlayBottomInset}px 0`,
						}}
						onClick={closeExpanded}
					>
						<Card
							className={`${styles.overlayCard} ${styles.overlayCardExpanded} ${styles.overlayCardDetail} ${
								expandedCard.phase === "open"
									? styles.overlayCardDetailVisible
									: ""
							}`}
							style={{
								left: expandedCard.to.left,
								top: expandedCard.to.top,
								width: expandedCard.to.width,
								height: expandedCard.to.height,
								transform:
									expandedCard.phase === "opening" ||
									expandedCard.phase === "closing"
										? `translate(${expandedCard.from.left - expandedCard.to.left}px, ${expandedCard.from.top - expandedCard.to.top}px) scale(${expandedCard.from.width / Math.max(expandedCard.to.width, 1)}, ${expandedCard.from.height / Math.max(expandedCard.to.height, 1)})`
										: "translate(0, 0) scale(1, 1)",
							}}
							onClick={(event) => event.stopPropagation()}
						>
							<ReviewExpandedContent
								item={expandedCard.item}
								hiddenLabelSet={hiddenLabelSet}
								audioLoadPendingId={audioLoadPendingId}
								lastNeteaseIdByPr={lastNeteaseIdByPr}
								onOpenFile={handleOpenFile}
								reviewedByUser={
									isGitHubPullRequest(expandedCard.item) &&
									reviewedByUserMap[expandedCard.item.number] === true
								}
								repoOwner="amll-dev"
								repoName="amll-ttml-db"
								styles={styles}
							/>
						</Card>
						<Card
							className={`${styles.overlayCard} ${styles.overlayCardShell} ${
								expandedCard.phase === "open"
									? styles.overlayCardShellHidden
									: ""
							}`}
							style={{
								left: expandedCard.from.left,
								top: expandedCard.from.top,
								width: expandedCard.from.width,
								height: expandedCard.from.height,
								transform:
									expandedCard.phase === "opening" ||
									expandedCard.phase === "closing"
										? "translate(0, 0) scale(1, 1)"
										: `translate(${expandedCard.to.left - expandedCard.from.left}px, ${expandedCard.to.top - expandedCard.from.top}px) scale(${expandedCard.to.width / expandedCard.from.width}, ${expandedCard.to.height / expandedCard.from.height})`,
								filter:
									expandedCard.phase === "opening" ||
									expandedCard.phase === "closing"
										? "brightness(1.08)"
										: "brightness(1)",
							}}
							onClick={(event) => event.stopPropagation()}
						/>
					</Box>
				)}
			</Box>
			<NeteaseIdSelectDialog
				open={neteaseIdDialog.open}
				ids={neteaseIdDialog.ids}
				onSelect={neteaseIdDialog.onSelect}
				onClose={neteaseIdDialog.onClose}
			/>
		</Box>
	);
};

export default ReviewPage;
