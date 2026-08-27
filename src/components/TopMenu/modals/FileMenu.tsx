import { Button, DropdownMenu } from "@radix-ui/themes";
import { Toolbar } from "radix-ui";
import type { CSSProperties } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
	cmdNewFile,
	cmdOpenFile,
	cmdOpenFileFromClipboard,
	cmdOpenHistoryRestore,
	cmdSaveFile,
	cmdSaveFileToClipboard,
	cmdSubmitToAMLLDB,
} from "$/modules/keyboard/commands";
import { ImportExportLyric } from "$/modules/project/modals/ImportExportLyric";
import { ContributionMenuItems } from "$/plugins/ui/ContributionMenuItems";
import { CommandMenuItem } from "../CommandMenuItem";

type FileMenuProps = {
	variant: "toolbar" | "submenu";
	buttonStyle?: CSSProperties;
};

const FileMenuItems = () => {
	const { t } = useTranslation();

	return (
		<>
			<CommandMenuItem commandId={cmdNewFile.id}>
				<Trans i18nKey="topBar.menu.newLyric">新建 TTML 文件</Trans>
			</CommandMenuItem>
			<CommandMenuItem commandId={cmdOpenFile.id}>
				<Trans i18nKey="topBar.menu.openLyric">打开 TTML 文件</Trans>
			</CommandMenuItem>
			<CommandMenuItem commandId={cmdOpenFileFromClipboard.id}>
				<Trans i18nKey="topBar.menu.openFromClipboard">
					从剪切板打开 TTML 文件
				</Trans>
			</CommandMenuItem>
			<CommandMenuItem commandId={cmdSaveFile.id}>
				<Trans i18nKey="topBar.menu.saveLyric">保存 TTML 文件</Trans>
			</CommandMenuItem>
			<DropdownMenu.Separator />
			<CommandMenuItem commandId={cmdOpenHistoryRestore.id}>
				{t("topBar.menu.restoreFromHistory", "从历史记录恢复...")}
			</CommandMenuItem>
			<DropdownMenu.Separator />
			<CommandMenuItem commandId={cmdSaveFileToClipboard.id}>
				<Trans i18nKey="topBar.menu.saveLyricToClipboard">
					保存 TTML 文件到剪切板
				</Trans>
			</CommandMenuItem>
			<DropdownMenu.Separator />
			<ImportExportLyric />
			<DropdownMenu.Separator />
			<CommandMenuItem commandId={cmdSubmitToAMLLDB.id}>
				<Trans i18nKey="topBar.menu.uploadToAMLLDB">
					上传到 AMLL 歌词数据库
				</Trans>
			</CommandMenuItem>
			<ContributionMenuItems location="menu.file" withLeadingSeparator />
		</>
	);
};

export const FileMenu = (props: FileMenuProps) => {
	if (props.variant === "submenu") {
		return (
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					<Trans i18nKey="topBar.menu.file">文件</Trans>
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<FileMenuItems />
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		);
	}

	return (
		<DropdownMenu.Root>
			<Toolbar.Button asChild>
				<DropdownMenu.Trigger>
					<Button variant="soft" style={props.buttonStyle}>
						<Trans i18nKey="topBar.menu.file">文件</Trans>
					</Button>
				</DropdownMenu.Trigger>
			</Toolbar.Button>
			<DropdownMenu.Content>
				<FileMenuItems />
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	);
};
