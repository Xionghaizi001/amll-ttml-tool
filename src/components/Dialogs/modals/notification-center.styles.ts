import type { CSSProperties } from "react";

export const notificationCenterStyles = {
	notificationCard: (
		accentColor: string,
		clickable: boolean,
	): CSSProperties => ({
		borderLeft: `3px solid var(--${accentColor}-9)`,
		cursor: clickable ? "pointer" : undefined,
	}),
	detailsRoot: {
		width: "100%",
	} satisfies CSSProperties,
	pendingGroupHeader: (accentColor: string): CSSProperties => ({
		borderLeft: `3px solid var(--${accentColor}-9)`,
		cursor: "pointer",
	}),
	groupArrow: (open: boolean): CSSProperties => ({
		display: "inline-block",
		transform: open ? "rotate(90deg)" : "rotate(0deg)",
		transition: "transform 150ms ease",
		color: "var(--gray-10)",
	}),
	flexGrowMinWidth: {
		flex: 1,
		minWidth: 0,
	} satisfies CSSProperties,
	actionColumn: {
		flexShrink: 0,
	} satisfies CSSProperties,
	groupListOffset: {
		paddingLeft: "20px",
	} satisfies CSSProperties,
	emptyIcon: {
		color: "var(--gray-10)",
	} satisfies CSSProperties,
	scrollArea: {
		maxHeight: "420px",
	} satisfies CSSProperties,
	titleText: {
		overflowWrap: "anywhere",
	} satisfies CSSProperties,
};
