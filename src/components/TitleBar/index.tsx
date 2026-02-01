import { Beaker24Regular } from "@fluentui/react-icons";
import { Box, Flex, SegmentedControl, Text } from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import { type FC, useCallback } from "react";
import { useTranslation } from "react-i18next";
import WindowControls from "$/components/WindowControls";
import {
	keySwitchEditModeAtom,
	keySwitchPreviewModeAtom,
	keySwitchSyncModeAtom,
} from "$/states/keybindings.ts";
import {
	selectedLinesAtom,
	selectedWordsAtom,
	ToolMode,
	toolModeAtom,
} from "$/states/main.ts";
import { useKeyBindingAtom } from "$/utils/keybindings.ts";
import { TopMenu } from "../TopMenu/index.tsx";
import styles from "./index.module.css";

export const TitleBar: FC = () => {
	const [toolMode, setToolMode] = useAtom(toolModeAtom);
	const setSelectedLines = useSetImmerAtom(selectedLinesAtom);
	const setSelectedWords = useSetImmerAtom(selectedWordsAtom);
	const { t } = useTranslation();

	const onSwitchEditMode = useCallback(() => {
		setToolMode(ToolMode.Edit);
	}, [setToolMode]);
	const onSwitchSyncMode = useCallback(() => {
		setToolMode(ToolMode.Sync);
	}, [setToolMode]);
	const onSwitchPreviewMode = useCallback(() => {
		setToolMode(ToolMode.Preview);
	}, [setToolMode]);

	useKeyBindingAtom(keySwitchEditModeAtom, onSwitchEditMode);
	useKeyBindingAtom(keySwitchSyncModeAtom, onSwitchSyncMode);
	useKeyBindingAtom(keySwitchPreviewModeAtom, onSwitchPreviewMode);

	return (
		<WindowControls
			startChildren={<TopMenu />}
			titleChildren={
				<SegmentedControl.Root
					value={toolMode}
					onValueChange={(v) => setToolMode(v as ToolMode)}
					// size="1"
				>
					<SegmentedControl.Item value={ToolMode.Edit}>
						{t("topBar.modeBtns.edit", "编辑")}
					</SegmentedControl.Item>
					<SegmentedControl.Item value={ToolMode.Sync}>
						{t("topBar.modeBtns.sync", "打轴")}
					</SegmentedControl.Item>
					<SegmentedControl.Item value={ToolMode.Preview}>
						{t("topBar.modeBtns.preview", "预览")}
					</SegmentedControl.Item>
				</SegmentedControl.Root>
			}
			endChildren={
				!import.meta.env.TAURI_ENV_PLATFORM && (
					<Flex align="center" style={{ marginRight: "12px" }}>
						<Text color="gray" wrap="nowrap" size="2">
							<span className={styles.title}>
								{t("topBar.appName", "Apple Music-like Lyrics TTML Tool")}
							</span>
						</Text>
						<Box
							style={{
								marginLeft: "10px",
								backgroundColor: "var(--accent-a3)",
								borderRadius: "999px",
								padding: "2px 8px",
								display: "flex",
								alignItems: "center",
								gap: "4px",
								color: "var(--accent-11)",
							}}
						>
							<Beaker24Regular style={{ fontSize: 16 }} />
							<Text size="1" weight="medium">
								TEST
							</Text>
						</Box>
					</Flex>
				)
			}
			onSpacerClicked={() => {
				setSelectedLines((o) => o.clear());
				setSelectedWords((o) => o.clear());
			}}
		/>
	);
};
