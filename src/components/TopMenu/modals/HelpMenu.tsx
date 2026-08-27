import { Button, DropdownMenu } from "@radix-ui/themes";
import { Toolbar } from "radix-ui";
import type { CSSProperties } from "react";
import { Trans, useTranslation } from "react-i18next";
import { cmdOpenGitHub, cmdOpenWiki } from "$/modules/keyboard/commands";
import { ContributionMenuItems } from "$/plugins/ui/ContributionMenuItems";
import { CommandMenuItem } from "../CommandMenuItem";

type HelpMenuProps = {
	variant: "toolbar" | "submenu";
	buttonStyle?: CSSProperties;
};

const HelpMenuItems = () => {
	const { t } = useTranslation();

	return (
		<>
			<CommandMenuItem commandId={cmdOpenGitHub.id}>GitHub</CommandMenuItem>
			<CommandMenuItem commandId={cmdOpenWiki.id}>
				{t("topBar.menu.helpDoc", "使用说明")}
			</CommandMenuItem>
			<ContributionMenuItems location="menu.help" withLeadingSeparator />
		</>
	);
};

export const HelpMenu = (props: HelpMenuProps) => {
	if (props.variant === "submenu") {
		return (
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					<Trans i18nKey="topBar.menu.help">帮助</Trans>
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<HelpMenuItems />
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		);
	}

	return (
		<DropdownMenu.Root>
			<Toolbar.Button asChild>
				<DropdownMenu.Trigger>
					<Button variant="soft" style={props.buttonStyle}>
						<Trans i18nKey="topBar.menu.help">帮助</Trans>
					</Button>
				</DropdownMenu.Trigger>
			</Toolbar.Button>
			<DropdownMenu.Content>
				<HelpMenuItems />
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	);
};
