import type { ParseKeys } from "i18next";
import type { WritableAtom } from "jotai";
import type {
	CommandEnablement,
	CommandHandler,
	CommandSource,
	Disposable,
} from "$/kernel/commands";
import type { RESET_KEYBINDING } from "$/utils/keybindings";

export type I18nKey = ParseKeys<"translation">;
export type KeyBindingsConfig = string[];

export interface KeyBindingCommand {
	/** 唯一标识符 */
	id: string;
	/** 默认快捷键组合 */
	defaultKeys: KeyBindingsConfig;
	/** 界面上显示的 i18n key */
	description: I18nKey;
	/** 设置面板中的分类 */
	category: string;
	/** 是否显示在快捷键设置页。 */
	configurable: boolean;
	/** 命令来源、执行器、启用状态与注册清理均属于同一条命令记录。 */
	source: CommandSource;
	handler: CommandHandler;
	enablement: CommandEnablement;
	execute(args?: unknown): Promise<unknown>;
	dispose(): void;
	/**
	 * 对应的 Jotai Atom
	 */
	atom: WritableAtom<
		KeyBindingsConfig,
		[update?: KeyBindingsConfig | typeof RESET_KEYBINDING | undefined],
		Promise<void>
	>;
}

export interface CommandHandlerBinding extends Disposable {}
