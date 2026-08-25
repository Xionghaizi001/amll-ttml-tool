export type CommandSource =
	| { kind: "builtin"; id: string }
	| { kind: "plugin"; pluginId: string };

export type CommandHandler = (args?: unknown) => unknown | Promise<unknown>;
export type CommandEnablement = () => boolean;

export interface CommandRegistration {
	id: string;
	title?: LocalizedText;
	category?: LocalizedText;
	handler: CommandHandler;
	enablement?: CommandEnablement;
	source: CommandSource;
}

export interface RegisteredCommand extends CommandRegistration {
	enabled: boolean;
}

export interface Disposable {
	dispose(): void;
}

const commandSourceName = (source: CommandSource): string =>
	source.kind === "plugin"
		? `plugin:${source.pluginId}`
		: `builtin:${source.id}`;

/**
 * Host-agnostic command registry. A command is always registered together with
 * its executable handler, enablement predicate, owner and cleanup handle.
 */
export class CommandRegistry {
	private readonly commands = new Map<string, CommandRegistration>();
	private readonly listeners = new Set<() => void>();

	register(registration: CommandRegistration): Disposable {
		const existing = this.commands.get(registration.id);
		if (existing) {
			throw new Error(
				`Command ${registration.id} is already registered by ${commandSourceName(existing.source)}`,
			);
		}
		this.commands.set(registration.id, registration);
		this.emitChange();
		let disposed = false;
		return {
			dispose: () => {
				if (disposed) return;
				disposed = true;
				if (this.commands.get(registration.id) !== registration) return;
				this.commands.delete(registration.id);
				this.emitChange();
			},
		};
	}

	get(id: string): RegisteredCommand | undefined {
		const command = this.commands.get(id);
		if (!command) return undefined;
		return { ...command, enabled: this.isEnabled(id) };
	}

	getAll(): RegisteredCommand[] {
		return [...this.commands.keys()]
			.map((id) => this.get(id))
			.filter((command): command is RegisteredCommand => command !== undefined);
	}

	isEnabled(id: string): boolean {
		const command = this.commands.get(id);
		if (!command) return false;
		return command.enablement?.() ?? true;
	}

	async execute(id: string, args?: unknown): Promise<unknown> {
		const command = this.commands.get(id);
		if (!command) throw new Error(`Command ${id} is not registered`);
		if (!(command.enablement?.() ?? true))
			throw new Error(`Command ${id} is disabled`);
		// The enablement predicate may run arbitrary code; a re-entrant
		// unregister/replace must not let a stale handler execute.
		if (this.commands.get(id) !== command)
			throw new Error(`Command ${id} was unregistered during execution`);
		return command.handler(args);
	}

	notifyEnablementChanged(): void {
		this.emitChange();
	}

	subscribe(listener: () => void): Disposable {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}

	private emitChange(): void {
		for (const listener of this.listeners) listener();
	}
}

import type { LocalizedText } from "@amll-ttml-tool/plugin-api";
