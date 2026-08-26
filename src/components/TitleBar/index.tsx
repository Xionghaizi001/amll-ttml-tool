import { SegmentedControl, Text } from "@radix-ui/themes";
import { useAtom, useAtomValue } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import WindowControls from "$/components/WindowControls";
import { FALLBACK_MODE_ID } from "$/kernel/extensions";
import { getModeSwitchCommand } from "$/modules/keyboard/mode-commands";
import type { KeyBindingCommand } from "$/modules/keyboard/types";
import { matchesWhenClause } from "$/plugins/adapters/when-clause";
import { localizeText } from "$/plugins/ui/localized-text";
import { useActiveMode } from "$/plugins/ui/mode-host";
import { TitleBarActions } from "$/plugins/ui/TitleBarActions";
import { selectedLinesAtom, selectedWordsAtom, toolModeAtom } from "$/states/main.ts";
import { useKeyBinding } from "$/utils/keybindings.ts";
import { TopMenu } from "../TopMenu/index.tsx";
import styles from "./index.module.css";

const ModeSwitchKeyBinding = ({ command }: { command: KeyBindingCommand }) => {
	const keys = useAtomValue(command.atom);
	useKeyBinding(
		keys,
		() => {
			// A mode hidden by its `when` clause rejects with "disabled"; the
			// shortcut then simply does nothing.
			void command.execute().catch(() => undefined);
		},
		[command],
	);
	return null;
};

export const TitleBar: FC = () => {
	const [toolMode, setToolMode] = useAtom(toolModeAtom);
	const setSelectedLines = useSetImmerAtom(selectedLinesAtom);
	const setSelectedWords = useSetImmerAtom(selectedWordsAtom);
	const { t, i18n } = useTranslation();
	const { modes, activeModeId, activeMode } = useActiveMode(toolMode);

	// The fail-safe edit mode is always offered; every other mode's `when`
	// clause is evaluated fail-closed. The active mode stays visible so the
	// switcher never shows a value without a matching item.
	const visibleModes = modes.filter(
		(mode) =>
			mode.modeId === FALLBACK_MODE_ID ||
			mode.modeId === activeModeId ||
			matchesWhenClause(mode.when),
	);

	return (
		<WindowControls
			startChildren={<TopMenu />}
			titleChildren={
				// Recovery-entry region: the mode switcher renders outside any
				// contribution slot and is marked protected so neither theme CSS
				// nor contributions can cover or restyle it.
				<span data-amll-protected>
					<SegmentedControl.Root
						value={activeModeId}
						onValueChange={(value) => setToolMode(value)}
					>
						{visibleModes.map((mode) => (
							<SegmentedControl.Item key={mode.modeId} value={mode.modeId}>
								{t(
									// Builtin modes keep their locale-file labels; dynamic
									// modes fall back to the contribution's LocalizedText.
									`topBar.modeBtns.${mode.modeId}` as "topBar.modeBtns.edit",
									localizeText(mode.title, i18n.language),
								)}
							</SegmentedControl.Item>
						))}
					</SegmentedControl.Root>
					{modes.map((mode) => {
						const command = getModeSwitchCommand(mode.modeId);
						return command ? (
							<ModeSwitchKeyBinding key={mode.modeId} command={command} />
						) : null;
					})}
				</span>
			}
			endChildren={
				<>
					<TitleBarActions activeMode={activeMode} />
					{!import.meta.env.TAURI_ENV_PLATFORM && (
						<Text color="gray" wrap="nowrap" size="2" mr="2">
							<span className={styles.title}>
								{t("topBar.appName", "Apple Music-like Lyrics TTML Tool")}
							</span>
						</Text>
					)}
				</>
			}
			onSpacerClicked={() => {
				setSelectedLines((o) => o.clear());
				setSelectedWords((o) => o.clear());
			}}
		/>
	);
};
