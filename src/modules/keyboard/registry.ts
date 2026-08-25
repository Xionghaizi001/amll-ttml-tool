import { CommandRegistry } from "$/kernel/commands";
import { atomWithKeybindingStorage } from "$/utils/keybindings";
import { Logger } from "$/utils/logger";
import type {
	CommandHandlerBinding,
	I18nKey,
	KeyBindingCommand,
	KeyBindingsConfig,
} from "./types";

export const commandRegistry = new CommandRegistry();

type HandlerSlot = {
	handler?: (args?: unknown) => unknown | Promise<unknown>;
	enablement?: () => boolean;
};

const handlerSlots = new Map<string, HandlerSlot>();

/**
 * 存储所有注册的命令
 *
 * @internal
 */
const commandsMap = new Map<string, KeyBindingCommand>();

/**
 * 注册一个快捷键命令
 * @param id 唯一 ID (例如 "file.save")
 * @param defaultKeys 默认按键 (例如 ["Control", "KeyS"])
 * @param description i18n key
 * @param category 分类 (例如 "File")
 */
export function registerCommand(
	id: string,
	defaultKeys: KeyBindingsConfig,
	description: I18nKey,
	category = "General",
	configurable = true,
) {
	const commandAtom = atomWithKeybindingStorage(id, defaultKeys);
	const slot: HandlerSlot = {};
	handlerSlots.set(id, slot);
	const source = { kind: "builtin", id: "core" } as const;
	const handler = (args?: unknown) => {
		if (!slot.handler) throw new Error(`Command ${id} has no active handler`);
		return slot.handler(args);
	};
	const enablement = () =>
		Boolean(slot.handler) && (slot.enablement?.() ?? true);
	const registration = commandRegistry.register({
		id,
		title: description,
		category,
		handler,
		enablement,
		source,
	});

	const command: KeyBindingCommand = {
		id,
		defaultKeys,
		description,
		category,
		configurable,
		source,
		handler,
		enablement,
		execute: (args) => commandRegistry.execute(id, args),
		dispose: () => {
			registration.dispose();
			handlerSlots.delete(id);
			commandsMap.delete(id);
		},
		atom: commandAtom,
	};

	if (commandsMap.has(id)) {
		Logger.warn("KeyBindingRegistry", `Duplicate command registered: ${id}`);
	}
	commandsMap.set(id, command);

	return command;
}

export function getAllCommands(): KeyBindingCommand[] {
	return Array.from(commandsMap.values()).filter(
		(command) => command.configurable,
	);
}

export function getCommandById(id: string): KeyBindingCommand | undefined {
	return commandsMap.get(id);
}

/**
 * Binds a UI/application implementation to a statically declared command.
 * Disposing the binding disables the command without losing shortcut metadata.
 */
export function bindCommandHandler(
	id: string,
	handler: (args?: unknown) => unknown | Promise<unknown>,
	enablement?: () => boolean,
): CommandHandlerBinding {
	const slot = handlerSlots.get(id);
	if (!slot) throw new Error(`Cannot bind unknown command ${id}`);
	if (slot.handler)
		throw new Error(`Command ${id} already has an active handler`);
	slot.handler = handler;
	slot.enablement = enablement;
	commandRegistry.notifyEnablementChanged();
	let disposed = false;
	return {
		dispose: () => {
			if (disposed) return;
			disposed = true;
			if (slot.handler !== handler) return;
			slot.handler = undefined;
			slot.enablement = undefined;
			commandRegistry.notifyEnablementChanged();
		},
	};
}
