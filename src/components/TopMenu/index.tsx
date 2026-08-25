import { Box, Flex } from "@radix-ui/themes";
import { Toolbar } from "radix-ui";
import { type FC, useEffect, useState } from "react";
import {
	cmdDeleteSelection,
	cmdNewFile,
	cmdOpenFile,
	cmdRedo,
	cmdSaveFile,
	cmdSelectAll,
	cmdSelectInverted,
	cmdSelectWordsOfMatchedSelection,
	cmdUndo,
	cmdUnselectAll,
} from "$/modules/keyboard/commands";
import { useCommandKeyBinding } from "$/modules/keyboard/hooks";
import { HeaderFileInfo } from "./HeaderFileInfo";
import { EditMenu } from "./modals/EditMenu";
import { FileMenu } from "./modals/FileMenu";
import { HelpMenu } from "./modals/HelpMenu";
import { HomeMenu } from "./modals/HomeMenu";
import { ToolMenu } from "./modals/ToolMenu";
import { useTopMenuActions } from "./useTopMenuActions";

const useWindowSize = () => {
	const [windowSize, setWindowSize] = useState({
		width: window.innerWidth,
		height: window.innerHeight,
	});

	useEffect(() => {
		const handleResize = () => {
			setWindowSize({
				width: window.innerWidth,
				height: window.innerHeight,
			});
		};

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	return windowSize;
};

export const TopMenu: FC = () => {
	const { width } = useWindowSize();
	const showHomeButton = width < 800;
	useTopMenuActions();

	useCommandKeyBinding(cmdNewFile);
	useCommandKeyBinding(cmdOpenFile);
	useCommandKeyBinding(cmdSaveFile);
	useCommandKeyBinding(cmdUndo);
	useCommandKeyBinding(cmdRedo);
	useCommandKeyBinding(cmdUnselectAll);
	useCommandKeyBinding(cmdSelectAll);
	useCommandKeyBinding(cmdSelectInverted);
	useCommandKeyBinding(cmdSelectWordsOfMatchedSelection);
	useCommandKeyBinding(cmdDeleteSelection);

	return (
		<Flex
			p="2"
			pr="0"
			align="center"
			gap="2"
			style={{
				whiteSpace: "nowrap",
			}}
		>
			{showHomeButton ? (
				<HomeMenu />
			) : (
				<Toolbar.Root>
					<FileMenu
						variant="toolbar"
						buttonStyle={{
							borderTopRightRadius: "0",
							borderBottomRightRadius: "0",
							marginRight: "0px",
						}}
					/>
					<EditMenu
						variant="toolbar"
						triggerStyle={{
							borderRadius: "0",
							marginRight: "0px",
						}}
					/>
					<ToolMenu
						variant="toolbar"
						triggerStyle={{
							borderRadius: "0",
							marginRight: "0px",
						}}
					/>
					<HelpMenu
						variant="toolbar"
						buttonStyle={{
							borderTopLeftRadius: "0",
							borderBottomLeftRadius: "0",
						}}
					/>
				</Toolbar.Root>
			)}
			<Box style={{ marginLeft: "16px" }}>
				<HeaderFileInfo />
			</Box>
		</Flex>
	);
};
