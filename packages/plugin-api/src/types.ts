export const PLUGIN_API_VERSION = 0 as const;
export const THEME_API_VERSION = 0 as const;
export const THEME_TOKEN_VERSION = 0 as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
	| JsonPrimitive
	| JsonValue[]
	| { [key: string]: JsonValue };

export type CoreCapability =
	| "lyrics.core"
	| "lyrics.ruby"
	| "lyrics.format"
	| "ui.notify"
	| "ui.form"
	| "storage.kv";
export type ExtensionCapability = `extensions.${string}`;
export type Capability = CoreCapability | ExtensionCapability;

export type LocalizedText =
	| string
	| ({ default: string } & Record<string, string>);
export type EnablementExpr = string;

export type MenuLocation =
	| "menu.file"
	| "menu.edit"
	| "menu.tool"
	| "menu.help"
	| "toolbar.edit"
	| "toolbar.sync"
	| "context.lyricLine"
	| "context.lyricWord"
	| "sidebar.panel";

export interface CommandContribution {
	id: string;
	title: LocalizedText;
	category?: LocalizedText;
	enablement?: EnablementExpr;
	defaultKeys?: string[];
}

export interface MenuItemContribution {
	command: string;
	menu: MenuLocation;
	group?: string;
	order?: number;
	when?: EnablementExpr;
}

export interface SettingsPageContribution {
	id: string;
	title: LocalizedText;
	form: FormSchemaV0;
}

/**
 * Per-plugin cap on declarative title bar actions. The title bar is a
 * recovery-entry region; contributions there are icon-sized, count-limited
 * and rendered in a fixed slot that can never cover the mode switcher or
 * the window controls.
 */
export const TITLEBAR_ACTIONS_PER_PLUGIN_LIMIT_V0 = 3;

/**
 * Declarative title bar action: a command reference plus a whitelisted host
 * icon and a plain-text tooltip. No markup, callbacks or layout control.
 */
export interface TitleBarActionContribution {
	id?: string;
	command: string;
	icon: FormIconV0;
	tooltip: LocalizedText;
	order?: number;
	when?: EnablementExpr;
}

/** Per-plugin cap on declared lyric format providers. */
export const FORMATS_PER_PLUGIN_LIMIT_V0 = 8;

/**
 * A declared lyric format provider (requires the `lyrics.format` capability).
 * The plugin only converts text ↔ document structure; file picking, dirty
 * confirmation, project id, filename and the import transaction stay in the
 * host file flow, and the conversion turn cannot apply document edits.
 */
export interface FormatContribution {
	/** Format id, prefixed with the plugin id (`<pluginId>.<name>`). */
	id: string;
	title: LocalizedText;
	/** Lowercase extensions without the dot; the first is the export extension. */
	extensions: string[];
	/** Enables importing files of this format via `plugin_convert_format`. */
	import?: boolean;
	/** Enables exporting the document to this format. */
	export?: boolean;
}

export interface FunctionContributions {
	commands?: CommandContribution[];
	menus?: MenuItemContribution[];
	settings?: SettingsPageContribution[];
	titleBarActions?: TitleBarActionContribution[];
	formats?: FormatContribution[];
}

export interface PluginManifestBase {
	id: string;
	name: string;
	version: string;
	description?: string;
	author?: string;
	homepage?: string;
	license?: string;
	extensions?: Record<string, JsonValue>;
}

export type FunctionPluginRuntime = "builtin" | "extism-wasm" | "trusted-js";
export type ActivationEvent =
	| "onStartup"
	| `onCommand:${string}`
	| "onDocumentChanged";

export interface FunctionPluginManifest extends PluginManifestBase {
	kind: "function";
	apiVersion: number;
	runtime: FunctionPluginRuntime;
	entry: string;
	capabilities: Capability[];
	contributes?: FunctionContributions;
	activationEvents?: ActivationEvent[];
}

export interface ThemePluginManifest extends PluginManifestBase {
	kind: "theme";
	themeApiVersion: number;
	runtime: "none";
	appearance: "light" | "dark" | "both";
	tokens: string;
	styles?: string[];
}

export type PluginManifest = FunctionPluginManifest | ThemePluginManifest;

export interface PluginRubySegmentV0 {
	text: string;
	startTime: number;
	endTime: number;
}

export interface PluginWordV0 {
	id: string;
	text: string;
	startTime: number;
	endTime: number;
	emptyBeat: number;
	romanText: string;
	ruby?: PluginRubySegmentV0[];
}

export interface PluginLineV0 {
	id: string;
	words: PluginWordV0[];
	translation: string;
	romanization: string;
	isBackground: boolean;
	isDuet: boolean;
	startTime: number;
	endTime: number;
	ignoreSync: boolean;
}

export interface PluginMetadataEntryV0 {
	key: string;
	values: string[];
}

export interface PluginDocumentV0 {
	revision: number;
	lines: PluginLineV0[];
	metadata: PluginMetadataEntryV0[];
	/** Host-defined, capability-gated, read-only namespaces. */
	extensions?: Record<string, JsonValue>;
}

export interface PluginSelectionV0 {
	lineIds: string[];
	wordIds: string[];
}

export type NewWordV0 = Omit<PluginWordV0, "id">;
export type NewLineV0 = Omit<PluginLineV0, "id" | "words"> & {
	words: NewWordV0[];
};
export type PluginRubyPatchV0 = { ruby?: PluginRubySegmentV0[] };
export type PluginWordPatchV0 = Partial<Omit<PluginWordV0, "id">>;
export type PluginLinePatchV0 = Partial<Omit<PluginLineV0, "id" | "words">>;

export type DocumentOpV0 =
	| { op: "updateLine"; lineId: string; patch: PluginLinePatchV0 }
	| { op: "updateWord"; wordId: string; patch: PluginWordPatchV0 }
	| { op: "insertLine"; afterLineId: string | null; line: NewLineV0 }
	| { op: "removeLine"; lineId: string }
	| { op: "moveLine"; lineId: string; afterLineId: string | null }
	| {
			op: "insertWord";
			lineId: string;
			afterWordId: string | null;
			word: NewWordV0;
	  }
	| { op: "removeWord"; wordId: string }
	| { op: "setMetadata"; entries: PluginMetadataEntryV0[] }
	| {
			op: "replaceDocument";
			lines: NewLineV0[];
			metadata: PluginMetadataEntryV0[];
	  };

export interface LyricsApplyEditParams {
	expectedRevision: number;
	label: string;
	ops: DocumentOpV0[];
}

export type EditSource = "user" | "plugin" | "host" | "import";
export interface ApplyEditResult {
	revision: number;
	appliedOps: number;
}

export interface NotifyParams {
	level: "info" | "success" | "warning" | "error";
	message: string;
	detail?: string;
	timeoutMs?: number;
}

export type PluginErrorCode =
	| "revision-conflict"
	| "permission-denied"
	| "invalid-params"
	| "not-found"
	| "unsupported-api-version"
	| "timeout"
	| "cancelled"
	| "payload-too-large"
	| "limit-exceeded"
	| "plugin-crashed"
	| "internal";

export interface PluginError {
	code: PluginErrorCode;
	message: string;
	data?: JsonValue;
}

export type HostResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: PluginError };

export interface ActivateParams {
	pluginId: string;
	apiVersion: number;
	grantedCapabilities: Capability[];
	locale: string;
	hostVersion: string;
}

export interface ExecuteCommandParams {
	commandId: string;
	args?: JsonValue;
}

export type PluginEventV0 =
	| {
			type: "document.changed";
			revision: number;
			source: EditSource;
			changedLineIds: string[];
			changedWordIds: string[];
	  }
	| { type: "document.undo"; revision: number }
	| { type: "document.redo"; revision: number }
	| { type: "selection.changed"; selection: PluginSelectionV0 };

export const PLUGIN_EXPORTS = {
	activate: "plugin_activate",
	deactivate: "plugin_deactivate",
	executeCommand: "plugin_execute_command",
	handleEvent: "plugin_handle_event",
	resumeForm: "plugin_resume_form",
	convertFormat: "plugin_convert_format",
} as const;

/**
 * Upper bound on the text payload of one format conversion, in UTF-16 units.
 * Matches the runtime's 1 MiB turn payload cap so oversized files fail with
 * one consistent error before a worker round-trip.
 */
export const FORMAT_CONVERSION_TEXT_LIMIT_V0 = 1024 * 1024;

/**
 * Params passed to the guest's `plugin_convert_format` export. Conversion
 * turns are pure: `lyrics.applyEdit` is rejected inside them — an import is
 * committed by the host file flow as one import transaction afterwards.
 */
export type ConvertFormatParamsV0 =
	| { formatId: string; direction: "import"; text: string }
	| {
			formatId: string;
			direction: "export";
			document: { lines: PluginLineV0[]; metadata: PluginMetadataEntryV0[] };
	  };

/**
 * Value shape a guest returns from `plugin_convert_format` (wrapped in a
 * successful PluginReturnV0). The kind must match the requested direction.
 */
export type FormatConversionResultV0 =
	| { kind: "imported"; lines: NewLineV0[]; metadata: PluginMetadataEntryV0[] }
	| { kind: "exported"; text: string };

/**
 * Import namespace and function name of the single synchronous host bridge a
 * WASM guest may call. The guest passes one HostCallV0 JSON string and gets
 * one HostResponseV0 JSON string back. `ui.showForm` is NOT available on this
 * bridge (WASM execution cannot suspend for user input); interactive forms go
 * through the command outcome protocol below instead.
 */
export const WASM_HOST_MODULE = "extism:host/user";
export const WASM_HOST_CALL_FUNCTION = "amll_host_call";

/**
 * Upper bound on showForm outcome rounds inside one command invocation. The
 * host aborts the invocation when a guest keeps requesting forms past it.
 */
export const FORM_ROUNDS_PER_INVOCATION_LIMIT_V0 = 8;

/**
 * Value shape a WASM guest returns from `plugin_execute_command` and
 * `plugin_resume_form` (wrapped in a successful PluginReturnV0). Because a
 * synchronous WASM export cannot block on user input, a form request ends the
 * current turn: the host renders the schema and then calls
 * `plugin_resume_form` with the sanitized result plus the guest's opaque
 * `state` echoed back verbatim.
 */
export type PluginCommandOutcomeV0 =
	| { kind: "done"; value?: JsonValue }
	| { kind: "showForm"; schema: FormSchemaV0; state?: JsonValue };

/** Params passed to the guest's `plugin_resume_form` export. */
export interface ResumeFormParamsV0 {
	commandId: string;
	/** Opaque continuation state from the guest's showForm outcome. */
	state?: JsonValue;
	result: FormResultV0;
}

/** Params passed to the guest's `plugin_handle_event` export. */
export interface HandleEventParamsV0 {
	event: PluginEventV0;
}

/**
 * Self-contained, importable WASM function plugin package: manifest plus the
 * base64-encoded module for `manifest.entry`. Like theme packages this is a
 * single trust-boundary format — the host never fetches remote code for it.
 */
export interface FunctionPluginPackageV0 {
	packageVersion: 0;
	manifest: FunctionPluginManifest;
	/** base64 without data: prefix; decodes to the wasm module bytes. */
	wasm: string;
}

export type FormValueV0 = string | number | boolean;

export const FORM_FLUENT_ICON_NAMES_V0 = [
	"AddRegular",
	"ArrowDownRegular",
	"ArrowLeftRegular",
	"ArrowResetRegular",
	"ArrowRightRegular",
	"ArrowUpRegular",
	"CheckmarkCircleRegular",
	"CheckmarkRegular",
	"ChevronDownRegular",
	"ChevronLeftRegular",
	"ChevronRightRegular",
	"ChevronUpRegular",
	"ClockRegular",
	"CopyRegular",
	"CutRegular",
	"DeleteRegular",
	"DismissRegular",
	"DocumentRegular",
	"EditRegular",
	"ErrorCircleRegular",
	"EyeOffRegular",
	"EyeRegular",
	"FolderOpenRegular",
	"HistoryRegular",
	"HomeRegular",
	"ImageRegular",
	"InfoRegular",
	"LinkRegular",
	"LockClosedRegular",
	"MusicNote1Regular",
	"OpenRegular",
	"PauseRegular",
	"PersonRegular",
	"PlayRegular",
	"QuestionCircleRegular",
	"SaveRegular",
	"SearchRegular",
	"SettingsRegular",
	"StopRegular",
	"SubtractRegular",
	"TimerRegular",
	"TranslateRegular",
	"WarningRegular",
] as const;

export type FormFluentIconNameV0 = (typeof FORM_FLUENT_ICON_NAMES_V0)[number];

export interface FormIconV0 {
	source: "@fluentui/react-icons";
	name: FormFluentIconNameV0;
}

/**
 * Declarative entrance animation. Presets are implemented entirely by the
 * host (which also honors `prefers-reduced-motion`); the protocol never
 * accepts CSS text, keyframes or durations in milliseconds.
 */
export const FORM_ANIMATION_PRESETS_V0 = [
	"fade",
	"slide-up",
	"scale-in",
] as const;
export type FormAnimationPresetV0 = (typeof FORM_ANIMATION_PRESETS_V0)[number];

export const FORM_ANIMATION_SPEEDS_V0 = ["fast", "normal", "slow"] as const;
export type FormAnimationSpeedV0 = (typeof FORM_ANIMATION_SPEEDS_V0)[number];

export interface FormAnimationV0 {
	preset: FormAnimationPresetV0;
	/** Defaults to "normal". */
	speed?: FormAnimationSpeedV0;
}

export interface FormConditionV0 {
	field: string;
	equals: FormValueV0;
}

export interface FormOptionV0 {
	value: string;
	label: LocalizedText;
	disabled?: boolean;
	icon?: FormIconV0;
}

export interface FormFieldPresentationV0 {
	visibleWhen?: FormConditionV0;
	labelPlacement?: "top" | "hidden";
	width?: "full" | "compact";
	controlSize?: "small" | "medium";
	icon?: FormIconV0;
	/** Plays when the field mounts (initial render or `visibleWhen` toggling). */
	animation?: FormAnimationV0;
}

export type FormFieldV0 =
	| ({
			kind: "text";
			key: string;
			label: LocalizedText;
			default?: string;
			placeholder?: string;
			required?: boolean;
			maxLength?: number;
			multiline?: boolean;
	  } & FormFieldPresentationV0)
	| ({
			kind: "number";
			key: string;
			label: LocalizedText;
			default?: number;
			min?: number;
			max?: number;
			step?: number;
			required?: boolean;
			control?: "input" | "stepper";
			decrementIcon?: FormIconV0;
			incrementIcon?: FormIconV0;
	  } & FormFieldPresentationV0)
	| ({
			kind: "boolean";
			key: string;
			label: LocalizedText;
			default?: boolean;
	  } & FormFieldPresentationV0)
	| ({
			kind: "select" | "radio";
			key: string;
			label: LocalizedText;
			options: FormOptionV0[];
			default?: string;
			orientation?: "vertical" | "horizontal";
	  } & FormFieldPresentationV0)
	| ({
			kind: "note";
			text: LocalizedText;
			tone?: "default" | "muted";
	  } & Pick<FormFieldPresentationV0, "visibleWhen" | "icon" | "animation">)
	| {
			kind: "group";
			id: string;
			label?: LocalizedText;
			direction?: "row" | "column";
			align?: "start" | "center" | "end";
			gap?: "small" | "medium" | "large";
			indent?: boolean;
			visibleWhen?: FormConditionV0;
			icon?: FormIconV0;
			animation?: FormAnimationV0;
			fields: FormFieldV0[];
	  };

export interface FormActionV0 {
	id: string;
	label: LocalizedText;
	/** "submit" resolves with sanitized values; "cancel" resolves without. Defaults to "submit". */
	role?: "submit" | "cancel";
	/** Defaults to "primary" for submit actions and "neutral" for cancel actions. */
	tone?: "primary" | "danger" | "neutral";
	icon?: FormIconV0;
}

export interface FormSchemaV0 {
	title: LocalizedText;
	description?: LocalizedText;
	fields: FormFieldV0[];
	size?: "small" | "medium" | "large";
	icon?: FormIconV0;
	/** Entrance animation for the whole dialog body. */
	animation?: FormAnimationV0;
	submitLabel?: LocalizedText;
	cancelLabel?: LocalizedText;
	submitIcon?: FormIconV0;
	cancelIcon?: FormIconV0;
	/** Replaces the default cancel/apply footer; the legacy submit/cancel labels and icons are ignored when set. */
	actions?: FormActionV0[];
}

export type FormResultV0 =
	| { submitted: true; action?: string; values: Record<string, FormValueV0> }
	| { submitted: false; action?: string };

/**
 * Named token contract (v0). Unknown token names are rejected so a future
 * tokenVersion bump can add names without silently ignoring typos today.
 */
export const THEME_COLOR_TOKEN_NAMES_V0 = [
	"panelBackground",
	"textPrimary",
	"textSecondary",
	"accent",
	"border",
	"danger",
] as const;
export type ThemeColorTokenNameV0 = (typeof THEME_COLOR_TOKEN_NAMES_V0)[number];

export const THEME_LYRICS_TOKEN_NAMES_V0 = [
	"lineBackground",
	"lineSelectedBackground",
	"lineHoverBackground",
	"wordText",
	"wordSecondaryText",
	"wordHighlight",
] as const;
export type ThemeLyricsTokenNameV0 =
	(typeof THEME_LYRICS_TOKEN_NAMES_V0)[number];

export const THEME_SPECTROGRAM_TOKEN_NAMES_V0 = [
	"background",
	"playhead",
	"lineSegment",
	"wordSegment",
	"gapSegment",
	"waveform",
] as const;
export type ThemeSpectrogramTokenNameV0 =
	(typeof THEME_SPECTROGRAM_TOKEN_NAMES_V0)[number];

/**
 * Stable styling hooks exposed by the host. Theme package CSS may only select
 * inside these `data-slot`/`data-part` scopes; everything else (dialogs,
 * permission prompts, the plugin manager, toasts) lives outside them.
 */
export const THEME_SLOT_NAMES_V0 = [
	"app-root",
	"background-layer",
	"title-bar",
	"ribbon-bar",
	"sidebar",
	"lyric-editor",
	"preview",
	"audio-controls",
	"spectrogram",
] as const;
export type ThemeSlotNameV0 = (typeof THEME_SLOT_NAMES_V0)[number];

export const THEME_PART_NAMES_V0 = ["lyric-line", "lyric-word"] as const;
export type ThemePartNameV0 = (typeof THEME_PART_NAMES_V0)[number];

/**
 * UI surfaces whose background a theme (or the user) may replace. Modal
 * surfaces form a fallback chain small → medium → large: styling the medium
 * or small size therefore requires the large one to be defined too.
 */
export const THEME_SURFACE_NAMES_V0 = [
	"titleBar",
	"ribbonBar",
	"dropdownMenu",
	"playControls",
	"modalLarge",
	"modalMedium",
	"modalSmall",
] as const;
export type ThemeSurfaceNameV0 = (typeof THEME_SURFACE_NAMES_V0)[number];

export interface ThemeTokenColorsV0
	extends Partial<Record<ThemeColorTokenNameV0, string>> {}
export interface ThemeTokenLyricsV0
	extends Partial<Record<ThemeLyricsTokenNameV0, string>> {}
export interface ThemeTokenSpectrogramV0
	extends Partial<Record<ThemeSpectrogramTokenNameV0, string>> {}
export interface ThemeTokenBackgroundV0 {
	kind: "solid" | "gradient" | "none";
	value?: string;
}

/**
 * Background of one UI surface. `image` values must reference a package
 * asset (`asset:<name>`); `scrim` is an overlay color painted above the
 * image to keep text readable.
 */
export interface ThemeSurfaceBackgroundV0 {
	kind: "solid" | "gradient" | "image" | "none";
	value?: string;
	scrim?: string;
}

export interface ThemeTokenSurfacesV0
	extends Partial<Record<ThemeSurfaceNameV0, ThemeSurfaceBackgroundV0>> {}

/** Appearance-specific overrides layered on top of the base token groups. */
export interface ThemeTokenModeOverridesV0 {
	color?: ThemeTokenColorsV0;
	lyrics?: ThemeTokenLyricsV0;
	spectrogram?: ThemeTokenSpectrogramV0;
	background?: ThemeTokenBackgroundV0;
	surfaces?: ThemeTokenSurfacesV0;
}

export interface ThemeTokensV0 {
	tokenVersion: number;
	color?: ThemeTokenColorsV0;
	font?: { family?: string; monoFamily?: string; scale?: number };
	spacing?: { scale?: number; radius?: string };
	lyrics?: ThemeTokenLyricsV0;
	spectrogram?: ThemeTokenSpectrogramV0;
	background?: ThemeTokenBackgroundV0;
	surfaces?: ThemeTokenSurfacesV0;
	light?: ThemeTokenModeOverridesV0;
	dark?: ThemeTokenModeOverridesV0;
}

/** Binary asset carried by a theme package, referenced from CSS as `asset:<name>`. */
export interface ThemePackageAssetV0 {
	mime: string;
	/** base64 without data: prefix */
	data: string;
}

/**
 * Self-contained, declarative theme package: manifest + tokens + validated
 * CSS text + inline assets. The host never fetches remote resources for a
 * theme; assets become local object URLs at apply time.
 */
export interface ThemePackageV0 {
	packageVersion: 0;
	manifest: ThemePluginManifest;
	tokens: ThemeTokensV0;
	/** package-relative path -> CSS text; keys must cover manifest.styles */
	styles?: Record<string, string>;
	/** asset name -> asset; names are referenced from CSS via url(asset:<name>) */
	assets?: Record<string, ThemePackageAssetV0>;
}

export type HostMethod =
	| "lyrics.getDocument"
	| "lyrics.getSelection"
	| "lyrics.applyEdit"
	| "ui.notify"
	| "ui.showForm"
	| "storage.get"
	| "storage.set"
	| "storage.delete"
	| "storage.keys";

export type HostCallV0 =
	| { id: string; method: "lyrics.getDocument"; params: Record<string, never> }
	| { id: string; method: "lyrics.getSelection"; params: Record<string, never> }
	| { id: string; method: "lyrics.applyEdit"; params: LyricsApplyEditParams }
	| { id: string; method: "ui.notify"; params: NotifyParams }
	| { id: string; method: "ui.showForm"; params: { schema: FormSchemaV0 } }
	| { id: string; method: "storage.get"; params: { key: string } }
	| {
			id: string;
			method: "storage.set";
			params: { key: string; value: JsonValue };
	  }
	| { id: string; method: "storage.delete"; params: { key: string } }
	| { id: string; method: "storage.keys"; params: Record<string, never> };

export interface HostResponseV0 {
	id: string;
	result: HostResult<JsonValue>;
}

/** JSON result returned by a guest lifecycle or command export. */
export type PluginReturnV0 = HostResult<JsonValue>;

export interface ParseIssue {
	path: string;
	message: string;
}

export type ParseResult<T> =
	| { ok: true; value: T }
	| { ok: false; issues: ParseIssue[] };
