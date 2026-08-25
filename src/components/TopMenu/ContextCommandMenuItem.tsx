import { ContextMenu } from "@radix-ui/themes";
import {
	type ComponentProps,
	type ReactNode,
	useSyncExternalStore,
} from "react";
import { commandRegistry } from "$/modules/keyboard/registry";
import { createLogger } from "$/utils/logger";

const logger = createLogger("ContextCommandMenuItem");

export const ContextCommandMenuItem = ({
	commandId,
	children,
	...props
}: Omit<ComponentProps<typeof ContextMenu.Item>, "onSelect" | "disabled"> & {
	commandId: string;
	children: ReactNode;
}) => {
	const enabled = useSyncExternalStore(
		(listener) => {
			const subscription = commandRegistry.subscribe(listener);
			return () => subscription.dispose();
		},
		() => commandRegistry.isEnabled(commandId),
		() => false,
	);
	return (
		<ContextMenu.Item
			{...props}
			disabled={!enabled}
			onSelect={() => {
				void commandRegistry
					.execute(commandId)
					.catch((error) =>
						logger.error(`Failed to execute ${commandId}`, error),
					);
			}}
		>
			{children}
		</ContextMenu.Item>
	);
};

export const ContextCommandCheckboxItem = ({
	commandId,
	children,
	...props
}: Omit<
	ComponentProps<typeof ContextMenu.CheckboxItem>,
	"onCheckedChange" | "disabled"
> & {
	commandId: string;
	children: ReactNode;
}) => {
	const enabled = useSyncExternalStore(
		(listener) => {
			const subscription = commandRegistry.subscribe(listener);
			return () => subscription.dispose();
		},
		() => commandRegistry.isEnabled(commandId),
		() => false,
	);
	return (
		<ContextMenu.CheckboxItem
			{...props}
			disabled={!enabled}
			onCheckedChange={(checked) => {
				void commandRegistry
					.execute(commandId, checked === true)
					.catch((error) =>
						logger.error(`Failed to execute ${commandId}`, error),
					);
			}}
		>
			{children}
		</ContextMenu.CheckboxItem>
	);
};
