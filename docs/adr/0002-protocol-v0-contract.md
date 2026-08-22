# ADR 0002：Plugin 协议 v0 契约草案

- 状态：已接受（experimental v0，可破坏性变更）
- 日期：2026-08-19
- 关联：[ADR 0001](./0001-plugin-architecture.md)

本文件是 `packages/plugin-api` 的**权威签名清单**。内核、运行时与内置插件必须使用这里的名称，
不得各自发明同义命名。协议正文文档（`docs/plugin-protocol-v0.md`）由 schema 自动生成。

## 1. 版本与能力

```ts
export const PLUGIN_API_VERSION = 0;
export const THEME_API_VERSION = 0;

export type Capability =
	| "lyrics.core"   // 读取文档、行/单词/元数据的增删改
	| "lyrics.ruby"   // 读写 ruby（注音）分段
	| "ui.notify"     // 通知与进度
	| "ui.form"       // 声明式表单
	| "storage.kv";   // 插件隔离的键值存储

export const ALL_CAPABILITIES: readonly Capability[];
```

`negotiateCapabilities(requested, hostSupported)` 返回 `{ granted, rejected }`；宿主拒绝任何未知
capability，不做前缀通配。

## 2. Manifest

```ts
export interface PluginManifestBase {
	id: string;          // 反向域名，^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$
	name: string;
	version: string;     // semver
	description?: string;
	author?: string;
	homepage?: string;   // 仅 https:
	license?: string;
	extensions?: Record<string, unknown>; // 定制版预留，宿主不解释
}

export type FunctionPluginRuntime = "builtin" | "extism-wasm" | "trusted-js";

export interface FunctionPluginManifest extends PluginManifestBase {
	kind: "function";
	apiVersion: number;               // 必须等于 PLUGIN_API_VERSION
	runtime: FunctionPluginRuntime;   // trusted-js 在 MVP 一律拒绝加载
	entry: string;                    // builtin: 内部标识；extism-wasm: 包内相对路径
	capabilities: Capability[];
	contributes?: FunctionContributions;
	activationEvents?: ActivationEvent[];
}

export interface ThemePluginManifest extends PluginManifestBase {
	kind: "theme";
	themeApiVersion: number;          // 必须等于 THEME_API_VERSION
	runtime: "none";
	appearance: "light" | "dark" | "both";
	tokens: string;                   // 包内相对路径，指向 token JSON
	styles?: string[];                // 包内相对路径，受限 CSS
}

export type PluginManifest = FunctionPluginManifest | ThemePluginManifest;
export type ActivationEvent = "onStartup" | `onCommand:${string}` | "onDocumentChanged";
```

判别键为 `kind`。`parseManifest(input: unknown): ParseResult<PluginManifest>` 先用 JSON Schema 校验，
再做跨字段校验（`kind` 与 `runtime` 一致性、`apiVersion` 匹配、capability 已知、contribution id 前缀）。

## 3. Contribution

```ts
export type LocalizedText = string | ({ default: string } & Record<string, string>);

export type MenuLocation =
	| "menu.file" | "menu.edit" | "menu.tool" | "menu.help"
	| "toolbar.edit" | "toolbar.sync"
	| "context.lyricLine" | "context.lyricWord"
	| "sidebar.panel";

/** 受限布尔表达式，语法见 §7 */
export type EnablementExpr = string;

export interface CommandContribution {
	id: string;              // 必须以 "<pluginId>." 开头
	title: LocalizedText;
	category?: LocalizedText;
	enablement?: EnablementExpr;
	defaultKeys?: string[];  // 与现有 keybinding registry 同格式，如 ["Control", "KeyT"]
}

export interface MenuItemContribution {
	command: string;         // 只引用 command id，禁止内联回调
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

export interface FunctionContributions {
	commands?: CommandContribution[];
	menus?: MenuItemContribution[];
	settings?: SettingsPageContribution[];
}
```

## 4. 文档投影（PluginDocumentV0）

字段名**故意**与宿主内部 `TTMLLyric` 不同，以防内部结构泄漏成事实协议。

```ts
export interface PluginRubySegmentV0 { text: string; startTime: number; endTime: number }

export interface PluginWordV0 {
	id: string;
	text: string;
	startTime: number;
	endTime: number;
	emptyBeat: number;
	romanText: string;
	ruby?: PluginRubySegmentV0[];   // 需要 lyrics.ruby
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

export interface PluginMetadataEntryV0 { key: string; values: string[] }

export interface PluginDocumentV0 {
	revision: number;
	lines: PluginLineV0[];
	metadata: PluginMetadataEntryV0[];
}

export interface PluginSelectionV0 { lineIds: string[]; wordIds: string[] }
```

写回时按 `id` 合并；投影中不存在的内部字段（`obscene`、`romanWarning`、`endTimeLink`、
定制版扩展字段等）必须原样保留。新建行/单词的 id 由宿主分配，插件用 `NewLineV0` / `NewWordV0`
（不含 `id`）描述。

## 5. 编辑操作与宿主调用

```ts
export type DocumentOpV0 =
	| { op: "updateLine"; lineId: string; patch: PluginLinePatchV0 }
	| { op: "updateWord"; wordId: string; patch: PluginWordPatchV0 }
	| { op: "insertLine"; afterLineId: string | null; line: NewLineV0 }
	| { op: "removeLine"; lineId: string }
	| { op: "moveLine"; lineId: string; afterLineId: string | null }
	| { op: "insertWord"; lineId: string; afterWordId: string | null; word: NewWordV0 }
	| { op: "removeWord"; wordId: string }
	| { op: "setMetadata"; entries: PluginMetadataEntryV0[] }
	| { op: "replaceDocument"; lines: NewLineV0[]; metadata: PluginMetadataEntryV0[] };

export interface LyricsApplyEditParams {
	expectedRevision: number;   // -1 表示"不检查"，仅允许同步命令使用
	label: string;              // 撤销记录标题
	ops: DocumentOpV0[];
}

export type EditSource = "user" | "plugin" | "host" | "import";

export interface ApplyEditResult { revision: number; appliedOps: number }
```

宿主方法表（`method` → 所需 capability）：

| method               | capability                         | params → result                                 |
| -------------------- | ---------------------------------- | ----------------------------------------------- |
| `lyrics.getDocument` | `lyrics.core`                      | `{}` → `PluginDocumentV0`                       |
| `lyrics.getSelection`| `lyrics.core`                      | `{}` → `PluginSelectionV0`                      |
| `lyrics.applyEdit`   | `lyrics.core`（含 ruby 时另需 `lyrics.ruby`） | `LyricsApplyEditParams` → `ApplyEditResult` |
| `ui.notify`          | `ui.notify`                        | `NotifyParams` → `{}`                           |
| `ui.showForm`        | `ui.form`                          | `{ schema: FormSchemaV0 }` → `FormResultV0`     |
| `storage.get`        | `storage.kv`                       | `{ key }` → `{ value: JsonValue \| null }`      |
| `storage.set`        | `storage.kv`                       | `{ key, value }` → `{}`                         |
| `storage.delete`     | `storage.kv`                       | `{ key }` → `{}`                                |
| `storage.keys`       | `storage.kv`                       | `{}` → `{ keys: string[] }`                     |

```ts
export interface NotifyParams {
	level: "info" | "success" | "warning" | "error";
	message: string;         // 纯文本，宿主不渲染 HTML
	detail?: string;
	timeoutMs?: number;
}

export type HostResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: PluginError };

export type PluginErrorCode =
	| "revision-conflict" | "permission-denied" | "invalid-params" | "not-found"
	| "unsupported-api-version" | "timeout" | "cancelled"
	| "payload-too-large" | "plugin-crashed" | "internal";

export interface PluginError { code: PluginErrorCode; message: string; data?: JsonValue }
```

## 6. 生命周期与事件

```ts
/** 插件（guest）需要导出的函数名 */
export const PLUGIN_EXPORTS = {
	activate: "plugin_activate",
	deactivate: "plugin_deactivate",
	executeCommand: "plugin_execute_command",
	handleEvent: "plugin_handle_event",
} as const;

export interface ActivateParams {
	pluginId: string;
	apiVersion: number;
	grantedCapabilities: Capability[];
	locale: string;
	hostVersion: string;
}

export interface ExecuteCommandParams { commandId: string; args?: JsonValue }

export type PluginEventV0 =
	| { type: "document.changed"; revision: number; source: EditSource;
	    changedLineIds: string[]; changedWordIds: string[] }
	| { type: "document.undo"; revision: number }
	| { type: "document.redo"; revision: number }
	| { type: "selection.changed"; selection: PluginSelectionV0 };
```

`plugin_activate` 与 `plugin_deactivate` 必需；其余按导出存在与否决定是否派发。
插件自身发起的修改不会回灌成 `document.changed`（`source === "plugin"` 且 `pluginId` 相同时跳过）。

## 7. enablement 表达式

受限 DSL，只有以下 token，由 `parseEnablement` 解析成 AST 供宿主求值：

```
expr    := or
or      := and ("||" and)*
and     := unary ("&&" unary)*
unary   := "!" unary | "(" expr ")" | comparison | ident
comparison := ident ("==" | "!=") literal
ident   := [a-zA-Z][a-zA-Z0-9.]*
literal := "'" [^']* "'" | true | false | number
```

宿主上下文键（MVP）：`mode`（`edit`/`sync`/`preview`）、`hasSelection`、`hasLineSelection`、
`hasWordSelection`、`documentEmpty`、`audioLoaded`、`canUndo`、`canRedo`。
未知标识符求值为 `undefined` 并使整个表达式为 `false`，同时上报一次诊断日志。

## 8. 声明式表单

```ts
export type FormFieldV0 =
	| { kind: "text"; key: string; label: LocalizedText; default?: string;
	    placeholder?: string; required?: boolean; maxLength?: number; multiline?: boolean }
	| { kind: "number"; key: string; label: LocalizedText; default?: number;
	    min?: number; max?: number; step?: number; required?: boolean }
	| { kind: "boolean"; key: string; label: LocalizedText; default?: boolean }
	| { kind: "select"; key: string; label: LocalizedText;
	    options: { value: string; label: LocalizedText }[]; default?: string }
	| { kind: "radio"; key: string; label: LocalizedText;
	    options: { value: string; label: LocalizedText }[]; default?: string }
	| { kind: "note"; text: LocalizedText };

export interface FormSchemaV0 {
	title: LocalizedText;
	description?: LocalizedText;
	fields: FormFieldV0[];
	submitLabel?: LocalizedText;
	cancelLabel?: LocalizedText;
}

export type FormValueV0 = string | number | boolean;
export type FormResultV0 =
	| { submitted: true; values: Record<string, FormValueV0> }
	| { submitted: false };
```

`key` 在同一 schema 内唯一且匹配 `^[a-zA-Z][a-zA-Z0-9_]*$`。宿主渲染时不解释任何 HTML。

## 9. 主题 token

```ts
export interface ThemeTokensV0 {
	tokenVersion: number;             // 必须等于 THEME_TOKEN_VERSION
	color?: Record<string, string>;   // 值必须是安全颜色字面量
	font?: { family?: string; monoFamily?: string; scale?: number };
	spacing?: { scale?: number; radius?: string };
	lyrics?: Record<string, string>;
	spectrogram?: Record<string, string>;
	background?: { kind: "solid" | "gradient" | "none"; value?: string };
}
export const THEME_TOKEN_VERSION = 0;
```

token 值走白名单校验：颜色只允许 `#rgb`/`#rrggbb`/`#rrggbbaa`/`rgb()`/`rgba()`/`hsl()`/`hsla()`/
`oklch()`/`color-mix()` 与命名色；长度只允许 `px`/`rem`/`em`/`%`；一律禁止 `url()`、`var(--...)`
以外的函数、`@import`、`expression(`、以及任何远程引用。

## 10. Schema 与代码生成

- 每个上表结构都有一份 JSON Schema（`packages/plugin-api/src/schema/*.ts`），
  使用自带的 JSON Schema 子集校验器 `validate(schema, value)`，不引入第三方依赖。
- 支持的关键字子集：`type`、`enum`、`const`、`properties`、`required`、`additionalProperties`、
  `items`、`minItems`、`maxItems`、`pattern`、`minLength`、`maxLength`、`minimum`、`maximum`、
  `oneOf`、`anyOf`、`allOf`、`not`、`$ref`（仅限本文档内 `#/$defs/*`）、`nullable`。
- `scripts/gen-plugin-docs.ts` 从 schema 生成 `docs/plugin-protocol-v0.md`。

## 11. 契约测试

`packages/plugin-api/tests/contract/*` 提供一套与宿主实现无关的契约测试套件，导出
`runHostContractTests(createHost: () => PluginHostUnderTest)`。上游版与定制版各自提供
`createHost` 实现并跑同一套断言；两边全绿是冻结 v1 的前置条件。
