import { Box, Card, Flex, Spinner, Text } from "@radix-ui/themes";
import {
	type MouseEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { renderExpandedContent } from "$/modules/review/modals/ReviewCardGroup";
import { renderCardContent, type ReviewPullRequest } from "./card-service";
import { useReviewPageLogic } from "./page-hooks";
import styles from "../index.module.css";

const ReviewPage = () => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const closeTimerRef = useRef<number | null>(null);
	const [expandedCard, setExpandedCard] = useState<{
		pr: ReviewPullRequest;
		from: DOMRect;
		to: DOMRect;
		phase: "opening" | "open" | "closing";
	} | null>(null);
	const {
		audioLoadPendingId,
		error,
		filteredItems,
		handleLoadNeteaseAudio,
		hasAccess,
		hiddenLabelSet,
		items,
		lastNeteaseIdByPr,
		loading,
		openReviewFile,
		reviewSession,
	} = useReviewPageLogic();

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
							repoOwner: "Steve-xmh",
							repoName: "amll-ttml-db",
							styles,
						})}
					</Card>
				</Box>
			)}
		</Box>
	);
};

export default ReviewPage;
