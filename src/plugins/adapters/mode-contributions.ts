import type { LocalizedText } from "@amll-ttml-tool/plugin-api";
import type { Disposable } from "$/kernel/commands";
import type { ExtensionScope } from "$/kernel/extensions";
import { registerModeSwitchCommand } from "$/modules/keyboard/mode-commands";
import { toolModeAtom } from "$/states/main";
import { globalStore } from "$/states/store";
import { extensionRegistry } from "./extension-host";
import { matchesWhenClause } from "./when-clause";

const defaultText = (text: LocalizedText): string =>
	typeof text === "string" ? text : text.default;

export interface HostModeInput<TView> {
	modeId: string;
	title: LocalizedText;
	order?: number;
	when?: string;
	mainView: TView;
	mainViewKey?: string;
	ribbonView?: TView;
	titleBarActions?: TView;
	hideSidebar?: boolean;
}

/**
 * Registers a mode contribution together with its namespaced switch keyboard
 * command; disposing the handle removes both, and the fail-safe resolution in
 * `ContributionRegistry.resolveActiveModeId` then falls the user back to the
 * builtin edit mode.
 */
export const registerHostMode = <TView>(
	scope: ExtensionScope<TView>,
	input: HostModeInput<TView>,
): Disposable => {
	const mode = scope.registerMode(input);
	const switchCommand = registerModeSwitchCommand(
		input.modeId,
		defaultText(input.title),
		() => globalStore.set(toolModeAtom, input.modeId),
		// A mode hidden by its `when` clause must not be reachable via its
		// shortcut either; unknown/broken expressions fail closed.
		input.when === undefined ? undefined : () => matchesWhenClause(input.when),
	);
	let disposed = false;
	return {
		dispose: () => {
			if (disposed) return;
			disposed = true;
			switchCommand.dispose();
			mode.dispose();
		},
	};
};

/** Fail-safe active-mode resolution against the live contribution registry. */
export const resolveActiveModeId = (currentModeId: string): string =>
	extensionRegistry.contributions.resolveActiveModeId(currentModeId);
