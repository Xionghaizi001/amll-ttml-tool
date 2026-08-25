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

因此阶段 4 直接保留既有命令 ID，并让 keyboard registry 把同一 ID 的代理 handler 注册进内核：

```ts
registerCommand("newFile", ["Control", "KeyN"], ...);
bindCommandHandler("newFile", onNewFile);
```

新菜单命令与插件命令使用命名空间 ID；插件 ID 仍必须以 manifest plugin id 为前缀。

## 2. src/kernel/commands（阶段 4 实现）

```ts
export type CommandSource =
	| { kind: "builtin"; id: string }
	| { kind: "plugin"; pluginId: string };

export interface CommandRegistration {
	id: string;
	title?: LocalizedText;
	category?: LocalizedText;
	handler: (args?: unknown) => unknown | Promise<unknown>;
	enablement?: () => boolean;
	source: CommandSource;
}

export class CommandRegistry {
	register(def: CommandRegistration): Disposable;
	get(id: string): RegisteredCommand | undefined;
	getAll(): RegisteredCommand[];
	isEnabled(id: string): boolean;
	execute(id: string, args?: unknown): Promise<unknown>;
	subscribe(listener: () => void): Disposable;
	notifyEnablementChanged(): void;
}
```

`Disposable = { dispose(): void }`。重复 ID 直接拒绝；未注册、disabled 或 handler 错误会让
`execute` 的 Promise reject，由菜单/快捷键 adapter 统一记录。对 WASM 暴露时再由 HostFacade 转成
`HostResult`，内核不复制一套协议错误类型。

现有 keyboard registry 不改 storage key。每个静态快捷键命令注册一个稳定代理 handler；React
adapter 只负责在组件生命周期内 bind/unbind 实际 handler。无快捷键的菜单命令也走同一 registry，
但不出现在快捷键设置页。

## 3. src/kernel/extensions（阶段 4 实现）

```ts
export interface ExtensionScope extends Disposable {
	registerCommand(...): Disposable;
	registerMenu(item: MenuItemContribution): Disposable;
	registerToolbar(...): Disposable;
	registerDeclarativeForm(...): Disposable;
	registerTrustedView(...): Disposable;
	addEventListener(event: string, listener: (payload: unknown) => void): Disposable;
}
```

`ExtensionRegistry.createScope(owner)` 创建 owner-scoped facade。排序规则：先按 `group`（字典序，
未指定视为 `"zzz"`），再按 `order`（升序，未指定视为 `1000`），最后按 contribution id，保证稳定。

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

阶段 4 的 unload 边界是 scope dispose：它按逆序清理命令、菜单、工具栏、侧栏、设置页、对话框和
事件监听。runtime 停止、KV 句柄关闭与完整 PluginLifecycleHost 状态机在阶段 6 接入，但不能绕过 scope。
合同测试已断言卸载后 command/contribution/listener 均不可再观察或执行。

### 3.2 事件派发

阶段 4 先提供 owner-scoped 事件订阅与同步派发，并验证卸载清理。把 `DocumentChangeEvent` 投影为
`PluginEventV0`、同源过滤、每插件超时与 Worker 隔离属于阶段 6 runtime host 工作。

## 4. src/kernel/platform

阶段 4 新增通用 `ManagedResource<T>`，通过 `ResourceStoragePort<T>` 与 `ResourceUrlPort<T>` 管理
持久资源读取、替换、清空和本地 URL revoke。自定义背景的 IndexedDB、legacy localStorage/data URL
迁移、fetch、Blob URL 已全部落到 `src/platform/storage` 与 `src/platform/resources`；阶段 5 的主题
包资源复用同一生命周期。通知 adapter 当前基于纯文本 `react-toastify`，隔离 KV、clipboard/files/urls
的完整 HostMethod 实现仍按阶段 6/7 推进。

## 5. src/plugins

```
src/plugins/
  runtime/     PluginRuntime 抽象、Extism/Worker 实现、权限校验、Mock 运行时
  builtin/     官方 TS 插件（首个：time-shift）
  adapters/    EditorHostAdapter：内部 TTMLLyric ⇄ PluginDocumentV0 投影与写回
  ui/          DeclarativeFormHost、ContributionMenuItems、runtime diagnostics
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
const scope = extensionRegistry.createScope({
	kind: "builtin",
	id: "builtin.time-shift",
	trusted: true,
});
activateTimeShiftBuiltin(scope, { document, showForm, notify, getSelectedLineIds });
// deactivate / unload
scope.dispose();
```

`builtin.time-shift` 是首个完整实现：菜单 contribution 只引用 command ID，command 请求声明式表单，
再调用 `TimeShiftService` 产生单一文档事务并发送纯文本通知。scope dispose 后命令、菜单和监听器一起
消失。WASM 插件在阶段 6 通过同一 scope/manifest adapter 接入，只增加序列化、权限与 Worker 边界。
