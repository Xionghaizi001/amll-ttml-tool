import { useTranslation } from "react-i18next";
import { sidebarPanelAtom, sidebarWidthAtom } from "$/states/sidebar.ts";
import { OutlinePanel } from "./OutlinePanel";
import { ResizableSidebar } from "./ResizableSidebar";
import { useAtomValue } from "jotai";

const MIN_WIDTH = 200;
const MAX_WIDTH = 650;

export const Sidebar = () => {
	const { t } = useTranslation();
	const activePanel = useAtomValue(sidebarPanelAtom);

	return (
		<ResizableSidebar
			side="left"
			panelAtom={sidebarPanelAtom}
			widthAtom={sidebarWidthAtom}
			closedPanel="none"
			minWidth={MIN_WIDTH}
			maxWidth={MAX_WIDTH}
			maxWidthRatio={0.5}
			titles={{ outline: t("sidebar.outline.title", "大纲") }}
		>
			{activePanel === "outline" && <OutlinePanel />}
		</ResizableSidebar>
	);
};

export default Sidebar;
