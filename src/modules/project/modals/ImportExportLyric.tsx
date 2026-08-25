import {
	type LyricLine,
	stringifyAss,
	stringifyEslrc,
	stringifyLrc,
	stringifyLys,
	stringifyQrc,
	stringifyYrc,
} from "@applemusic-like-lyrics/lyric";
import { DropdownMenu } from "@radix-ui/themes";
import { useSetAtom, useStore } from "jotai";
import { useTranslation } from "react-i18next";
import saveFile from "save-file";
import {
	getExportFileName,
	prepareLyricLinesForExport,
} from "$/application/lyrics";
import { CommandMenuItem } from "$/components/TopMenu/CommandMenuItem";
import { useLocalCommand } from "$/components/TopMenu/useLocalCommand";
import { useFileOpener } from "$/hooks/useFileOpener.ts";
import {
	importFromLRCLIBDialogAtom,
	importFromTextDialogAtom,
} from "$/states/dialogs.ts";
import { lyricLinesAtom, saveFileNameAtom } from "$/states/main.ts";
import { projectLogger } from "../logger";

const commandIds = {
	importText: "core.file.import.text",
	importLrcLib: "core.file.import.lrclib",
	importLrc: "core.file.import.lrc",
	importEslrc: "core.file.import.eslrc",
	importQrc: "core.file.import.qrc",
	importYrc: "core.file.import.yrc",
	importLys: "core.file.import.lys",
	exportLrc: "core.file.export.lrc",
	exportEslrc: "core.file.export.eslrc",
	exportQrc: "core.file.export.qrc",
	exportYrc: "core.file.export.yrc",
	exportLys: "core.file.export.lys",
	exportAss: "core.file.export.ass",
} as const;

export const ImportExportLyric = () => {
	const store = useStore();
	const setImportFromTextDialog = useSetAtom(importFromTextDialogAtom);
	const setImportFromLRCLIBDialog = useSetAtom(importFromLRCLIBDialogAtom);
	const { openFile } = useFileOpener();
	const { t } = useTranslation();

	const onImportLyric = (extension: string) => {
		const inputEl = document.createElement("input");
		inputEl.type = "file";
		inputEl.accept = `.${extension},*/*`;
		inputEl.addEventListener(
			"change",
			() => {
				const file = inputEl.files?.[0];
				if (!file) return;

				openFile(file, extension);
			},
			{
				once: true,
			},
		);
		inputEl.click();
	};
	const onExportLyric =
		(stringifier: (lines: LyricLine[]) => string, extension: string) =>
		async () => {
			const lyric = store.get(lyricLinesAtom).lyricLines;
			const lyricForExport = prepareLyricLinesForExport(lyric);
			const saveFileName = store.get(saveFileNameAtom);
			const fileName = getExportFileName(saveFileName, extension);
			try {
				const data = stringifier(lyricForExport);
				const b = new Blob([data], { type: "text/plain" });
				await saveFile(b, fileName);
			} catch (e) {
				projectLogger.error(
					`Failed to export lyric with format "${extension}"`,
					e,
				);
			}
		};
	useLocalCommand(commandIds.importText, () => setImportFromTextDialog(true));
	useLocalCommand(commandIds.importLrcLib, () =>
		setImportFromLRCLIBDialog(true),
	);
	useLocalCommand(commandIds.importLrc, () => onImportLyric("lrc"));
	useLocalCommand(commandIds.importEslrc, () => onImportLyric("eslrc"));
	useLocalCommand(commandIds.importQrc, () => onImportLyric("qrc"));
	useLocalCommand(commandIds.importYrc, () => onImportLyric("yrc"));
	useLocalCommand(commandIds.importLys, () => onImportLyric("lys"));
	useLocalCommand(commandIds.exportLrc, onExportLyric(stringifyLrc, "lrc"));
	useLocalCommand(commandIds.exportEslrc, onExportLyric(stringifyEslrc, "lrc"));
	useLocalCommand(commandIds.exportQrc, onExportLyric(stringifyQrc, "qrc"));
	useLocalCommand(commandIds.exportYrc, onExportLyric(stringifyYrc, "yrc"));
	useLocalCommand(commandIds.exportLys, onExportLyric(stringifyLys, "lys"));
	useLocalCommand(commandIds.exportAss, onExportLyric(stringifyAss, "ass"));

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
					<CommandMenuItem commandId={commandIds.importLrc}>
						{t("topBar.menu.importLyric.fromLyRiC", "从 LyRiC 文件导入")}
					</CommandMenuItem>
					<CommandMenuItem commandId={commandIds.importEslrc}>
						{t("topBar.menu.importLyric.fromESLyRiC", "从 ESLyRiC 文件导入")}
					</CommandMenuItem>
					<CommandMenuItem commandId={commandIds.importQrc}>
						{t("topBar.menu.importLyric.fromQRC", "从 QRC 文件导入")}
					</CommandMenuItem>
					<CommandMenuItem commandId={commandIds.importYrc}>
						{t("topBar.menu.importLyric.fromYRC", "从 YRC 文件导入")}
					</CommandMenuItem>
					<CommandMenuItem commandId={commandIds.importLys}>
						{t(
							"topBar.menu.importLyric.fromLrcfySylb",
							"从 Lyricify Syllable 文件导入",
						)}
					</CommandMenuItem>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					{t("topBar.menu.exportLyric.export", "导出歌词...")}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<CommandMenuItem commandId={commandIds.exportLrc}>
						{t("topBar.menu.exportLyric.toLyRiC", "导出到 LyRiC")}
					</CommandMenuItem>
					<CommandMenuItem commandId={commandIds.exportEslrc}>
						{t("topBar.menu.exportLyric.toESLyRiC", "导出到 ESLyRiC")}
					</CommandMenuItem>
					<CommandMenuItem commandId={commandIds.exportQrc}>
						{t("topBar.menu.exportLyric.toQRC", "导出到 QRC")}
					</CommandMenuItem>
					<CommandMenuItem commandId={commandIds.exportYrc}>
						{t("topBar.menu.exportLyric.toYRC", "导出到 YRC")}
					</CommandMenuItem>
					<CommandMenuItem commandId={commandIds.exportLys}>
						{t(
							"topBar.menu.exportLyric.toLrcfySylb",
							"导出到 Lyricify Syllable",
						)}
					</CommandMenuItem>
					<CommandMenuItem commandId={commandIds.exportAss}>
						{t("topBar.menu.exportLyric.toASS", "导出到 ASS 字幕")}
					</CommandMenuItem>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		</>
	);
};
