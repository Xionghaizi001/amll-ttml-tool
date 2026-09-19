import { extensionRegistry } from "$/plugins/adapters/extension-host";
import { PluginViewService } from "./plugin-view-service";

/**
 * Application singleton behind `ui.openView`/`ui.closeView`: open-state of
 * plugin dialog views over the live contribution registry. Shared by the
 * trusted-js host (which opens/closes) and `PluginDialogViewHost` (which
 * renders), so a plugin unload prunes its dialogs from both at once.
 */
export const pluginViewService = new PluginViewService({
	getTrustedViews: (kind) =>
		extensionRegistry.contributions.getTrustedViews(kind),
	subscribe: (listener) => extensionRegistry.contributions.subscribe(listener),
});
