import classNames from "classnames";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AnnotationItem } from "$/modules/user/services/annotation-summary";
import {
	annotationSessionAtom,
	annotationsByLineAtom,
} from "$/modules/user/states/annotation-session";
import {
	rightSidebarPanelAtom,
	outlineJumpActionAtom,
} from "$/states/sidebar";
import styles from "./LineAnnotationRail.module.css";

const COLLAPSE_THRESHOLD_PX = 56;

export const LineAnnotationRail = ({ lineIndex }: { lineIndex: number }) => {
	const { t } = useTranslation();
	const byLine = useAtomValue(annotationsByLineAtom);
	const [session, setSession] = useAtom(annotationSessionAtom);
	const setRightPanel = useSetAtom(rightSidebarPanelAtom);
	const setJumpAction = useSetAtom(outlineJumpActionAtom);
	const items = byLine.get(lineIndex) ?? [];
	const decisions = session?.decisions ?? {};
	const focusedKey = session?.focusedKey ?? null;
	const hostRef = useRef<HTMLDivElement>(null);
	const [collapsed, setCollapsed] = useState(false);

	useLayoutEffect(() => {
		const host = hostRef.current;
		if (!host || items.length <= 1) {
			setCollapsed(false);
			return;
		}
		// 相对当前行卡片高度：内容过高则折叠
		const lineEl = host.closest("[data-line-id]") as HTMLElement | null;
		const lineHeight = lineEl?.offsetHeight ?? 0;
		const natural = host.scrollHeight;
		setCollapsed(lineHeight > 0 && natural > Math.max(lineHeight, COLLAPSE_THRESHOLD_PX));
	}, [items.length, items.map((i) => i.key).join("|")]);

	const openDetail = (focusKey?: string) => {
		setRightPanel("annotations");
		setSession((prev) =>
			prev
				? {
						...prev,
						detailLineIndex: lineIndex,
						focusedKey: focusKey ?? items[0]?.key ?? null,
					}
				: prev,
		);
		setJumpAction({
			id: `__annotation_line__:${lineIndex}`,
			ts: Date.now(),
		});
	};

	const focusOne = (item: AnnotationItem) => {
		setRightPanel("annotations");
		setSession((prev) =>
			prev
				? {
						...prev,
						detailLineIndex: lineIndex,
						focusedKey: item.key,
					}
				: prev,
		);
		setJumpAction({
			id: `__annotation_line__:${lineIndex}`,
			ts: Date.now(),
		});
	};

	if (!session || items.length === 0) return null;

	if (collapsed) {
		return (
			<div className={styles.rail} data-line-annotation-rail={lineIndex}>
				<button
					type="button"
					className={styles.collapsedChip}
					onClick={() => openDetail()}
				>
					{t("annotation.collapsedCount", "{count} 条批注", {
						count: items.length,
					})}
				</button>
			</div>
		);
	}

	return (
		<div
			ref={hostRef}
			className={styles.rail}
			data-line-annotation-rail={lineIndex}
		>
			{items.map((item) => {
				const decision = decisions[item.key] ?? "pending";
				return (
					<button
						key={item.key}
						type="button"
						className={classNames(
							styles.chip,
							styles[`kind_${item.kind}`],
							focusedKey === item.key && styles.focused,
							decision !== "pending" && styles.decided,
						)}
						onClick={() => focusOne(item)}
						title={item.summary}
					>
						<span className={styles.chipText}>{item.summary}</span>
					</button>
				);
			})}
		</div>
	);
};
