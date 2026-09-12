import type {
	DocumentOpV0,
	FormResultV0,
	FormSchemaV0,
	JsonValue,
	MenuItemContribution,
	MenuLocation,
	NotifyParams,
	PluginDocumentV0,
	PluginSelectionV0,
	TitleBarActionContribution,
} from "@amll-ttml-tool/plugin-api";
import {
	applyDocumentOpsV0,
	TITLEBAR_ACTIONS_PER_PLUGIN_LIMIT_V0,
} from "@amll-ttml-tool/plugin-api";
import type {
	DisposableV0,
	DocumentChangedEventV0,
	TrustedJsApplyEditOptionsV0,
	TrustedJsCommandRegistrationV0,
	TrustedJsFormatProviderV0,
	TrustedJsHostV0,
	TrustedJsModeV0,
	TrustedJsTrustedViewV0,
} from "../host";
import { TRUSTED_JS_SDK_VERSION } from "../host";

export interface MockTrustedJsHostOptions {
	pluginId: string;
	document?: PluginDocumentV0;
	selection?: PluginSelectionV0;
	onShowForm?: (schema: FormSchemaV0) => FormResultV0 | Promise<FormResultV0>;
	onNotify?: (params: NotifyParams) => void;
}

/** One committed `applyEdit` call, for asserting single-transaction behavior. */
export interface MockTrustedJsEditRecord {
	label: string;
	appliedOps: number;
	revision: number;
}

const emptyDocument = (): PluginDocumentV0 => ({
	revision: 0,
	lines: [],
	metadata: [],
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

class Registrations<T> {
	private readonly entries = new Map<string, T>();

	constructor(private readonly what: string) {}

	add(id: string, entry: T): DisposableV0 {
		if (this.entries.has(id))
			throw new Error(`${this.what} ${id} is already registered`);
		this.entries.set(id, entry);
		return {
			dispose: () => {
				if (this.entries.get(id) === entry) this.entries.delete(id);
			},
		};
	}

	get(id: string): T | undefined {
		return this.entries.get(id);
	}

	ids(): string[] {
		return [...this.entries.keys()];
	}

	values(): T[] {
		return [...this.entries.values()];
	}

	clear(): void {
		this.entries.clear();
	}
}

const diffIds = <T extends { id: string }>(
	before: readonly T[],
	after: readonly T[],
): string[] => {
	const previous = new Map(before.map((item) => [item.id, item]));
	const next = new Map(after.map((item) => [item.id, item]));
	const changed = new Set<string>();
	for (const [id, item] of next)
		if (JSON.stringify(previous.get(id)) !== JSON.stringify(item))
			changed.add(id);
	for (const id of previous.keys()) if (!next.has(id)) changed.add(id);
	return [...changed];
};

/**
 * In-memory `TrustedJsHostV0` for running a plugin module in Node without the
 * application: a projected document with revision + undo, namespaced command,
 * menu, title bar, format and view registries, an isolated kv map and
 * scripted form/notify hooks. Semantics mirror the real host closely enough
 * that the same plugin source and the same contract suite run against both.
 */
export class MockTrustedJsHost implements TrustedJsHostV0 {
	readonly sdkVersion = TRUSTED_JS_SDK_VERSION;
	readonly pluginId: string;
	readonly notifications: NotifyParams[] = [];
	readonly shownForms: FormSchemaV0[] = [];
	readonly edits: MockTrustedJsEditRecord[] = [];

	private snapshot: PluginDocumentV0;
	private selectionState: PluginSelectionV0;
	private readonly undoStack: PluginDocumentV0[] = [];
	private readonly changeListeners = new Set<
		(event: DocumentChangedEventV0) => void
	>();
	private readonly commandRegistry =
		new Registrations<TrustedJsCommandRegistrationV0>("Command");
	private readonly menuRegistry = new Registrations<
		MenuItemContribution & { id: string }
	>("Menu contribution");
	private readonly titleBarRegistry = new Registrations<
		TitleBarActionContribution & { id: string }
	>("Title bar action");
	private readonly formatRegistry =
		new Registrations<TrustedJsFormatProviderV0>("Format");
	private readonly modeRegistry = new Registrations<TrustedJsModeV0>("Mode");
	private readonly viewRegistry = new Registrations<TrustedJsTrustedViewV0>(
		"Trusted view",
	);
	private readonly kvStore = new Map<string, JsonValue>();
	private idSequence = 0;

	constructor(private readonly options: MockTrustedJsHostOptions) {
		this.pluginId = options.pluginId;
		this.snapshot = clone(options.document ?? emptyDocument());
		this.selectionState = clone(
			options.selection ?? { lineIds: [], wordIds: [] },
		);
	}

	private requireOwnNamespace(id: string, what: string): void {
		if (!id.startsWith(`${this.pluginId}.`))
			throw new Error(
				`Plugin ${this.pluginId} cannot register ${what} ${id} outside its own namespace`,
			);
	}

	readonly document: TrustedJsHostV0["document"] = (() => {
		// `this` inside the getter would be the literal, so capture the host.
		const host = this;
		return {
			readSnapshot: () => clone(host.snapshot),
			get revision() {
				return host.snapshot.revision;
			},
			applyEdit: (ops, label, options) => host.applyEdit(ops, label, options),
			onChanged: (listener) => {
				host.changeListeners.add(listener);
				return { dispose: () => host.changeListeners.delete(listener) };
			},
		} satisfies TrustedJsHostV0["document"];
	})();

	readonly selection: TrustedJsHostV0["selection"] = {
		get: () => clone(this.selectionState),
	};

	readonly commands: TrustedJsHostV0["commands"] = {
		register: (input) => {
			this.requireOwnNamespace(input.id, "command");
			return this.commandRegistry.add(input.id, input);
		},
	};

	readonly menus: TrustedJsHostV0["menus"] = {
		register: (input) => {
			this.requireOwnNamespace(input.command, "menu command reference");
			if (input.id !== undefined)
				this.requireOwnNamespace(input.id, "menu contribution");
			const id =
				input.id ?? `${this.pluginId}.menu.${input.menu}.${input.command}`;
			return this.menuRegistry.add(id, { ...input, id });
		},
	};

	readonly titleBarActions: TrustedJsHostV0["titleBarActions"] = {
		register: (input) => {
			this.requireOwnNamespace(
				input.command,
				"title bar action command reference",
			);
			if (input.id !== undefined)
				this.requireOwnNamespace(input.id, "title bar action");
			if (
				this.titleBarRegistry.ids().length >=
				TITLEBAR_ACTIONS_PER_PLUGIN_LIMIT_V0
			)
				throw new Error(
					`Plugin ${this.pluginId} cannot register more than ${TITLEBAR_ACTIONS_PER_PLUGIN_LIMIT_V0} title bar actions`,
				);
			const id = input.id ?? `${this.pluginId}.titlebar.${input.command}`;
			return this.titleBarRegistry.add(id, { ...input, id });
		},
	};

	readonly ui: TrustedJsHostV0["ui"] = {
		showForm: async (schema) => {
			this.shownForms.push(clone(schema));
			return (await this.options.onShowForm?.(schema)) ?? { submitted: false };
		},
		notify: (params) => {
			this.notifications.push(clone(params));
			this.options.onNotify?.(params);
		},
	};

	readonly storage: TrustedJsHostV0["storage"] = {
		kv: {
			get: async (key) => clone(this.kvStore.get(key) ?? null),
			set: async (key, value) => {
				this.kvStore.set(key, clone(value));
			},
			delete: async (key) => {
				this.kvStore.delete(key);
			},
			keys: async () => [...this.kvStore.keys()].sort(),
		},
	};

	readonly formats: TrustedJsHostV0["formats"] = {
		register: (provider) => {
			this.requireOwnNamespace(provider.formatId, "format provider");
			if (provider.extensions.length === 0)
				throw new Error(
					`Format ${provider.formatId} must declare at least one extension`,
				);
			if (!provider.importer && !provider.exporter)
				throw new Error(
					`Format ${provider.formatId} must provide an importer or an exporter`,
				);
			return this.formatRegistry.add(provider.formatId, provider);
		},
	};

	readonly views: TrustedJsHostV0["views"] = {
		registerMode: (input) => this.modeRegistry.add(input.modeId, input),
		registerView: (input) => this.viewRegistry.add(input.id, input),
	};

	// ---- test-side surface -------------------------------------------------

	/** Runs a registered command exactly as the host command palette would. */
	async executeCommand(commandId: string, args?: JsonValue): Promise<unknown> {
		const command = this.commandRegistry.get(commandId);
		if (!command) throw new Error(`Command ${commandId} is not registered`);
		return command.handler(args);
	}

	getCommandIds(): string[] {
		return this.commandRegistry.ids();
	}

	getMenus(location?: MenuLocation): (MenuItemContribution & { id: string })[] {
		return this.menuRegistry
			.values()
			.filter((menu) => location === undefined || menu.menu === location);
	}

	getTitleBarActions(): (TitleBarActionContribution & { id: string })[] {
		return this.titleBarRegistry.values();
	}

	getFormatProviders(): TrustedJsFormatProviderV0[] {
		return this.formatRegistry.values();
	}

	getModes(): TrustedJsModeV0[] {
		return this.modeRegistry.values();
	}

	getViews(): TrustedJsTrustedViewV0[] {
		return this.viewRegistry.values();
	}

	getRevision(): number {
		return this.snapshot.revision;
	}

	setSelection(selection: PluginSelectionV0): void {
		this.selectionState = clone(selection);
	}

	/** Reverts the last committed edit as one record (host undo semantics). */
	undo(): boolean {
		const previous = this.undoStack.pop();
		if (!previous) return false;
		const before = this.snapshot;
		this.snapshot = previous;
		this.snapshot.revision = before.revision + 1;
		this.emitChanged(before, this.snapshot, "user");
		return true;
	}

	canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	/** Simulates the host disposing the plugin scope: every registration goes. */
	dispose(): void {
		this.commandRegistry.clear();
		this.menuRegistry.clear();
		this.titleBarRegistry.clear();
		this.formatRegistry.clear();
		this.modeRegistry.clear();
		this.viewRegistry.clear();
		this.changeListeners.clear();
	}

	// ---- internals ---------------------------------------------------------

	private applyEdit(
		ops: readonly DocumentOpV0[],
		label: string,
		options?: TrustedJsApplyEditOptionsV0,
	) {
		const expected = options?.expectedRevision ?? -1;
		if (expected !== -1 && expected !== this.snapshot.revision)
			return {
				ok: false as const,
				error: {
					code: "revision-conflict" as const,
					message: `expected ${expected}, actual ${this.snapshot.revision}`,
				},
			};
		const previous = clone(this.snapshot);
		const failure = applyDocumentOpsV0(this.snapshot, ops, {
			nextId: (kind) => {
				this.idSequence += 1;
				return `mock-${kind}-${this.idSequence}`;
			},
		});
		if (failure !== undefined) {
			this.snapshot = previous;
			return {
				ok: false as const,
				error: { code: "not-found" as const, message: failure },
			};
		}
		this.undoStack.push(previous);
		this.snapshot.revision += 1;
		this.edits.push({
			label,
			appliedOps: ops.length,
			revision: this.snapshot.revision,
		});
		this.emitChanged(previous, this.snapshot, "plugin");
		return {
			ok: true as const,
			value: { revision: this.snapshot.revision, appliedOps: ops.length },
		};
	}

	private emitChanged(
		before: PluginDocumentV0,
		after: PluginDocumentV0,
		source: DocumentChangedEventV0["source"],
	): void {
		const event: DocumentChangedEventV0 = {
			revision: after.revision,
			source,
			changedLineIds: diffIds(before.lines, after.lines),
			changedWordIds: diffIds(
				before.lines.flatMap((line) => line.words),
				after.lines.flatMap((line) => line.words),
			),
			...(source === "plugin" ? { sourcePluginId: this.pluginId } : {}),
		};
		for (const listener of [...this.changeListeners]) listener(event);
	}
}
