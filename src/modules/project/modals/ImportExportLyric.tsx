import { DropdownMenu } from "@radix-ui/themes";
import { useSetAtom } from "jotai";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { CommandMenuItem } from "$/components/TopMenu/CommandMenuItem";
import { useLocalCommand } from "$/components/TopMenu/useLocalCommand";
import { extensionRegistry } from "$/plugins/adapters/extension-host";
import {
	formatExportCommandId,
	formatImportCommandId,
} from "$/plugins/adapters/format-commands";
import { localizeText } from "$/plugins/ui/localize";
import {
	importFromLRCLIBDialogAtom,
	importFromTextDialogAtom,
} from "$/states/dialogs.ts";

const commandIds = {
	importText: "core.file.import.text",
	importLrcLib: "core.file.import.lrclib",
} as const;

/**
 * 导入/导出子菜单：条目完全由 format provider registry 驱动。
 * provider（含插件注册的）出现即出现，随 scope dispose 消失；
 * 菜单项只引用由宿主派生的 command ID。
 */
export const ImportExportLyric = () => {
	const setImportFromTextDialog = useSetAtom(importFromTextDialogAtom);
	const setImportFromLRCLIBDialog = useSetAtom(importFromLRCLIBDialogAtom);
	const { t, i18n } = useTranslation();

	useSyncExternalStore(
		(listener) => {
			const subscription = extensionRegistry.contributions.subscribe(listener);
			return () => subscription.dispose();
		},
		() => extensionRegistry.contributions.getRevision(),
		() => 0,
	);
	const providers = extensionRegistry.contributions
		.getFormatProviders()
		.filter((provider) => !provider.hostNative);
	const importProviders = providers.filter((provider) => provider.importer);
	const exportProviders = providers.filter((provider) => provider.exporter);

	useLocalCommand(commandIds.importText, () => setImportFromTextDialog(true));
	useLocalCommand(commandIds.importLrcLib, () =>
		setImportFromLRCLIBDialog(true),
	);

	return (
		<>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					{t("topBar.menu.importLyric.import", "导入歌词...")}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<CommandMenuItem commandId={commandIds.importText}>
						{t("topBar.menu.importLyric.fromPlainText", "从纯文本导入")}
					</CommandMenuItem>
					<CommandMenuItem commandId={commandIds.importLrcLib}>
						{t("topBar.menu.importLyric.fromLRCLIB", "从 LRCLIB 导入...")}
					</CommandMenuItem>
					{importProviders.map((provider) => (
						<CommandMenuItem
							key={provider.formatId}
							commandId={formatImportCommandId(provider.formatId)}
						>
							{t("topBar.menu.importLyric.fromFormatFile", "从 {name} 文件导入", {
								name: localizeText(provider.title, i18n.language),
							})}
						</CommandMenuItem>
					))}
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					{t("topBar.menu.exportLyric.export", "导出歌词...")}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					{exportProviders.map((provider) => (
						<CommandMenuItem
							key={provider.formatId}
							commandId={formatExportCommandId(provider.formatId)}
						>
							{t("topBar.menu.exportLyric.toFormat", "导出到 {name}", {
								name: localizeText(provider.title, i18n.language),
							})}
						</CommandMenuItem>
					))}
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		</>
	);
};
