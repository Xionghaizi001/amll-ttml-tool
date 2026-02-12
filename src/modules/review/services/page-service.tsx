import {
	Box,
	Button,
	Card,
	Flex,
	Spinner,
	Text,
	Avatar,
	DropdownMenu,
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
import { NeteaseIdSelectDialog } from "$/modules/ncm/modals/NeteaseIdSelectDialog";
import { ReviewExpandedContent } from "$/modules/review/modals/ReviewCardGroup";
import { renderCardContent, type ReviewPullRequest } from "./card-service";
import { useReviewPageLogic, type ContentSource } from "./page-hooks";
import { useLyricsSiteAuth } from "./remote-service";
import styles from "../index.module.css";

const ReviewPage = () => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const closeTimerRef = useRef<number | null>(null);
	const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
	const cardRectsRef = useRef<Map<number, DOMRect>>(new Map());
	const cardAnimationsRef = useRef<Map<number, Animation>>(new Map());
	const [expandedCard, setExpandedCard] = useState<{
		pr: ReviewPullRequest;
		from: DOMRect;
		to: DOMRect;
		phase: "opening" | "open" | "closing";
		overlayTopInset: number;
	} | null>(null);
	const {
		audioLoadPendingId,
		contentSource,
		error,
		filteredItems,
		hasAccess,
		hasGithubAccess,
		hasLyricsSiteReviewPermission,
		hiddenLabelSet,
		isGithubLoggedIn,
		isLyricsSiteLoggedIn,
		items,
		lastNeteaseIdByPr,
		loading,
		neteaseIdDialog,
		openReviewFile,
		refreshReviewTimeline,
		reviewedByUserMap,
		reviewSession,
		selectedUser,
		setContentSource,
		setSelectedUser,
	} = useReviewPageLogic();
	const {
		user: lyricsSiteUser,
		initiateLogin: initiateLyricsSiteLogin,
		logout: logoutLyricsSite,
	} = useLyricsSiteAuth();

	const priorityLabelName = "参与审核招募";
	const sortedItems = useMemo(() => {
		const itemsWithPriority = filteredItems.map((pr, index) => ({
			pr,
			index,
			hasPriorityLabel: pr.labels.some(
				(label) => label.name.trim() === priorityLabelName,
			),
		}));
		itemsWithPriority.sort((a, b) => {
			if (a.hasPriorityLabel === b.hasPriorityLabel) {
				return a.index - b.index;
			}
			return a.hasPriorityLabel ? -1 : 1;
		});
		return itemsWithPriority.map((item) => item.pr);
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
		(prNumber: number) => (node: HTMLDivElement | null) => {
			if (node) {
				cardRefs.current.set(prNumber, node);
			} else {
				cardRefs.current.delete(prNumber);
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
		(pr: ReviewPullRequest, rect: DOMRect) => {
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
				pr,
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
		(pr: ReviewPullRequest, event: MouseEvent<HTMLDivElement>) => {
			event.stopPropagation();
			void refreshReviewTimeline(pr.number);
			const rect = event.currentTarget.getBoundingClientRect();
			openExpanded(pr, rect);
		},
		[openExpanded, refreshReviewTimeline],
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
		const nextRects = new Map<number, DOMRect>();
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

	// 判断是否需要显示下拉菜单（同时登录了两个账号）
	const showSourceSelector = isGithubLoggedIn && isLyricsSiteLoggedIn;

	// 获取当前显示的用户信息 - 必须在 early return 之前调用
	const currentUserInfo = useMemo(() => {
		if (contentSource === "lyrics-site" && isLyricsSiteLoggedIn && lyricsSiteUser) {
			return {
				source: "lyrics-site" as ContentSource,
				avatarUrl: lyricsSiteUser.avatarUrl,
				displayName: lyricsSiteUser.displayName,
				username: lyricsSiteUser.username,
				hasPermission: lyricsSiteUser.reviewPermission === 1,
				permissionLabel: "审核员",
			};
		}
		// GitHub 用户信息将在后续通过 API 获取，这里先返回基本信息
		return {
			source: "github" as ContentSource,
			avatarUrl: null,
			displayName: "GitHub",
			username: "",
			hasPermission: hasGithubAccess,
			permissionLabel: hasGithubAccess ? "协作者" : "未知身份",
		};
	}, [contentSource, isLyricsSiteLoggedIn, lyricsSiteUser, hasGithubAccess]);

	useEffect(() => {
		return () => {
			if (closeTimerRef.current) {
				window.clearTimeout(closeTimerRef.current);
			}
		};
	}, []);

	// 检查是否有权限（GitHub PAT 或歌词站登录）
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
			{/* 用户信息栏 */}
			<Flex align="center" justify="between" className={styles.userBar}>
				<Flex align="center" gap="2">
					{/* 未登录任何账号 */}
					{!isGithubLoggedIn && !isLyricsSiteLoggedIn ? (
						<Flex align="center" gap="3">
							<Text size="2" color="gray">
								未登录
							</Text>
							<Button size="2" variant="soft" onClick={initiateLyricsSiteLogin}>
								登录歌词站
							</Button>
						</Flex>
					) : showSourceSelector ? (
						<>
							<Avatar
								size="2"
								src={currentUserInfo.avatarUrl || undefined}
								fallback={currentUserInfo.displayName?.[0] || "U"}
								radius="full"
							/>
							<Flex direction="column">
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										<Button variant="ghost" size="2" className={styles.sourceSelector}>
											<Flex align="center" gap="1">
												<Text weight="medium">
													{currentUserInfo.displayName}
												</Text>
												<DropdownMenu.TriggerIcon />
											</Flex>
										</Button>
									</DropdownMenu.Trigger>
									<DropdownMenu.Content>
										<DropdownMenu.Item
											onSelect={() => setContentSource("lyrics-site")}
											disabled={!isLyricsSiteLoggedIn}
										>
											<Flex align="center" gap="2">
												<Box
													style={{
														width: "8px",
														height: "8px",
														borderRadius: "999px",
														backgroundColor:
															contentSource === "lyrics-site"
																? "var(--green-9)"
																: "var(--gray-6)",
													}}
												/>
												<Text>歌词站</Text>
											</Flex>
										</DropdownMenu.Item>
										<DropdownMenu.Item
											onSelect={() => setContentSource("github")}
											disabled={!isGithubLoggedIn}
										>
											<Flex align="center" gap="2">
												<Box
													style={{
														width: "8px",
														height: "8px",
														borderRadius: "999px",
														backgroundColor:
															contentSource === "github"
																? "var(--green-9)"
																: "var(--gray-6)",
													}}
												/>
												<Text>GitHub</Text>
											</Flex>
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
								<Text size="1" color="gray">
									{currentUserInfo.username
										? `@${currentUserInfo.username}`
										: currentUserInfo.permissionLabel}
									{currentUserInfo.hasPermission && (
										<span
											style={{ color: "var(--green-9)", marginLeft: "8px" }}
										>
											✓ {currentUserInfo.permissionLabel}
										</span>
									)}
								</Text>
							</Flex>
							{contentSource === "lyrics-site" ? (
								<Button
									size="1"
									variant="soft"
									color="gray"
									onClick={logoutLyricsSite}
								>
									登出
								</Button>
							) : null}
						</>
					) : isLyricsSiteLoggedIn && lyricsSiteUser ? (
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
						<>
							<Avatar size="2" fallback="G" radius="full" />
							<Flex direction="column">
								<Text size="2" weight="medium">GitHub</Text>
								<Text size="1" color="gray">
									{hasGithubAccess ? "✓ 协作者" : "未知身份"}
								</Text>
							</Flex>
						</>
					)}
				</Flex>
			</Flex>

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
				{sortedItems.map((pr) => {
					const isExpanded = expandedCard?.pr.number === pr.number;
					const isPlaceholder =
						isExpanded && expandedCard?.phase === "open";
					const placeholderStyle =
						isPlaceholder && expandedCard
							? { height: expandedCard.from.height }
							: undefined;
					return (
						<Card
							key={pr.number}
							className={`${styles.card} ${
								reviewSession?.prNumber === pr.number ? styles.reviewCard : ""
							} ${isPlaceholder ? styles.cardPlaceholder : ""}`}
							onClick={(event) => handleCardClick(pr, event)}
							ref={setCardRef(pr.number)}
							style={placeholderStyle}
						>
							{isPlaceholder
								? null
								: renderCardContent({
										pr,
										hiddenLabelSet,
										styles,
										reviewedByUser: reviewedByUserMap[pr.number] === true,
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
							pr={expandedCard.pr}
							hiddenLabelSet={hiddenLabelSet}
							audioLoadPendingId={audioLoadPendingId}
							lastNeteaseIdByPr={lastNeteaseIdByPr}
							onOpenFile={openReviewFile}
							reviewedByUser={reviewedByUserMap[expandedCard.pr.number] === true}
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
