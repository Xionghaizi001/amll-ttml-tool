import { Button, DropdownMenu } from "@radix-ui/themes";
import { Toolbar } from "radix-ui";
import type { CSSProperties } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
	cmdAutoRuby,
	cmdAutoSegment,
	cmdCheckRomanizationWarnings,
	cmdDistributeRomanization,
	cmdOpenAdvancedSegmentation,
	cmdOpenLatencyTest,
	cmdOpenPluginStore,
	cmdOpenSyllableSmoothing,
	cmdRubySegment,
	cmdSyncLineTimestamps,
} from "$/modules/keyboard/commands";
import { ContributionMenuItems } from "$/plugins/ui/ContributionMenuItems";
import { CommandMenuItem } from "../CommandMenuItem";

type ToolMenuProps = {
	variant: "toolbar" | "submenu";
	triggerStyle?: CSSProperties;
	buttonStyle?: CSSProperties;
};

const ToolMenuItems = () => {
	const { t } = useTranslation();

	return (
		<>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					{t("topBar.menu.segmentationTools", "分词")}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<CommandMenuItem commandId={cmdAutoSegment.id}>
						{t("topBar.menu.autoSegment", "自动分词")}
					</CommandMenuItem>
					<CommandMenuItem commandId={cmdRubySegment.id}>
						{t("topBar.menu.rubySegment", "注音分词")}
					</CommandMenuItem>
					<CommandMenuItem commandId={cmdOpenAdvancedSegmentation.id}>
						{t("topBar.menu.advancedSegment", "高级分词...")}
					</CommandMenuItem>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
			<CommandMenuItem commandId={cmdOpenSyllableSmoothing.id}>
				{t("topBar.menu.syllableSmoothing", "平滑时间轴...")}
			</CommandMenuItem>
			<CommandMenuItem commandId={cmdSyncLineTimestamps.id}>
				{t("topBar.menu.syncLineTimestamps", "同步行时间戳")}
			</CommandMenuItem>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					{t("topBar.menu.perWordRomanization.index", "逐字音译")}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<CommandMenuItem commandId={cmdDistributeRomanization.id}>
						{t(
							"topBar.menu.perWordRomanization.distribute",
							"自动分配罗马音...",
						)}
					</CommandMenuItem>
					<CommandMenuItem commandId={cmdCheckRomanizationWarnings.id}>
						{t("topBar.menu.perWordRomanization.check", "检查")}
					</CommandMenuItem>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
			<CommandMenuItem commandId={cmdAutoRuby.id}>
				{t("topBar.menu.perWordRomanization.autoRuby", "自动注音")}
			</CommandMenuItem>
			<CommandMenuItem commandId={cmdOpenLatencyTest.id}>
				{t("settingsDialog.common.latencyTest", "音频/输入延迟测试")}
			</CommandMenuItem>
			<DropdownMenu.Separator />
			<CommandMenuItem commandId={cmdOpenPluginStore.id}>
				{t("topBar.menu.pluginStore", "插件商店...")}
			</CommandMenuItem>
			<ContributionMenuItems location="menu.tool" withLeadingSeparator />
		</>
	);
};

export const ToolMenu = (props: ToolMenuProps) => {
	if (props.variant === "submenu") {
		return (
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					<Trans i18nKey="topBar.menu.tool">工具</Trans>
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<ToolMenuItems />
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		);
	}

	return (
		<DropdownMenu.Root>
			<Toolbar.Button asChild>
				<DropdownMenu.Trigger style={props.triggerStyle}>
					<Button variant="soft" style={props.buttonStyle}>
						<Trans i18nKey="topBar.menu.tool">工具</Trans>
					</Button>
				</DropdownMenu.Trigger>
			</Toolbar.Button>
			<DropdownMenu.Content>
				<ToolMenuItems />
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	);
};
