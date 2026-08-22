# ADR 0003：内核命令、Contribution 与宿主能力层

- 状态：已接受（experimental v0）
- 日期：2026-08-19
- 关联：[ADR 0001](./0001-plugin-architecture.md)、[ADR 0002](./0002-protocol-v0-contract.md)

本文件固定 `src/kernel/commands`、`src/kernel/extensions`、`src/kernel/platform`、`src/plugins/*`
的模块边界与签名，避免并行开发中出现同义异名。

## 1. 为什么不直接复用现有 keyboard registry

`src/modules/keyboard/registry.ts` 的 `registerCommand(id, defaultKeys, description, category)`
只登记了"快捷键 + i18n 描述"，回调由各个组件用 `useCommand(cmd, cb)` 就地绑定。这带来两个问题：
菜单项直接持有回调（无法被插件贡献），以及命令没有 enablement 与来源信息，卸载插件时无法清理。

**决策**：新增 `src/kernel/commands` 作为唯一的命令真相源；keyboard registry 降级为
"快捷键存储"，由内核桥接。

### 1.1 不改动既有 keybinding 存储键

`atomWithKeybindingStorage(id, ...)` 用 `id` 作为 localStorage 键。现有命令 id 是裸名
（`newFile`、`syncStart`…）。**绝不重命名这些 id**，否则用户自定义的快捷键会全部丢失。

因此 `CommandDefinition` 用 `keybindingId?: string` 指向既有 keyboard registry 条目：

```ts
{ id: "core.file.new", keybindingId: "newFile", ... }
```

插件贡献的命令没有历史包袱，`keybindingId` 直接等于命令 id。

## 2. src/kernel/commands

```ts
export interface ContributionSource {
	kind: "core" | "builtin" | "plugin";
	/** kind !== "core" 时必填 */
	pluginId?: string;
}

export interface CommandExecutionContext {
	/** 命令要改文档就必须走它，禁止直接写 atom */
	document: EditorDocumentService;
	enablement: EnablementContext;
	source: ContributionSource;
	signal: AbortSignal;
}

export interface CommandDefinition<A = void> {
	id: string;
	title: LocalizedText;
	category?: LocalizedText;
	source: ContributionSource;
	enablement?: EnablementExpr;
	keybindingId?: string;
	defaultKeys?: string[];
	handler: (args: A, ctx: CommandExecutionContext) => void | Promise<void>;
}

export interface CommandRegistry {
	register<A>(def: CommandDefinition<A>): Disposable;
	/** 覆盖注册直接拒绝，返回带 code:"duplicate-command" 的错误 */
	execute<A>(id: string, args?: A): Promise<CommandExecutionResult>;
	isEnabled(id: string, ctx: EnablementContext): boolean;
	list(filter?: { source?: ContributionSource["kind"] }): CommandDefinition[];
	/** 卸载插件时一次清掉它的全部命令 */
	disposeSource(pluginId: string): void;
}

export type CommandExecutionResult =
	| { ok: true }
	| { ok: false; error: { code: CommandErrorCode; message: string } };

export type CommandErrorCode =
	| "not-found" | "disabled" | "duplicate-command"
	| "handler-threw" | "cancelled" | "timeout";
```

`Disposable = { dispose(): void }`。`execute` 永不抛异常：handler 抛出时记录日志、上报通知、
返回 `handler-threw`。

`EnablementContext` 由 `src/kernel/extensions/enablement-context.ts` 从 atom 求值得出，键见
ADR 0002 §7。

## 3. src/kernel/extensions

```ts
export interface ContributionRegistry {
	registerMenuItems(source: ContributionSource, items: MenuItemContribution[]): Disposable;
	registerSettingsPages(source: ContributionSource, pages: SettingsPageContribution[]): Disposable;
	/** 只接受 kind === "builtin"，第三方插件调用一律拒绝（ADR 0001 D3） */
	registerView(source: ContributionSource, view: TrustedViewContribution): Disposable;
	getMenuItems(location: MenuLocation): ResolvedMenuItem[];
	getSettingsPages(): SettingsPageContribution[];
	getViews(slot: TrustedViewSlot): TrustedViewContribution[];
	disposeSource(pluginId: string): void;
}

export interface ResolvedMenuItem {
	command: CommandDefinition;
	contribution: MenuItemContribution;
}
```

排序规则：先按 `group`（字典序，未指定视为 `"zzz"`），再按 `order`（升序，未指定视为 `1000`），
最后按解析后的标题字典序，保证渲染稳定。

`getMenuItems` 只做结构排序；`when` / `enablement` 的求值在 React 渲染层用当前
`EnablementContext` 完成（因为它随选区实时变化）。

### 3.1 生命周期

```ts
export interface PluginLifecycleHost {
	load(pkg: LoadedPluginPackage): Promise<LoadResult>;
	activate(pluginId: string): Promise<void>;
	deactivate(pluginId: string): Promise<void>;
	unload(pluginId: string): Promise<void>;
	getState(pluginId: string): PluginState;
	list(): PluginRecord[];
}

export type PluginState =
	| "installed" | "activating" | "active"
	| "deactivating" | "disabled" | "crashed" | "incompatible";
```

`unload` 必须依次：停止 runtime → `disposeSource` 清命令/菜单/设置页/视图 → 移除事件监听 →
关闭该插件的 KV 句柄。所有 disposable 由一个 `DisposableStore` 按插件收集，**不允许**插件自己
记账。要有测试断言"卸载后 `commandRegistry.list()` 与 `getMenuItems()` 里不再有该插件的条目"。

### 3.2 事件派发

`src/kernel/extensions/event-bus.ts` 订阅 `editorDocument.subscribe`，把
`DocumentChangeEvent` 转成 ADR 0002 §6 的 `PluginEventV0` 派发给已激活插件。
过滤规则：`meta.source === "plugin" && meta.pluginId === 目标插件` 时跳过（避免自激励循环）。
派发是"每插件独立 try/catch + 超时"，单个插件失败不影响其他插件与宿主。

## 4. src/kernel/platform

宿主能力实现，被 `HostMethod` 表一对一映射：

- `notifications.ts` → `ui.notify`。基于 `react-toastify`（仓库已依赖）。**纯文本渲染**。
- `plugin-storage.ts` → `storage.kv`。基于 `idb`（仓库已依赖），每插件独立 store 前缀
  `plugin:<pluginId>:`，单键值 ≤ 64 KiB、单插件 ≤ 1 MiB、键数 ≤ 512，超限返回
  `payload-too-large`。
- `clipboard.ts`、`files.ts`、`urls.ts`：把现有分散在组件里的 Web/Tauri 分支收敛进来，
  为阶段 7 的 `FileProvider` 留接口，但阶段 7 本身不在当前批次内。

## 5. src/plugins

```
src/plugins/
  runtime/     PluginRuntime 抽象、Extism/Worker 实现、权限校验、Mock 运行时
  builtin/     官方 TS 插件（首个：time-shift）
  adapters/    EditorHostAdapter：内部 TTMLLyric ⇄ PluginDocumentV0 投影与写回
  ui/          PluginFormDialog、ContributedMenuItems、PluginManagerDialog
```

### 5.1 EditorHostAdapter

```ts
export interface EditorHostAdapter {
	projectDocument(snapshot: DocumentSnapshot): PluginDocumentV0;
	applyOps(params: LyricsApplyEditParams, source: ContributionSource):
		Promise<HostResult<ApplyEditResult>>;
	projectSelection(): PluginSelectionV0;
}
```

`applyOps` 把 `DocumentOpV0[]` 翻译成**一次** `editorDocument.transact()`，用
`kernel/editor/field-preservation.ts` 的按 id 合并保留内部字段（ADR 0001 D7）。
这是上游版与定制版唯一需要各自实现的接缝。

### 5.2 内置插件形态

```ts
export interface BuiltinPlugin {
	manifest: FunctionPluginManifest;   // runtime: "builtin"
	activate(ctx: BuiltinPluginContext): void | Promise<void>;
	deactivate?(): void | Promise<void>;
}

export interface BuiltinPluginContext {
	pluginId: string;
	subscriptions: DisposableStore;
	commands: Pick<CommandRegistry, "register">;
	contributions: Pick<ContributionRegistry, "registerMenuItems" | "registerSettingsPages" | "registerView">;
	document: EditorDocumentService;
	host: HostFacade;   // notify / showForm / storage，同样按 capability 校验
}
```

内置插件与 WASM 插件走**同一个** `HostFacade` 与同一套 capability 检查，只是省掉序列化与
Worker 边界。这样"禁用插件后功能消失、重新启用后恢复"对两类插件都成立。
