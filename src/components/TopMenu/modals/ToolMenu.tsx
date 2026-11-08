import { Button, DropdownMenu } from "@radix-ui/themes";
import { Toolbar } from "radix-ui";
import type { CSSProperties } from "react";
import { Trans, useTranslation } from "react-i18next";
import { cmdOpenLatencyTest } from "$/modules/keyboard/commands";
import {
	ContributionMenuItems,
	PINNED_FACTORY_COMMANDS,
	PinnedCommandMenuItem,
	usePinnedCommandTitle,
} from "$/plugins/ui/ContributionMenuItems";
import { CommandMenuItem } from "../CommandMenuItem";

type ToolMenuProps = {
	variant: "toolbar" | "submenu";
	triggerStyle?: CSSProperties;
	buttonStyle?: CSSProperties;
};

const ToolMenuItems = () => {
	const { t } = useTranslation();
	const distributeTitle = usePinnedCommandTitle(
		PINNED_FACTORY_COMMANDS.romanizationDistribute,
	);
	const checkTitle = usePinnedCommandTitle(
		PINNED_FACTORY_COMMANDS.romanizationCheck,
	);
	const hasRomanizationTools =
		distributeTitle !== undefined || checkTitle !== undefined;

	return (
		<>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					{t("topBar.menu.segmentationTools", "分词")}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<PinnedCommandMenuItem commandId={PINNED_FACTORY_COMMANDS.segmentationAuto} />
					<PinnedCommandMenuItem
						commandId={PINNED_FACTORY_COMMANDS.rubySegment}
					/>
					<PinnedCommandMenuItem commandId={PINNED_FACTORY_COMMANDS.segmentationAdvanced} />
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
			<PinnedCommandMenuItem
				commandId={PINNED_FACTORY_COMMANDS.syllableSmoothing}
			/>
			<PinnedCommandMenuItem
				commandId={PINNED_FACTORY_COMMANDS.syncLineTimestamps}
			/>
			{hasRomanizationTools && (
				<DropdownMenu.Sub>
					<DropdownMenu.SubTrigger>
						{t("topBar.menu.perWordRomanization.index", "逐字音译")}
					</DropdownMenu.SubTrigger>
					<DropdownMenu.SubContent>
						<PinnedCommandMenuItem
							commandId={PINNED_FACTORY_COMMANDS.romanizationDistribute}
						/>
						<PinnedCommandMenuItem
							commandId={PINNED_FACTORY_COMMANDS.romanizationCheck}
						/>
					</DropdownMenu.SubContent>
				</DropdownMenu.Sub>
			)}
			<PinnedCommandMenuItem commandId={PINNED_FACTORY_COMMANDS.rubyGenerate} />
			<CommandMenuItem commandId={cmdOpenLatencyTest.id}>
				{t("settingsDialog.common.latencyTest", "音频/输入延迟测试")}
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
