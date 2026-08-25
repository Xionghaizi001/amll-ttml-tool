import { DropdownMenu } from "@radix-ui/themes";
import { atom, useAtomValue } from "jotai";
import {
	type ComponentProps,
	type ReactNode,
	useSyncExternalStore,
} from "react";
import { commandRegistry, getCommandById } from "$/modules/keyboard/registry";
import { formatKeyBindings } from "$/utils/keybindings";
import { createLogger } from "$/utils/logger";

const emptyKeysAtom = atom<string[]>([]);
const logger = createLogger("CommandMenuItem");

type Props = Omit<
	ComponentProps<typeof DropdownMenu.Item>,
	"onSelect" | "disabled" | "shortcut"
> & {
	commandId: string;
	children: ReactNode;
};

export const CommandMenuItem = ({ commandId, children, ...props }: Props) => {
	const shortcut = useAtomValue(
		getCommandById(commandId)?.atom ?? emptyKeysAtom,
	);
	const enabled = useSyncExternalStore(
		(listener) => {
			const subscription = commandRegistry.subscribe(listener);
			return () => subscription.dispose();
		},
		() => commandRegistry.isEnabled(commandId),
		() => false,
	);

	return (
		<DropdownMenu.Item
			{...props}
			onSelect={() => {
				void commandRegistry.execute(commandId).catch((error) => {
					logger.error(`Failed to execute ${commandId}`, error);
				});
			}}
			disabled={!enabled}
			shortcut={shortcut.length > 0 ? formatKeyBindings(shortcut) : undefined}
		>
			{children}
		</DropdownMenu.Item>
	);
};
