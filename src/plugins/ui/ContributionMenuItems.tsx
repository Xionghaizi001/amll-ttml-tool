import type { MenuLocation } from "@amll-ttml-tool/plugin-api";
import { ContextMenu, DropdownMenu } from "@radix-ui/themes";
import { Fragment, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { CommandMenuItem } from "$/components/TopMenu/CommandMenuItem";
import { ContextCommandMenuItem } from "$/components/TopMenu/ContextCommandMenuItem";
import { commandRegistry } from "$/modules/keyboard/registry";
import { extensionRegistry } from "../adapters/extension-host";
import { matchesWhenClause } from "../adapters/when-clause";
import { localizeText } from "./localize";

/**
 * Factory plugin commands the host shows at their pre-plugin menu positions
 * instead of the generic contribution area.
 * shortcut: fixed host list; replace with user-configurable menu placement when that is scheduled.
 */
export const PINNED_FACTORY_COMMANDS = {
	metadata: "builtin.metadata.run",
	plainTextImport: "builtin.plain-text-import.run",
	syncLineTimestamps: "builtin.sync-line-timestamps.run",
} as const;
const pinnedCommandIds = new Set<string>(
	Object.values(PINNED_FACTORY_COMMANDS),
);

/** A pinned factory command at its host slot; absent while the plugin is disabled or uninstalled. */
export const PinnedCommandMenuItem = ({ commandId }: { commandId: string }) => {
	const { i18n } = useTranslation();
	const title = useSyncExternalStore(
		(listener) => {
			const subscription = commandRegistry.subscribe(listener);
			return () => subscription.dispose();
		},
		() => commandRegistry.get(commandId)?.title,
		() => undefined,
	);
	if (title === undefined) return null;
	return (
		<CommandMenuItem commandId={commandId}>
			{localizeText(title, i18n.language)}
		</CommandMenuItem>
	);
};

/**
 * Renders every plugin/builtin menu contribution registered for one protocol
 * location. `variant` picks the Radix primitive family: "dropdown" for the
 * top menus, "context" for right-click menus (context.lyricLine/lyricWord).
 */
export const ContributionMenuItems = ({
	location,
	variant = "dropdown",
	withLeadingSeparator = false,
}: {
	location: MenuLocation;
	variant?: "dropdown" | "context";
	/** Renders a separator before the items — only when any item is visible. */
	withLeadingSeparator?: boolean;
}) => {
	const { i18n } = useTranslation();
	useSyncExternalStore(
		(listener) => {
			const subscription = extensionRegistry.contributions.subscribe(listener);
			return () => subscription.dispose();
		},
		() => extensionRegistry.contributions.getRevision(),
		() => 0,
	);
	const items = extensionRegistry.contributions
		.getMenus(location)
		.filter(
			(item) =>
				!pinnedCommandIds.has(item.commandId) &&
				commandRegistry.get(item.commandId)?.title !== undefined &&
				matchesWhenClause(item.when),
		);
	if (items.length === 0) return null;

	const Separator =
		variant === "context" ? ContextMenu.Separator : DropdownMenu.Separator;
	const Item = variant === "context" ? ContextCommandMenuItem : CommandMenuItem;

	let previousGroup: string | undefined;
	return (
		<>
			{withLeadingSeparator && <Separator />}
			{items.map((item) => {
				const command = commandRegistry.get(item.commandId);
				if (!command?.title) return null;
				const separator =
					previousGroup !== undefined && previousGroup !== item.group;
				previousGroup = item.group;
				return (
					<Fragment key={item.id}>
						{separator && <Separator />}
						<Item commandId={item.commandId}>
							{localizeText(command.title, i18n.language)}
						</Item>
					</Fragment>
				);
			})}
		</>
	);
};
