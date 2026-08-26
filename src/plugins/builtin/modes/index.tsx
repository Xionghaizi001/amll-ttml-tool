import { Box } from "@radix-ui/themes";
import { motion } from "framer-motion";
import { type FC, lazy } from "react";
import { extensionRegistry } from "$/plugins/adapters/extension-host";
import { registerHostMode } from "$/plugins/adapters/mode-contributions";

const LyricLinesView = lazy(() => import("$/modules/lyric-editor/components"));
const AMLLWrapper = lazy(() => import("$/components/AMLLWrapper"));
const EditModeRibbonBar = lazy(
	() => import("$/components/RibbonBar/edit-mode"),
);
const SyncModeRibbonBar = lazy(
	() => import("$/components/RibbonBar/sync-mode"),
);
const PreviewModeRibbonBar = lazy(
	() => import("$/components/RibbonBar/preview-mode"),
);

/**
 * Edit and sync share this main view (and a `mainViewKey`), so switching
 * between them keeps the lyric editor mounted exactly as before the mode
 * registry existed.
 */
const LyricEditorMainView: FC = () => (
	<motion.div
		layout="position"
		style={{
			height: "100%",
			maxHeight: "100%",
			overflowY: "hidden",
		}}
		initial={{ opacity: 0 }}
		animate={{ opacity: 1 }}
		exit={{ opacity: 0 }}
	>
		<LyricLinesView />
	</motion.div>
);

const PreviewMainView: FC = () => (
	<Box height="100%" p="2" asChild>
		<motion.div
			layout="position"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
		>
			<AMLLWrapper />
		</motion.div>
	</Box>
);

let registered = false;

/**
 * Registers the builtin Edit/Sync/Preview modes. The owning scope lives for
 * the whole session and is never disposed — that is the host-level guarantee
 * that the edit fail-safe mode cannot be removed or hidden.
 */
export const ensureBuiltinModesRegistered = (): void => {
	if (registered) return;
	registered = true;
	const scope = extensionRegistry.createScope({
		kind: "builtin",
		id: "core.modes",
		trusted: true,
	});
	registerHostMode(scope, {
		modeId: "edit",
		title: { default: "Edit", "zh-CN": "编辑" },
		order: 100,
		mainView: LyricEditorMainView,
		mainViewKey: "edit",
		ribbonView: EditModeRibbonBar,
	});
	registerHostMode(scope, {
		modeId: "sync",
		title: { default: "Sync", "zh-CN": "打轴" },
		order: 200,
		mainView: LyricEditorMainView,
		mainViewKey: "edit",
		ribbonView: SyncModeRibbonBar,
	});
	registerHostMode(scope, {
		modeId: "preview",
		title: { default: "Preview", "zh-CN": "预览" },
		order: 300,
		mainView: PreviewMainView,
		ribbonView: PreviewModeRibbonBar,
	});
};
