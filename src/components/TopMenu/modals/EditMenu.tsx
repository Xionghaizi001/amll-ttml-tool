import { Button, DropdownMenu } from "@radix-ui/themes";
import { Toolbar } from "radix-ui";
import type { CSSProperties } from "react";
import { Trans } from "react-i18next";
import {
	cmdDeleteSelection,
	cmdOpenMetadataEditor,
	cmdOpenSettings,
	cmdRedo,
	cmdSelectAll,
	cmdSelectInverted,
	cmdSelectWordsOfMatchedSelection,
	cmdUndo,
	cmdUnselectAll,
} from "$/modules/keyboard/commands";
import { ContributionMenuItems } from "$/plugins/ui/ContributionMenuItems";
import { CommandMenuItem } from "../CommandMenuItem";

type EditMenuProps = {
	variant: "toolbar" | "submenu";
	triggerStyle?: CSSProperties;
	buttonStyle?: CSSProperties;
};

const EditMenuItems = () => {
	return (
		<>
			<CommandMenuItem commandId={cmdUndo.id}>
				<Trans i18nKey="topBar.menu.undo">撤销</Trans>
			</CommandMenuItem>
			<CommandMenuItem commandId={cmdRedo.id}>
				<Trans i18nKey="topBar.menu.redo">重做</Trans>
			</CommandMenuItem>
			<DropdownMenu.Separator />
			<CommandMenuItem commandId={cmdSelectAll.id}>
				<Trans i18nKey="topBar.menu.selectAllLines">选中所有歌词行</Trans>
			</CommandMenuItem>
			<CommandMenuItem commandId={cmdUnselectAll.id}>
				<Trans i18nKey="topBar.menu.unselectAllLines">取消选中所有歌词行</Trans>
			</CommandMenuItem>
			<CommandMenuItem commandId={cmdSelectInverted.id}>
				<Trans i18nKey="topBar.menu.invertSelectAllLines">反选所有歌词行</Trans>
			</CommandMenuItem>
			<CommandMenuItem commandId={cmdSelectWordsOfMatchedSelection.id}>
				<Trans i18nKey="topBar.menu.selectWordsOfMatchedSelection">
					选择单词匹配项
				</Trans>
			</CommandMenuItem>
			<DropdownMenu.Separator />
			<CommandMenuItem commandId={cmdDeleteSelection.id}>
				<Trans i18nKey="contextMenu.deleteWords">删除选定单词</Trans>
			</CommandMenuItem>
			<DropdownMenu.Separator />
			<ContributionMenuItems location="menu.edit" />
			<DropdownMenu.Separator />
			<CommandMenuItem commandId={cmdOpenMetadataEditor.id}>
				<Trans i18nKey="topBar.menu.editMetadata">编辑歌词元数据</Trans>
			</CommandMenuItem>
			<DropdownMenu.Separator />
			<CommandMenuItem commandId={cmdOpenSettings.id}>
				<Trans i18nKey="settingsDialog.title">首选项</Trans>
			</CommandMenuItem>
		</>
	);
};

export const EditMenu = (props: EditMenuProps) => {
	if (props.variant === "submenu") {
		return (
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					<Trans i18nKey="topBar.menu.edit">编辑</Trans>
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<EditMenuItems />
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		);
	}

	return (
		<DropdownMenu.Root>
			<Toolbar.Button asChild>
				<DropdownMenu.Trigger style={props.triggerStyle}>
					<Button variant="soft" style={props.buttonStyle}>
						<Trans i18nKey="topBar.menu.edit">编辑</Trans>
					</Button>
				</DropdownMenu.Trigger>
			</Toolbar.Button>
			<DropdownMenu.Content>
				<EditMenuItems />
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	);
};
