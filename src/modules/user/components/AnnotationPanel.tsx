import {
	ArrowLeft16Regular,
	Checkmark16Regular,
	Dismiss16Regular,
} from "@fluentui/react-icons";
import { Badge, Box, Button, Flex, IconButton, Text } from "@radix-ui/themes";
import classNames from "classnames";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AnnotationItem } from "../services/annotation-summary";
import {
	annotationDecisionMapAtom,
	annotationItemsAtom,
	annotationSessionAtom,
	annotationsByLineAtom,
	closeAnnotationLineDetailAtom,
	documentAnnotationItemsAtom,
	focusAnnotationAtom,
	syncAnnotationAppliedLyricsAtom,
} from "../states/annotation-session";
import { AnnotationSummaryText } from "./AnnotationSummaryText";
import styles from "./AnnotationPanel.module.css";

const DecisionBadge = ({
	decision,
}: {
	decision: "pending" | "accepted" | "rejected";
}) => {
	if (decision === "accepted")
		return (
			<Badge size="1" color="green" variant="soft">
				已接受
			</Badge>
		);
	if (decision === "rejected")
		return (
			<Badge size="1" color="gray" variant="soft">
				已拒绝
			</Badge>
		);
	return (
		<Badge size="1" color="blue" variant="soft">
			待处理
		</Badge>
	);
};

const AnnotationRow = ({
	item,
	decision,
	focused,
	onFocus,
	onAccept,
	onReject,
}: {
	item: AnnotationItem;
	decision: "pending" | "accepted" | "rejected";
	focused: boolean;
	onFocus: () => void;
	onAccept: () => void;
	onReject: () => void;
}) => {
	const { t } = useTranslation();
	return (
		<div
			className={classNames(
				styles.annotationItem,
				focused && styles.focused,
				styles[`kind_${item.kind}`],
				decision !== "pending" && styles.decided,
			)}
			data-annotation-key={item.key}
			onClick={onFocus}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onFocus();
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className={styles.annotationBody}>
				<div className={styles.kindDot} data-kind={item.kind} />
				<div className={styles.annotationText}>
					<Text size="2" className={styles.summary} asChild>
						<span>
							<AnnotationSummaryText summary={item.summary} />
						</span>
					</Text>
					<Flex gap="2" align="center" mt="1">
						<DecisionBadge decision={decision} />
						<Text size="1" color="gray" className={styles.pathHint}>
							{item.path.join(" / ")}
						</Text>
					</Flex>
				</div>
			</div>
			<Flex
				gap="1"
				className={styles.actions}
				onClick={(e) => e.stopPropagation()}
			>
				<IconButton
					size="1"
					variant={decision === "accepted" ? "solid" : "soft"}
					color="green"
					title={t("annotation.accept", "接受")}
					onClick={onAccept}
				>
					<Checkmark16Regular />
				</IconButton>
				<IconButton
					size="1"
					variant={decision === "rejected" ? "solid" : "soft"}
					color="red"
					title={t("annotation.reject", "拒绝")}
					onClick={onReject}
				>
					<Dismiss16Regular />
				</IconButton>
			</Flex>
		</div>
	);
};

export const AnnotationPanel = () => {
	const { t } = useTranslation();
	const [session, setSession] = useAtom(annotationSessionAtom);
	const items = useAtomValue(annotationItemsAtom);
	const byLine = useAtomValue(annotationsByLineAtom);
	const documentItems = useAtomValue(documentAnnotationItemsAtom);
	const decisions = useAtomValue(annotationDecisionMapAtom);
	const focusAnnotation = useSetAtom(focusAnnotationAtom);
	const closeLineDetail = useSetAtom(closeAnnotationLineDetailAtom);
	const syncAppliedLyrics = useSetAtom(syncAnnotationAppliedLyricsAtom);

	const detailLineIndex = session?.detailLineIndex ?? null;
	const focusedKey = session?.focusedKey ?? null;

	// 决策变更后把已接受变更应用到编辑器文件
	const decisionsFingerprint = useMemo(
		() =>
			session
				? Object.entries(session.decisions)
						.map(([key, value]) => `${key}:${value}`)
						.sort()
						.join("|")
				: "",
		[session],
	);
	const lastSyncedFingerprint = useRef<string | null>(null);
	useEffect(() => {
		if (!session) {
			lastSyncedFingerprint.current = null;
			return;
		}
		if (lastSyncedFingerprint.current === decisionsFingerprint) return;
		lastSyncedFingerprint.current = decisionsFingerprint;
		syncAppliedLyrics();
	}, [session, decisionsFingerprint, syncAppliedLyrics]);

	const setDecision = useCallback(
		(key: string, decision: "accepted" | "rejected" | "pending") => {
			setSession((prev) => {
				if (!prev) return prev;
				const current = prev.decisions[key] ?? "pending";
				// 再次点击同一决策 → 回到待处理，便于撤销
				const nextDecision = current === decision ? "pending" : decision;
				return {
					...prev,
					decisions: { ...prev.decisions, [key]: nextDecision },
				};
			});
		},
		[setSession],
	);

	const setAll = useCallback(
		(decision: "accepted" | "rejected") => {
			setSession((prev) => {
				if (!prev) return prev;
				const next = { ...prev.decisions };
				const targetItems =
					prev.detailLineIndex === null
						? items
						: (byLine.get(prev.detailLineIndex) ?? []);
				for (const item of targetItems) {
					next[item.key] = decision;
				}
				return { ...prev, decisions: next };
			});
		},
		[byLine, items, setSession],
	);

	const focusItem = useCallback(
		(item: AnnotationItem) => {
			focusAnnotation({
				lineIndex: item.lineIndex,
				focusedKey: item.key,
				openLineDetail: true,
			});
		},
		[focusAnnotation],
	);

	const lineGroups = useMemo(() => {
		return Array.from(byLine.entries())
			.sort(([a], [b]) => a - b)
			.map(([lineIndex, lineItems]) => ({ lineIndex, items: lineItems }));
	}, [byLine]);

	if (!session) {
		return (
			<div className={styles.empty}>
				<Text size="2" color="gray">
					{t("annotation.empty", "当前没有可处理的审阅批注")}
				</Text>
			</div>
		);
	}

	const detailItems =
		detailLineIndex === null ? null : (byLine.get(detailLineIndex) ?? []);

	return (
		<div className={styles.panel}>
			<div className={styles.toolbar}>
				{detailLineIndex !== null ? (
					<Button
						size="1"
						variant="ghost"
						color="gray"
						onClick={() => closeLineDetail()}
					>
						<ArrowLeft16Regular />
						{t("annotation.back", "返回")}
					</Button>
				) : (
					<Text size="1" color="gray">
						{t("annotation.count", "{count} 条批注", { count: items.length })}
					</Text>
				)}
				<Flex gap="2">
					<Button
						size="1"
						variant="soft"
						color="green"
						onClick={() => setAll("accepted")}
					>
						{t("annotation.acceptAll", "全部接受")}
					</Button>
					<Button
						size="1"
						variant="soft"
						color="red"
						onClick={() => setAll("rejected")}
					>
						{t("annotation.rejectAll", "全部拒绝")}
					</Button>
				</Flex>
			</div>

			{detailLineIndex !== null && detailItems ? (
				<div className={styles.list}>
					<Text size="2" weight="medium" mb="2">
						{t("annotation.lineDetail", "第 {n} 行", {
							n: detailLineIndex + 1,
						})}
					</Text>
					{detailItems.map((item) => (
						<AnnotationRow
							key={item.key}
							item={item}
							decision={decisions[item.key] ?? "pending"}
							focused={focusedKey === item.key}
							onFocus={() => focusItem(item)}
							onAccept={() => setDecision(item.key, "accepted")}
							onReject={() => setDecision(item.key, "rejected")}
						/>
					))}
				</div>
			) : (
				<div className={styles.list}>
					{documentItems.length > 0 && (
						<section className={styles.group}>
							<Text size="1" color="gray" className={styles.groupTitle}>
								{t("annotation.document", "文档级")}
							</Text>
							{documentItems.map((item) => (
								<AnnotationRow
									key={item.key}
									item={item}
									decision={decisions[item.key] ?? "pending"}
									focused={focusedKey === item.key}
									onFocus={() => focusItem(item)}
									onAccept={() => setDecision(item.key, "accepted")}
									onReject={() => setDecision(item.key, "rejected")}
								/>
							))}
						</section>
					)}
					{lineGroups.map(({ lineIndex, items: lineItems }) => (
						<section key={lineIndex} className={styles.group}>
							<button
								type="button"
								className={styles.groupHeader}
								onClick={() =>
									focusAnnotation({
										lineIndex,
										focusedKey: lineItems[0]?.key ?? null,
										openLineDetail: true,
									})
								}
							>
								<Text size="1" color="gray">
									{t("annotation.line", "第 {n} 行", { n: lineIndex + 1 })}
								</Text>
								<Badge size="1" variant="soft">
									{lineItems.length}
								</Badge>
							</button>
							{lineItems.slice(0, 3).map((item) => (
								<AnnotationRow
									key={item.key}
									item={item}
									decision={decisions[item.key] ?? "pending"}
									focused={focusedKey === item.key}
									onFocus={() => focusItem(item)}
									onAccept={() => setDecision(item.key, "accepted")}
									onReject={() => setDecision(item.key, "rejected")}
								/>
							))}
							{lineItems.length > 3 && (
								<button
									type="button"
									className={styles.more}
									onClick={() =>
										focusAnnotation({
											lineIndex,
											focusedKey: lineItems[0]?.key ?? null,
											openLineDetail: true,
										})
									}
								>
									{t("annotation.more", "另有 {count} 条…", {
										count: lineItems.length - 3,
									})}
								</button>
							)}
						</section>
					))}
					{items.length === 0 && (
						<Box p="3">
							<Text size="2" color="gray">
								{t("annotation.noChanges", "报告中没有结构化变更")}
							</Text>
						</Box>
					)}
				</div>
			)}
		</div>
	);
};
