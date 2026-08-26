import {
	cmdSwitchEditMode,
	cmdSwitchPreviewMode,
	cmdSwitchSyncMode,
} from "./commands";
import { bindCommandHandler, registerCommand } from "./registry";
import type { I18nKey, KeyBindingCommand } from "./types";

/**
 * Storage-key namespace for dynamically contributed modes. The three builtin
 * modes keep their legacy command ids (`switchEditMode` …) so existing user
 * keybinding storage stays valid; every other mode id (already namespaced by
 * its owning plugin, e.g. `builtin.review.review`) gets
 * `keybindings:switchMode.<modeId>`.
 */
export const MODE_SWITCH_COMMAND_PREFIX = "switchMode.";

const LEGACY_MODE_COMMANDS: Record<string, KeyBindingCommand> = {
	edit: cmdSwitchEditMode,
	sync: cmdSwitchSyncMode,
	preview: cmdSwitchPreviewMode,
};

const activeModeCommands = new Map<string, KeyBindingCommand>();

export interface ModeSwitchCommandHandle {
	command: KeyBindingCommand;
	dispose(): void;
}

/**
 * Registers (or, for the builtin modes, rebinds) the keyboard command that
 * switches to the given mode. Disposing the handle unbinds the handler and,
 * for dynamic modes, removes the command so an unloaded plugin leaves no
 * orphaned shortcut behind. The keybinding storage entry itself is kept so a
 * user-assigned shortcut survives a plugin reload.
 */
export function registerModeSwitchCommand(
	modeId: string,
	description: string,
	switchToMode: () => void,
	enablement?: () => boolean,
): ModeSwitchCommandHandle {
	const legacy = LEGACY_MODE_COMMANDS[modeId];
	const command =
		legacy ??
		registerCommand(
			`${MODE_SWITCH_COMMAND_PREFIX}${modeId}`,
			[],
			description as I18nKey,
			"View",
		);
	const binding = bindCommandHandler(command.id, switchToMode, enablement);
	activeModeCommands.set(modeId, command);
	return {
		command,
		dispose: () => {
			binding.dispose();
			if (activeModeCommands.get(modeId) === command)
				activeModeCommands.delete(modeId);
			if (!legacy) command.dispose();
		},
	};
}

/** The keyboard command currently bound to a mode, if any. */
export const getModeSwitchCommand = (
	modeId: string,
): KeyBindingCommand | undefined => activeModeCommands.get(modeId);
