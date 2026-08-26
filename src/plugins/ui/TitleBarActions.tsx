import { Flex, IconButton, Tooltip } from "@radix-ui/themes";
import type { ComponentType } from "react";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { TitleBarActionContributionRecord } from "$/kernel/extensions";
import { commandRegistry } from "$/modules/keyboard/registry";
import { extensionRegistry } from "../adapters/extension-host";
import { matchesWhenClause } from "../adapters/when-clause";
import { FluentFormIcon } from "./fluent-form-icons";
import { localizeText } from "./localized-text";
import type { HostModeContribution } from "./mode-host";

const subscribeContributions = (listener: () => void) => {
	const subscription = extensionRegistry.contributions.subscribe(listener);
	return () => subscription.dispose();
};

const subscribeCommands = (listener: () => void) => {
	const subscription = commandRegistry.subscribe(listener);
	return () => subscription.dispose();
};

const DeclarativeTitleBarAction = ({
	action,
}: {
	action: TitleBarActionContributionRecord;
}) => {
	const { i18n } = useTranslation();
	const enabled = useSyncExternalStore(
		subscribeCommands,
		() => commandRegistry.isEnabled(action.commandId),
		() => false,
	);
	const source =
		action.owner.kind === "plugin" ? action.owner.pluginId : action.owner.id;
	return (
		<Tooltip content={`${localizeText(action.tooltip, i18n.language)} · ${source}`}>
			<IconButton
				variant="ghost"
				color="gray"
				size="1"
				disabled={!enabled}
				onClick={() => {
					void commandRegistry.execute(action.commandId).catch((error) => {
						console.error(
							`Failed to execute title bar action ${action.commandId}`,
							error,
						);
					});
				}}
			>
				<FluentFormIcon icon={action.icon} />
			</IconButton>
		</Tooltip>
	);
};

/**
 * Fixed title bar contribution area. It renders in its own flex slot between
 * the spacer and the window controls, so contributions can never cover the
 * drag region, the mode switcher or the window controls: declarative actions
 * are icon-sized command references (count-capped at registration), and only
 * builtin trusted scopes may mount action-group views here.
 */
export const TitleBarActions = ({
	activeMode,
}: {
	activeMode?: HostModeContribution;
}) => {
	useSyncExternalStore(
		subscribeContributions,
		() => extensionRegistry.contributions.getRevision(),
		() => 0,
	);
	const actions = extensionRegistry.contributions
		.getTitleBarActions()
		.filter((action) => matchesWhenClause(action.when));
	const groups = extensionRegistry.contributions.getTrustedViews(
		"titlebar-group",
	);
	const ModeActions = activeMode?.titleBarActions;
	if (!ModeActions && groups.length === 0 && actions.length === 0) return null;
	return (
		<Flex align="center" gap="3" mr="2" flexShrink="0">
			{ModeActions && <ModeActions />}
			{groups.map((group) => {
				const GroupView = group.view as ComponentType;
				return <GroupView key={group.id} />;
			})}
			{actions.map((action) => (
				<DeclarativeTitleBarAction key={action.id} action={action} />
			))}
		</Flex>
	);
};
