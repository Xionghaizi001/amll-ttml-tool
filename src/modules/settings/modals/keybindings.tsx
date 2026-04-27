import { Box, Switch, Text } from "@radix-ui/themes";
import {
	AutoKeyBindingSettingsPanel,
	KeyBindingsEdit,
} from "$/modules/keyboard/components/SettingsPanel";
import { cmdSyncNextAlt } from "$/modules/keyboard/commands";
import { syncNextDualModeAtom } from "$/modules/settings/states/sync";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";

export const SettingsKeyBindingsDialog = () => {
	const { t } = useTranslation();
	const [syncNextDualMode, setSyncNextDualMode] = useAtom(syncNextDualModeAtom);

	return (
		<AutoKeyBindingSettingsPanel
			shouldRenderCommand={(command) => command.id !== "syncNextAlt"}
			renderAfterCommand={(command) => {
				if (command.id !== "syncNext") {
					return null;
				}

				return (
					<>
						<Box style={{ display: "flex", alignItems: "center" }}>
							{t(
								"settingsDialog.keybindings.syncNextDualMode",
								"打轴 - 步进打轴双键方案",
							)}
						</Box>

						<Box style={{ display: "flex", justifyContent: "flex-start" }}>
							<Text as="label">
								<Switch
									checked={syncNextDualMode}
									onCheckedChange={setSyncNextDualMode}
								/>
							</Text>
						</Box>

						{syncNextDualMode ? (
							<KeyBindingsEdit command={cmdSyncNextAlt} />
						) : null}
					</>
				);
			}}
		/>
	);
};
