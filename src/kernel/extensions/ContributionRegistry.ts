import type {
	FormIconV0,
	FormSchemaV0,
	LocalizedText,
	MenuItemContribution,
	MenuLocation,
	TitleBarActionContribution,
} from "@amll-ttml-tool/plugin-api";
import { TITLEBAR_ACTIONS_PER_PLUGIN_LIMIT_V0 } from "@amll-ttml-tool/plugin-api";
import type {
	CommandEnablement,
	CommandHandler,
	CommandRegistry,
	Disposable,
} from "../commands";
import {
	type LyricFormatExporter,
	type LyricFormatImporter,
	type LyricFormatProvider,
	normalizeFormatExtension,
} from "../formats/LyricFormatProvider";

/**
 * Fail-safe mode. It must always exist and may never be conditionally
 * hidden: whenever the active mode's contribution disappears (plugin
 * disabled, unloaded or crashed), the host falls back to it.
 */
export const FALLBACK_MODE_ID = "edit";

export type ContributionOwner =
	| { kind: "builtin"; id: string; trusted: true }
	| {
			kind: "plugin";
			pluginId: string;
			runtime: "extism-wasm";
			trusted: false;
	  }
	| {
			kind: "plugin";
			pluginId: string;
			runtime: "trusted-js";
			/**
			 * True only for modules admitted through the single trusted-js load
			 * gate (same-origin import + consent). Such plugins are builtin-grade
			 * for contribution kinds but keep plugin provenance and namespace.
			 */
			trusted: boolean;
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
	kind: "sidebar" | "settings-view" | "dialog-view" | "titlebar-group";
	title: LocalizedText;
	view: TView;
}

/**
 * A first-class page (mode) occupying the whole main viewport. Modes carry
 * arbitrary host views and are therefore restricted to trusted owners; a
 * third-party manifest declaring one is rejected at parse time.
 */
export interface ModeContributionRecord<TView = unknown>
	extends OwnedContribution {
	kind: "mode";
	modeId: string;
	title: LocalizedText;
	order?: number;
	/** Enablement gating the switcher entry; never allowed on the fallback mode. */
	when?: string;
	mainView: TView;
	/** Modes sharing the same key keep the main view mounted across switches. */
	mainViewKey?: string;
	ribbonView?: TView;
	/** Trusted action group rendered in the title bar while the mode is active. */
	titleBarActions?: TView;
	hideSidebar?: boolean;
}

/**
 * Declarative title bar action slot: command reference, whitelisted host
 * icon and plain-text tooltip only. Rendered in a fixed region that cannot
 * touch the drag area, window controls or the mode switcher.
 */
export interface TitleBarActionContributionRecord extends OwnedContribution {
	kind: "titlebar-action";
	commandId: string;
	icon: FormIconV0;
	tooltip: LocalizedText;
	order?: number;
	when?: string;
}

/**
 * A lyric format provider: pure text ↔ document conversion registered by a
 * builtin scope or a plugin. File picking, dirty confirmation, project id,
 * filename derivation and the import transaction are host concerns; the
 * provider never touches the document transaction service itself.
 */
export interface FormatProviderContributionRecord
	extends OwnedContribution,
		LyricFormatProvider {
	kind: "format-provider";
	order?: number;
	/**
	 * The host's native serialization format (TTML). Save/autosave/submit
	 * depend on it, so it may only come from a trusted owner, must support
	 * both directions and — like the edit fail-safe mode — is registered
	 * from a scope that is never disposed.
	 */
	hostNative?: boolean;
}

export type ContributionRecord<TView = unknown> =
	| MenuContributionRecord
	| ToolbarContributionRecord
	| DeclarativeFormContributionRecord
	| TrustedViewContributionRecord<TView>
	| ModeContributionRecord<TView>
	| TitleBarActionContributionRecord
	| FormatProviderContributionRecord;

const ownerId = (owner: ContributionOwner): string =>
	owner.kind === "plugin" ? owner.pluginId : owner.id;

const TRUSTED_VIEW_KINDS = new Set([
	"sidebar",
	"settings-view",
	"dialog-view",
	"titlebar-group",
]);

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
			(TRUSTED_VIEW_KINDS.has(record.kind) || record.kind === "mode") &&
			!record.owner.trusted
		)
			throw new Error(
				record.kind === "mode"
					? `Plugin ${ownerId(record.owner)} cannot register mode contributions`
					: `Plugin ${ownerId(record.owner)} cannot register trusted view contributions`,
			);
		if (
			record.owner.kind === "plugin" &&
			!record.owner.trusted &&
			(record.kind === "toolbar" || record.kind === "sidebar")
		)
			throw new Error(
				`Plugin ${record.owner.pluginId} cannot register ${record.kind} contributions in MVP`,
			);
		if (record.kind === "mode") {
			if (this.getModes().some((mode) => mode.modeId === record.modeId))
				throw new Error(`Mode ${record.modeId} is already registered`);
			if (record.modeId === FALLBACK_MODE_ID && record.when !== undefined)
				throw new Error(
					`The ${FALLBACK_MODE_ID} fail-safe mode cannot be conditionally hidden`,
				);
		}
		if (record.kind === "titlebar-action" && record.owner.kind === "plugin") {
			const ownerKey = ownerId(record.owner);
			const existing = this.getAll().filter(
				(item) =>
					item.kind === "titlebar-action" && ownerId(item.owner) === ownerKey,
			).length;
			if (existing >= TITLEBAR_ACTIONS_PER_PLUGIN_LIMIT_V0)
				throw new Error(
					`Plugin ${ownerKey} cannot register more than ${TITLEBAR_ACTIONS_PER_PLUGIN_LIMIT_V0} title bar actions`,
				);
		}
		if (record.kind === "format-provider") {
			if (this.getFormatProviders().some((p) => p.formatId === record.formatId))
				throw new Error(`Format ${record.formatId} is already registered`);
			if (record.extensions.length === 0)
				throw new Error(
					`Format ${record.formatId} must declare at least one extension`,
				);
			if (
				record.extensions.some(
					(extension) => normalizeFormatExtension(extension) !== extension,
				)
			)
				throw new Error(
					`Format ${record.formatId} extensions must be normalized (lowercase, no dot)`,
				);
			if (!record.importer && !record.exporter)
				throw new Error(
					`Format ${record.formatId} must provide an importer or an exporter`,
				);
			if (record.hostNative) {
				if (!record.owner.trusted)
					throw new Error(
						`Plugin ${ownerId(record.owner)} cannot register the host-native format`,
					);
				if (!record.importer || !record.exporter)
					throw new Error(
						`Host-native format ${record.formatId} must support import and export`,
					);
				if (this.getFormatProviders().some((p) => p.hostNative))
					throw new Error(
						`A host-native format is already registered; ${record.formatId} cannot claim it`,
					);
			}
		}
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

	getModes(): ModeContributionRecord<TView>[] {
		return this.getAll()
			.filter(
				(item): item is ModeContributionRecord<TView> => item.kind === "mode",
			)
			.sort(
				(left, right) =>
					(left.order ?? 1000) - (right.order ?? 1000) ||
					left.modeId.localeCompare(right.modeId),
			);
	}

	/**
	 * Fail-safe resolution: an active mode whose contribution has vanished
	 * (owner disabled, unloaded or crashed) falls back to the builtin edit
	 * mode instead of leaving the user on a blank viewport.
	 */
	resolveActiveModeId(currentModeId: string): string {
		return this.getModes().some((mode) => mode.modeId === currentModeId)
			? currentModeId
			: FALLBACK_MODE_ID;
	}

	getTitleBarActions(): TitleBarActionContributionRecord[] {
		return this.getAll()
			.filter(
				(item): item is TitleBarActionContributionRecord =>
					item.kind === "titlebar-action",
			)
			.sort(
				(left, right) =>
					(left.order ?? 1000) - (right.order ?? 1000) ||
					left.id.localeCompare(right.id),
			);
	}

	getFormatProviders(): FormatProviderContributionRecord[] {
		return this.getAll()
			.filter(
				(item): item is FormatProviderContributionRecord =>
					item.kind === "format-provider",
			)
			.sort(
				(left, right) =>
					(left.order ?? 1000) - (right.order ?? 1000) ||
					left.formatId.localeCompare(right.formatId),
			);
	}

	getFormatProvider(
		formatId: string,
	): FormatProviderContributionRecord | undefined {
		return this.getFormatProviders().find(
			(provider) => provider.formatId === formatId,
		);
	}

	/** The host-native (TTML) serialization format used by save/autosave. */
	getHostNativeFormatProvider():
		| FormatProviderContributionRecord
		| undefined {
		return this.getFormatProviders().find((provider) => provider.hostNative);
	}

	/**
	 * Resolves the provider handling a file extension. The host-native format
	 * wins ties, then contribution order; extension is normalized first.
	 */
	findFormatProviderForExtension(
		extension: string,
	): FormatProviderContributionRecord | undefined {
		const normalized = normalizeFormatExtension(extension);
		const candidates = this.getFormatProviders().filter((provider) =>
			provider.extensions.includes(normalized),
		);
		return (
			candidates.find((provider) => provider.hostNative) ?? candidates[0]
		);
	}

	getTrustedViews(
		kind: TrustedViewContributionRecord["kind"],
	): TrustedViewContributionRecord<TView>[] {
		return this.getAll().filter(
			(item): item is TrustedViewContributionRecord<TView> =>
				item.kind === kind,
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
		kind: "sidebar" | "settings-view" | "dialog-view" | "titlebar-group";
		title: LocalizedText;
		view: TView;
	}): Disposable;
	registerMode(input: {
		id?: string;
		modeId: string;
		title: LocalizedText;
		order?: number;
		when?: string;
		mainView: TView;
		mainViewKey?: string;
		ribbonView?: TView;
		titleBarActions?: TView;
		hideSidebar?: boolean;
	}): Disposable;
	registerTitleBarAction(input: TitleBarActionContribution): Disposable;
	registerFormatProvider(input: {
		id?: string;
		formatId: string;
		title: LocalizedText;
		extensions: string[];
		mimeType?: string;
		order?: number;
		hostNative?: boolean;
		importer?: LyricFormatImporter;
		exporter?: LyricFormatExporter;
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
					!owner.trusted &&
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
			registerMode: (input) =>
				disposables.add(
					this.contributions.register({
						...input,
						kind: "mode",
						id: input.id ?? `${ownerId(owner)}.mode.${input.modeId}`,
						owner,
					}),
				),
			registerTitleBarAction: (input) => {
				requireOwnNamespace(
					input.command,
					"title bar action command reference",
				);
				if (input.id !== undefined)
					requireOwnNamespace(input.id, "title bar action");
				return disposables.add(
					this.contributions.register({
						kind: "titlebar-action",
						id: input.id ?? `${ownerId(owner)}.titlebar.${input.command}`,
						owner,
						commandId: input.command,
						icon: input.icon,
						tooltip: input.tooltip,
						order: input.order,
						when: input.when,
					}),
				);
			},
			registerFormatProvider: (input) => {
				requireOwnNamespace(input.formatId, "format provider");
				if (input.id !== undefined)
					requireOwnNamespace(input.id, "format provider contribution");
				return disposables.add(
					this.contributions.register({
						kind: "format-provider",
						id: input.id ?? `${ownerId(owner)}.format.${input.formatId}`,
						owner,
						formatId: input.formatId,
						title: input.title,
						extensions: input.extensions.map(normalizeFormatExtension),
						mimeType: input.mimeType,
						order: input.order,
						hostNative: input.hostNative,
						importer: input.importer,
						exporter: input.exporter,
					}),
				);
			},
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
