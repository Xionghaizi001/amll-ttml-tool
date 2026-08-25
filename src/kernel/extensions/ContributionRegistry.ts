import type {
	FormSchemaV0,
	LocalizedText,
	MenuItemContribution,
	MenuLocation,
} from "@amll-ttml-tool/plugin-api";
import type {
	CommandEnablement,
	CommandHandler,
	CommandRegistry,
	Disposable,
} from "../commands";

export type ContributionOwner =
	| { kind: "builtin"; id: string; trusted: true }
	| {
			kind: "plugin";
			pluginId: string;
			runtime: "extism-wasm" | "trusted-js";
			trusted: false;
	  };

export interface OwnedContribution {
	id: string;
	owner: ContributionOwner;
}

export interface MenuContributionRecord extends OwnedContribution {
	kind: "menu";
	commandId: string;
	location: MenuLocation;
	group?: string;
	order?: number;
	when?: string;
}

export interface ToolbarContributionRecord extends OwnedContribution {
	kind: "toolbar";
	commandId: string;
	location: "toolbar.edit" | "toolbar.sync";
	order?: number;
}

export interface DeclarativeFormContributionRecord extends OwnedContribution {
	kind: "settings" | "dialog";
	title: LocalizedText;
	form: FormSchemaV0;
}

export interface TrustedViewContributionRecord<TView = unknown>
	extends OwnedContribution {
	kind: "sidebar" | "settings-view" | "dialog-view";
	title: LocalizedText;
	view: TView;
}

export type ContributionRecord<TView = unknown> =
	| MenuContributionRecord
	| ToolbarContributionRecord
	| DeclarativeFormContributionRecord
	| TrustedViewContributionRecord<TView>;

const ownerId = (owner: ContributionOwner): string =>
	owner.kind === "plugin" ? owner.pluginId : owner.id;

class DisposableStore implements Disposable {
	private readonly entries = new Set<Disposable>();
	private disposed = false;

	add<T extends Disposable>(entry: T): T {
		if (this.disposed) entry.dispose();
		else this.entries.add(entry);
		return entry;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const entry of [...this.entries].reverse()) entry.dispose();
		this.entries.clear();
	}
}

export class ContributionRegistry<TView = unknown> {
	private readonly contributions = new Map<string, ContributionRecord<TView>>();
	private readonly listeners = new Set<() => void>();
	private revision = 0;

	register(record: ContributionRecord<TView>): Disposable {
		if (this.contributions.has(record.id))
			throw new Error(`Contribution ${record.id} is already registered`);
		if (
			(record.kind === "sidebar" ||
				record.kind === "settings-view" ||
				record.kind === "dialog-view") &&
			!record.owner.trusted
		)
			throw new Error(
				`Plugin ${ownerId(record.owner)} cannot register trusted view contributions`,
			);
		if (
			record.owner.kind === "plugin" &&
			(record.kind === "toolbar" || record.kind === "sidebar")
		)
			throw new Error(
				`Plugin ${record.owner.pluginId} cannot register ${record.kind} contributions in MVP`,
			);
		this.contributions.set(record.id, record);
		this.emitChange();
		let disposed = false;
		return {
			dispose: () => {
				if (disposed) return;
				disposed = true;
				if (this.contributions.get(record.id) !== record) return;
				this.contributions.delete(record.id);
				this.emitChange();
			},
		};
	}

	getAll(): ContributionRecord<TView>[] {
		return [...this.contributions.values()];
	}

	getMenus(location: MenuLocation): MenuContributionRecord[] {
		return this.getAll()
			.filter(
				(item): item is MenuContributionRecord =>
					item.kind === "menu" && item.location === location,
			)
			.sort(
				(left, right) =>
					(left.group ?? "zzz").localeCompare(right.group ?? "zzz") ||
					(left.order ?? 1000) - (right.order ?? 1000) ||
					left.id.localeCompare(right.id),
			);
	}

	subscribe(listener: () => void): Disposable {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}

	getRevision(): number {
		return this.revision;
	}

	private emitChange(): void {
		this.revision += 1;
		for (const listener of this.listeners) listener();
	}
}

export interface ExtensionScope<TView = unknown> extends Disposable {
	registerCommand(input: {
		id: string;
		title?: LocalizedText;
		category?: LocalizedText;
		handler: CommandHandler;
		enablement?: CommandEnablement;
	}): Disposable;
	registerMenu(input: MenuItemContribution & { id?: string }): Disposable;
	registerToolbar(input: {
		id: string;
		commandId: string;
		location: "toolbar.edit" | "toolbar.sync";
		order?: number;
	}): Disposable;
	registerDeclarativeForm(input: {
		id: string;
		kind: "settings" | "dialog";
		title: LocalizedText;
		form: FormSchemaV0;
	}): Disposable;
	registerTrustedView(input: {
		id: string;
		kind: "sidebar" | "settings-view" | "dialog-view";
		title: LocalizedText;
		view: TView;
	}): Disposable;
	addEventListener<T>(
		event: string,
		listener: (payload: T) => void,
	): Disposable;
}

export class ExtensionRegistry<TView = unknown> {
	private readonly eventListeners = new Map<
		string,
		Set<{ owner: ContributionOwner; listener: (payload: unknown) => void }>
	>();

	constructor(
		readonly commands: CommandRegistry,
		readonly contributions = new ContributionRegistry<TView>(),
	) {}

	createScope(owner: ContributionOwner): ExtensionScope<TView> {
		const disposables = new DisposableStore();
		// Plugins may only claim ids inside their own namespace; without this a
		// plugin could squat builtin command ids or re-expose another owner's
		// commands through new menu entries.
		const requireOwnNamespace = (id: string, what: string): void => {
			if (owner.kind === "plugin" && !id.startsWith(`${owner.pluginId}.`))
				throw new Error(
					`Plugin ${owner.pluginId} cannot register ${what} ${id} outside its own namespace`,
				);
		};
		return {
			registerCommand: (input) => {
				requireOwnNamespace(input.id, "command");
				return disposables.add(
					this.commands.register({
						...input,
						source:
							owner.kind === "plugin"
								? { kind: "plugin", pluginId: owner.pluginId }
								: { kind: "builtin", id: owner.id },
					}),
				);
			},
			registerMenu: (input) => {
				if (
					owner.kind === "plugin" &&
					(input.menu.startsWith("toolbar.") || input.menu === "sidebar.panel")
				)
					throw new Error(
						`Plugin ${owner.pluginId} cannot register ${input.menu} contributions in MVP`,
					);
				requireOwnNamespace(input.command, "menu command reference");
				if (input.id !== undefined)
					requireOwnNamespace(input.id, "menu contribution");
				return disposables.add(
					this.contributions.register({
						kind: "menu",
						id:
							input.id ??
							`${ownerId(owner)}.menu.${input.menu}.${input.command}`,
						owner,
						commandId: input.command,
						location: input.menu,
						group: input.group,
						order: input.order,
						when: input.when,
					}),
				);
			},
			registerToolbar: (input) =>
				disposables.add(
					this.contributions.register({
						...input,
						kind: "toolbar",
						owner,
					}),
				),
			registerDeclarativeForm: (input) => {
				requireOwnNamespace(input.id, "declarative form");
				return disposables.add(
					this.contributions.register({ ...input, owner }),
				);
			},
			registerTrustedView: (input) =>
				disposables.add(this.contributions.register({ ...input, owner })),
			addEventListener: <T>(event: string, listener: (payload: T) => void) => {
				const listeners = this.eventListeners.get(event) ?? new Set();
				const entry = {
					owner,
					listener: listener as (payload: unknown) => void,
				};
				listeners.add(entry);
				this.eventListeners.set(event, listeners);
				return disposables.add({
					dispose: () => {
						listeners.delete(entry);
						if (listeners.size === 0) this.eventListeners.delete(event);
					},
				});
			},
			dispose: () => disposables.dispose(),
		};
	}

	emit<T>(event: string, payload: T): void {
		// One throwing listener must not starve the listeners registered after
		// it; a crashing plugin would otherwise deny events to every other one.
		for (const entry of [...(this.eventListeners.get(event) ?? [])]) {
			try {
				entry.listener(payload);
			} catch (error) {
				console.error(
					`Extension event listener for ${event} threw`,
					entry.owner,
					error,
				);
			}
		}
	}
}
