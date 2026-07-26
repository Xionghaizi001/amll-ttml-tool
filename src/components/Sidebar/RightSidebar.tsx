import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { annotationSessionAtom } from "$/modules/user/states/annotation-session";
import {
	rightSidebarPanelAtom,
	rightSidebarWidthAtom,
} from "$/states/sidebar.ts";
import { AnnotationPanel } from "$/modules/user/components/AnnotationPanel";
import { ResizableSidebar } from "./ResizableSidebar";

const MIN_WIDTH = 220;

export const RightSidebar = () => {
	const { t } = useTranslation();
	const [activePanel, setActivePanel] = useAtom(rightSidebarPanelAtom);
	const annotationSession = useAtomValue(annotationSessionAtom);
	const prevSessionRef = useRef(annotationSession);

	// 仅在「新建会话」时自动展开；用户关闭后不强制重开。会话清空时关闭。
	useEffect(() => {
		const prev = prevSessionRef.current;
		prevSessionRef.current = annotationSession;
		if (!annotationSession) {
			if (activePanel === "annotations") setActivePanel("none");
			return;
		}
		if (!prev) {
			setActivePanel("annotations");
		}
	}, [annotationSession, activePanel, setActivePanel]);

	return (
		<ResizableSidebar
			side="right"
			panelAtom={rightSidebarPanelAtom}
			widthAtom={rightSidebarWidthAtom}
			closedPanel="none"
			minWidth={MIN_WIDTH}
			maxWidthRatio={0.4}
			titles={{ annotations: t("sidebar.annotations.title", "批注") }}
		>
			{activePanel === "annotations" && <AnnotationPanel />}
		</ResizableSidebar>
	);
};

export default RightSidebar;
