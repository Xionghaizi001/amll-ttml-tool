import type { ComponentType } from "react";
import { useSyncExternalStore } from "react";
import type { ModeContributionRecord } from "$/kernel/extensions";
import { extensionRegistry } from "../adapters/extension-host";

/** Trusted host views are React components; contributed views are cast here, at the single UI seam. */
export type HostModeContribution = ModeContributionRecord<ComponentType>;

const subscribeContributions = (listener: () => void) => {
	const subscription = extensionRegistry.contributions.subscribe(listener);
	return () => subscription.dispose();
};

/** Live, order-sorted mode contributions (re-renders on registry changes). */
export const useModeContributions = (): HostModeContribution[] => {
	useSyncExternalStore(
		subscribeContributions,
		() => extensionRegistry.contributions.getRevision(),
		() => 0,
	);
	return extensionRegistry.contributions.getModes() as HostModeContribution[];
};

/**
 * Resolves the active mode with the edit fail-safe applied: when the mode id
 * held in state has no live contribution (its plugin was disabled, unloaded
 * or crashed), the builtin edit mode is returned instead.
 */
export const useActiveMode = (
	currentModeId: string,
): {
	modes: HostModeContribution[];
	activeModeId: string;
	activeMode: HostModeContribution | undefined;
} => {
	const modes = useModeContributions();
	const activeModeId =
		extensionRegistry.contributions.resolveActiveModeId(currentModeId);
	return {
		modes,
		activeModeId,
		activeMode: modes.find((mode) => mode.modeId === activeModeId),
	};
};
