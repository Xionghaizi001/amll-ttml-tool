import { HomeRegular } from "@fluentui/react-icons";
import { DropdownMenu, IconButton } from "@radix-ui/themes";
import type { FC } from "react";
import { EditMenu } from "./EditMenu";
import { FileMenu } from "./FileMenu";
import { HelpMenu } from "./HelpMenu";
import { ToolMenu } from "./ToolMenu";

export const HomeMenu: FC = () => {
	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				<IconButton variant="soft" aria-label="主菜单">
					<HomeRegular />
				</IconButton>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content>
				<FileMenu variant="submenu" />
				<EditMenu variant="submenu" />
				<ToolMenu variant="submenu" />
				<HelpMenu variant="submenu" />
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	);
};
