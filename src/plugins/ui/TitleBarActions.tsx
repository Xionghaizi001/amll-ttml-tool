import { Flex, IconButton, Tooltip } from "@radix-ui/themes";
import type { ComponentType } from "react";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { TitleBarActionContributionRecord } from "$/kernel/extensions";
import { commandRegistry } from "$/modules/keyboard/registry";
import { extensionRegistry } from "../adapters/extension-host";
import { matchesWhenClause } from "../adapters/when-clause";
import { FluentActionIcon } from "./fluent-action-icons";
import { localizeText } from "./localized-text";
import type { HostModeContribution } from "./mode-host";

const subscribeContributions = (listener: () => void) => {
	const subscription = extensionRegistry.contributions.subscribe(listener);
	return () => subscription.dispose();
};

let titleBarRevision = -1;
let titleBarSnapshot = {
	actions: extensionRegistry.contributions.getTitleBarActions(),
	groups: extensionRegistry.contributions.getTrustedViews("titlebar-group"),
};
const getTitleBarSnapshot = () => {
	const revision = extensionRegistry.contributions.getRevision();
	if (titleBarRevision !== revision) {
		titleBarRevision = revision;
		titleBarSnapshot = {
			actions: extensionRegistry.contributions.getTitleBarActions(),
			groups: extensionRegistry.contributions.getTrustedViews("titlebar-group"),
		};
	}
	return titleBarSnapshot;
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
		<Tooltip
			content={`${localizeText(action.tooltip, i18n.language)} · ${source}`}
		>
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
				<FluentActionIcon icon={action.icon} />
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
	const { actions: registeredActions, groups } = useSyncExternalStore(
		subscribeContributions,
		getTitleBarSnapshot,
		getTitleBarSnapshot,
	);
	const actions = registeredActions.filter((action) =>
		matchesWhenClause(action.when),
	);
	const ModeActions = activeMode?.titleBarActions;
	if (!ModeActions && groups.length === 0 && actions.length === 0) return null;
	return (
		<Flex align="center" gap="3" mr="2" flexShrink="0">
			{ModeActions && activeMode && (
				<div
					style={{ display: "contents" }}
					data-amll-plugin-scope={
						activeMode.owner.kind === "plugin"
							? activeMode.owner.pluginId
							: activeMode.owner.id
					}
				>
					<ModeActions />
				</div>
			)}
			{groups.map((group) => {
				const GroupView = group.view as ComponentType;
				return (
					<div
						key={group.id}
						style={{ display: "contents" }}
						data-amll-plugin-scope={
							group.owner.kind === "plugin"
								? group.owner.pluginId
								: group.owner.id
						}
					>
						<GroupView />
					</div>
				);
			})}
			{actions.map((action) => (
				<DeclarativeTitleBarAction key={action.id} action={action} />
			))}
		</Flex>
	);
};
