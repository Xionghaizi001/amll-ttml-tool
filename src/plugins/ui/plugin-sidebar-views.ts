import { useSyncExternalStore } from "react";
import { extensionRegistry } from "../adapters/extension-host";

const subscribeContributions = (listener: () => void) => {
	const disposable = extensionRegistry.contributions.subscribe(listener);
	return () => disposable.dispose();
};

let sidebarViewsRevision = -1;
let sidebarViewsSnapshot =
	extensionRegistry.contributions.getTrustedViews("sidebar");
const getSidebarViewsSnapshot = () => {
	const revision = extensionRegistry.contributions.getRevision();
	if (revision !== sidebarViewsRevision) {
		sidebarViewsRevision = revision;
		sidebarViewsSnapshot =
			extensionRegistry.contributions.getTrustedViews("sidebar");
	}
	return sidebarViewsSnapshot;
};

/**
 * Plugin `sidebar` trusted views, in registration order. Tabs are keyed by
 * contribution id, so a disabled plugin's tab disappears from the sidebar
 * and comes back in place once its contribution is registered again.
 */
export const usePluginSidebarViews = () =>
	useSyncExternalStore(
		subscribeContributions,
		getSidebarViewsSnapshot,
		getSidebarViewsSnapshot,
	);
