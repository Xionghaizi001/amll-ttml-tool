import { useAtomValue } from "jotai";
import { type DependencyList, useEffect } from "react";
import { type KeyBindingCallback, useKeyBinding } from "$/utils/keybindings";
import { bindCommandHandler } from "./registry";
import type { KeyBindingCommand } from "./types";

// biome-ignore lint/correctness/noUnusedVariables: JSDoc
type Commands = typeof import("./commands");

/**
 * 在组件中绑定快捷键命令
 * @param command 注册好的命令对象，参见 {@link Commands commands.ts}
 * @param callback 触发时的回调函数
 * @param deps 依赖项数组 (同 useEffect)
 */
export function useCommand(
	command: KeyBindingCommand,
	callback: KeyBindingCallback,
	deps: DependencyList = [],
) {
	const currentKeys = useAtomValue(command.atom);
	useEffect(() => {
		const binding = bindCommandHandler(command.id, (args) =>
			callback(args as Parameters<KeyBindingCallback>[0]),
		);
		return () => binding.dispose();
	}, [command.id, callback, ...deps]);

	useKeyBinding(
		currentKeys,
		(event) => {
			void command.execute(event);
		},
		[command, ...deps],
	);
}

export function useCommandHandler(
	command: KeyBindingCommand,
	handler: () => unknown | Promise<unknown>,
	enablement?: () => boolean,
	deps: DependencyList = [],
) {
	useEffect(() => {
		const binding = bindCommandHandler(command.id, handler, enablement);
		return () => binding.dispose();
	}, [command.id, handler, enablement, ...deps]);
}

export function useCommandKeyBinding(
	command: KeyBindingCommand,
	deps: DependencyList = [],
) {
	const currentKeys = useAtomValue(command.atom);
	useKeyBinding(
		currentKeys,
		(event) => {
			void command.execute(event);
		},
		[command, ...deps],
	);
}
