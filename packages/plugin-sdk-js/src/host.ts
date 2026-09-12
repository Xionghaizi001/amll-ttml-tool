import type {
	ApplyEditResult,
	DocumentOpV0,
	EditSource,
	EnablementExpr,
	FormResultV0,
	FormSchemaV0,
	HostResult,
	JsonValue,
	LocalizedText,
	MenuItemContribution,
	NewLineV0,
	NotifyParams,
	PluginDocumentV0,
	PluginLineV0,
	PluginMetadataEntryV0,
	PluginSelectionV0,
	TitleBarActionContribution,
} from "@amll-ttml-tool/plugin-api";
import type { ComponentType } from "react";

/**
 * Trusted-js runtime SDK (v0). A trusted-js plugin is application-grade code
 * by admission, but everything it touches goes through this surface: the
 * document is the same `PluginDocumentV0` projection the WASM tier sees,
 * edits are `DocumentOpV0` batches committed as one host transaction, and
 * every registration is namespaced under the plugin id and disposed with the
 * plugin. Nothing here names a host-internal type: the SDK compiles without
 * the host source tree, and a host refactor cannot break a store artifact.
 */
export const TRUSTED_JS_SDK_VERSION = 0 as const;

export interface DisposableV0 {
	dispose(): void;
}

/** Document change notification delivered to `document.onChanged` listeners. */
export interface DocumentChangedEventV0 {
	revision: number;
	source: EditSource;
	changedLineIds: string[];
	changedWordIds: string[];
	/** Set when the transaction was committed by a plugin (possibly this one). */
	sourcePluginId?: string;
}

export interface TrustedJsApplyEditOptionsV0 {
	/**
	 * Revision the ops were computed against. When set, the host rejects the
	 * edit with `revision-conflict` if the document moved on (an awaited form
	 * is the typical gap). Omit to apply against whatever is current.
	 */
	expectedRevision?: number;
}

export interface TrustedJsDocumentV0 {
	/** Stable v0 projection (ruby included); internal host fields are absent. */
	readSnapshot(): PluginDocumentV0;
	/** Current document revision; increments once per transaction. */
	readonly revision: number;
	/**
	 * Commits one batch of ops as a single transaction: one revision, one
	 * undo record, labeled plugin provenance. Fields the projection does not
	 * carry survive untouched because ops patch by id.
	 */
	applyEdit(
		ops: readonly DocumentOpV0[],
		label: string,
		options?: TrustedJsApplyEditOptionsV0,
	): HostResult<ApplyEditResult>;
	onChanged(listener: (event: DocumentChangedEventV0) => void): DisposableV0;
}

export interface TrustedJsSelectionV0 {
	/** Currently selected line and word ids. */
	get(): PluginSelectionV0;
}

export interface TrustedJsCommandRegistrationV0 {
	/** Must be prefixed with `<pluginId>.`. */
	id: string;
	title?: LocalizedText;
	category?: LocalizedText;
	/** Enablement expression (same grammar as manifest `when` clauses); fails closed. */
	enablement?: EnablementExpr;
	handler(args?: JsonValue): unknown | Promise<unknown>;
}

export interface TrustedJsCommandsV0 {
	register(input: TrustedJsCommandRegistrationV0): DisposableV0;
}

export interface TrustedJsMenusV0 {
	/** The referenced command (and an explicit id) must live in the plugin namespace. */
	register(input: MenuItemContribution & { id?: string }): DisposableV0;
}

export interface TrustedJsTitleBarActionsV0 {
	/** Declarative title bar action; the host caps the count per plugin. */
	register(input: TitleBarActionContribution): DisposableV0;
}

export interface TrustedJsUiV0 {
	/** Renders a declarative form and resolves with the sanitized result. */
	showForm(schema: FormSchemaV0): Promise<FormResultV0>;
	notify(params: NotifyParams): void;
}

/** Per-plugin isolated key-value store (the `amll-plugin-kv` namespace). */
export interface TrustedJsKvV0 {
	get(key: string): Promise<JsonValue | null>;
	set(key: string, value: JsonValue): Promise<void>;
	delete(key: string): Promise<void>;
	keys(): Promise<string[]>;
}

export interface TrustedJsStorageV0 {
	kv: TrustedJsKvV0;
}

export interface TrustedJsFormatImportInputV0 {
	text: string;
	/** Original file name (with extension), for diagnostics only. */
	fileName: string;
}

/** Lines and metadata of an imported document; the host assigns every id. */
export interface TrustedJsFormatImportResultV0 {
	lines: NewLineV0[];
	metadata: PluginMetadataEntryV0[];
}

export interface TrustedJsFormatExportInputV0 {
	document: { lines: PluginLineV0[]; metadata: PluginMetadataEntryV0[] };
	/** Target file name, for diagnostics only. */
	fileName: string;
}

/**
 * A lyric format provider: pure text <-> projection conversion. File picking,
 * dirty confirmation, filename derivation and the import transaction are host
 * concerns. Registered into the same provider registry as builtin formats.
 */
export interface TrustedJsFormatProviderV0 {
	/** Must be prefixed with `<pluginId>.`. */
	formatId: string;
	title: LocalizedText;
	/** Lowercase extensions without the dot; the first is the export extension. */
	extensions: string[];
	mimeType?: string;
	order?: number;
	importer?(
		input: TrustedJsFormatImportInputV0,
	): TrustedJsFormatImportResultV0 | Promise<TrustedJsFormatImportResultV0>;
	exporter?(input: TrustedJsFormatExportInputV0): string | Promise<string>;
}

export interface TrustedJsFormatsV0 {
	register(provider: TrustedJsFormatProviderV0): DisposableV0;
}

/** Host views are React components rendered by the application. */
export type TrustedJsViewV0 = ComponentType;

export interface TrustedJsModeV0 {
	modeId: string;
	title: LocalizedText;
	order?: number;
	/** Enablement gating the switcher entry. */
	when?: EnablementExpr;
	mainView: TrustedJsViewV0;
	/** Modes sharing a key keep the main view mounted across switches. */
	mainViewKey?: string;
	ribbonView?: TrustedJsViewV0;
	titleBarActions?: TrustedJsViewV0;
	hideSidebar?: boolean;
}

export type TrustedJsTrustedViewKindV0 =
	| "sidebar"
	| "settings-view"
	| "dialog-view"
	| "titlebar-group";

export interface TrustedJsTrustedViewV0 {
	id: string;
	kind: TrustedJsTrustedViewKindV0;
	title: LocalizedText;
	view: TrustedJsViewV0;
}

/** Trusted-tier only: first-class pages and host view slots. */
export interface TrustedJsViewsV0 {
	registerMode(input: TrustedJsModeV0): DisposableV0;
	registerView(input: TrustedJsTrustedViewV0): DisposableV0;
}

/**
 * Everything a trusted-js plugin may reach. Implemented by the application
 * host and by `MockTrustedJsHost` (testing); both pass the same contract
 * suite, which is the freeze gate for this tier.
 */
export interface TrustedJsHostV0 {
	readonly sdkVersion: typeof TRUSTED_JS_SDK_VERSION;
	document: TrustedJsDocumentV0;
	selection: TrustedJsSelectionV0;
	commands: TrustedJsCommandsV0;
	menus: TrustedJsMenusV0;
	titleBarActions: TrustedJsTitleBarActionsV0;
	ui: TrustedJsUiV0;
	storage: TrustedJsStorageV0;
	formats: TrustedJsFormatsV0;
	views: TrustedJsViewsV0;
}

export interface TrustedJsActivationContextV0 {
	pluginId: string;
	host: TrustedJsHostV0;
	/** Aborted when the plugin is unloaded, disabled or crash-disabled. */
	signal: AbortSignal;
}

export type TrustedJsCleanupV0 = () => void | Promise<void>;

/** What activate() may return: a cleanup, or nothing at all. */
// biome-ignore lint/suspicious/noConfusingVoidType: plain `activate(): void` plugins are valid
export type TrustedJsActivateResultV0 = TrustedJsCleanupV0 | undefined | void;

/**
 * Shape of a trusted-js plugin ES module (its default export or namespace).
 * Registrations made through `host` are disposed by the host after
 * `cleanup` runs; return a cleanup only for resources outside the host API.
 */
export interface TrustedJsPluginModuleV0 {
	activate(
		context: TrustedJsActivationContextV0,
	): TrustedJsActivateResultV0 | Promise<TrustedJsActivateResultV0>;
}

/** Identity helper giving plugin authors type checking on their module shape. */
export const definePlugin = (
	module: TrustedJsPluginModuleV0,
): TrustedJsPluginModuleV0 => module;
