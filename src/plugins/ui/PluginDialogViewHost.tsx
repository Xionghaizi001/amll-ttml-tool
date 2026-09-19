import { Dialog } from "@radix-ui/themes";
import type { ComponentType } from "react";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { localizeText } from "./localize";
import { pluginViewService } from "./plugin-view-host";

/**
 * Renders the plugin `dialog-view` trusted views that are currently open
 * through `ui.openView`. Each dialog is a host-owned Radix modal: the plugin
 * supplies only the body component, the host owns title, chrome, dismissal
 * and the `data-amll-plugin-scope` marker (theme scoping anchor, goal.md
 * "插件间关系" §2). These trusted components run with application privileges;
 * the scope marker is not a UI sandbox.
 */
export const PluginDialogViewHost = () => {
	const open = useSyncExternalStore(
		pluginViewService.subscribe,
		pluginViewService.getSnapshot,
		pluginViewService.getSnapshot,
	);
	const { i18n } = useTranslation();
	if (open.length === 0) return null;
	return (
		<>
			{open.map(({ id, pluginId, record }) => {
				const View = record.view as ComponentType;
				return (
					<Dialog.Root
						key={id}
						open
						onOpenChange={(next) => {
							if (!next) pluginViewService.close(id);
						}}
					>
						<Dialog.Content
							data-amll-modal-size="medium"
							data-amll-plugin-scope={pluginId}
						>
							<Dialog.Title>
								{localizeText(record.title, i18n.language)}
							</Dialog.Title>
							<View />
						</Dialog.Content>
					</Dialog.Root>
				);
			})}
		</>
	);
};
