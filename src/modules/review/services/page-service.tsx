import { Box, Button, Card, Flex, Spinner, Text, Avatar } from "@radix-ui/themes";
import {
	type MouseEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { NeteaseIdSelectDialog } from "$/modules/ncm/modals/NeteaseIdSelectDialog";
import { ReviewExpandedContent } from "$/modules/review/modals/ReviewCardGroup";
import {
	renderCardContent,
	isGitHubPullRequest,
	isLyricsSiteSubmission,
	getReviewItemId,
	getReviewItemCreatedAt,
	type ReviewItem,
	type ReviewPullRequest,
} from "./card-service";
import { useReviewPageLogic } from "./page-hooks";
import { useLyricsSiteAuth } from "./remote-service";
import { useLyricsSiteReviewService } from "./lyrics-site-review-service";
import styles from "../index.module.css";

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
			hasPriorityLabel: isGitHubPullRequest(item) && item.labels.some(
				(label) => label.name.trim() === priorityLabelName,
			),
		}));
		itemsWithMeta.sort((a, b) => {
			if (a.hasPriorityLabel !== b.hasPriorityLabel) {
				return a.hasPriorityLabel ? -1 : 1;
			}
			return b.createdAt - a.createdAt;
		});
		return itemsWithMeta.map((meta) => meta.item);
	}, [filteredItems]);

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

	const openExpanded = useCallback(
		(item: ReviewItem, rect: DOMRect) => {
			if (closeTimerRef.current) {
				window.clearTimeout(closeTimerRef.current);
				closeTimerRef.current = null;
			}
			const overlayTopInset = getOverlayTopInset();
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
				item,
				from: rect,
				to: toRect,
				phase: "opening",
				overlayTopInset,
			});
			requestAnimationFrame(() => {
				setExpandedCard((prev) =>
					prev && prev.phase === "opening"
						? { ...prev, phase: "open" }
						: prev,
				);
			});
		},
		[getOverlayTopInset],
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
		const listSize = sortedItems.length;
		const prefersReducedMotion =
			typeof window !== "undefined" &&
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const shouldAnimate = !prefersReducedMotion && listSize > 0 && listSize <= 140;
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
	});

	useEffect(() => {
		return () => {
			if (closeTimerRef.current) {
				window.clearTimeout(closeTimerRef.current);
			}
		};
	}, []);

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
							<Button size="1" variant="soft" color="gray" onClick={logoutLyricsSite}>
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
		<Box className={styles.container} ref={containerRef}>
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
										<span style={{ color: "var(--green-9)", marginLeft: "8px" }}>
											✓ 审核员
										</span>
									)}
								</Text>
							</Flex>
							<Button size="1" variant="soft" color="gray" onClick={logoutLyricsSite}>
								登出
							</Button>
						</>
					) : (
						<Button size="2" variant="soft" onClick={initiateLyricsSiteLogin}>
							登录歌词站
						</Button>
					)}
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
				{sortedItems.map((item) => {
					const itemId = getReviewItemId(item);
					const isExpanded = expandedCard && getReviewItemId(expandedCard.item) === itemId;
					const isPlaceholder =
						isExpanded && expandedCard?.phase === "open";
					const placeholderStyle =
						isPlaceholder && expandedCard
							? { height: expandedCard.from.height }
							: undefined;
					return (
						<Card
							key={itemId}
							className={`${styles.card} ${
								isGitHubPullRequest(item) && reviewSession?.prNumber === item.number ? styles.reviewCard : ""
							} ${isPlaceholder ? styles.cardPlaceholder : ""}`}
							onClick={(event) => handleCardClick(item, event)}
							ref={setCardRef(itemId)}
							style={placeholderStyle}
						>
							{isPlaceholder
								? null
								: renderCardContent({
										item,
										hiddenLabelSet,
										styles,
										reviewedByUser: isGitHubPullRequest(item) && reviewedByUserMap[item.number] === true,
										onSelectUser: (user) =>
											setSelectedUser((prev) => (prev === user ? null : user)),
								  })}
						</Card>
					);
				})}
			</Box>
			{expandedCard && (
				<Box
					className={`${styles.overlay} ${
						expandedCard.phase === "open" ? styles.overlayVisible : ""
					}`}
					style={{
						inset: `${expandedCard.overlayTopInset}px 0 0 0`,
					}}
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
						<ReviewExpandedContent
							item={expandedCard.item}
							hiddenLabelSet={hiddenLabelSet}
							audioLoadPendingId={audioLoadPendingId}
							lastNeteaseIdByPr={lastNeteaseIdByPr}
							onOpenFile={handleOpenFile}
							reviewedByUser={isGitHubPullRequest(expandedCard.item) && reviewedByUserMap[expandedCard.item.number] === true}
							repoOwner="Steve-xmh"
							repoName="amll-ttml-db"
							styles={styles}
						/>
					</Card>
				</Box>
			)}
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
