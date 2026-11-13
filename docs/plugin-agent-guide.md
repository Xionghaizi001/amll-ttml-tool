# 插件系统 Agent 指南

本文供编写插件和维护宿主的编码 Agent 使用，按 2026-11-14 当前工作区实现重写。只描述插件系统及公开 SDK，不记录内置插件的功能、命令、迁移历史或独立仓库用法。

完整方法、参数说明和简短 snippet 统一放在 [插件开发指南](./plugin-development-guide.md)。本指南说明如何判断能力是否真正可用、如何选用接口，以及修改系统时必须同步哪些位置。

## 1. 先确认事实，不凭名称猜 API

按下面顺序核对：

1. [SDK host.ts](../packages/plugin-sdk-js/src/host.ts)：插件可调用的 TypeScript 表面。
2. [types.ts](../packages/plugin-api/src/types.ts)、[Schema](../packages/plugin-api/src/schema/schemas.ts)、[parsers.ts](../packages/plugin-api/src/parsers.ts)：可跨包边界的数据、字段、枚举和运行时约束。
3. [真实 host facade](../src/plugins/trusted/trusted-js-host-api.ts)、[端口接线](../src/plugins/trusted/trusted-js-host.ts)：方法是否接通、返回方式、身份限制。
4. [加载服务](../src/plugins/trusted/trusted-js-service.ts) 与对应 adapter、kernel service：激活、事务、注册与清理的实际语义。
5. 对应测试和真实 UI 消费方：能注册不等于界面一定会显示。

协议版本 `PLUGIN_API_VERSION`、`TRUSTED_JS_SDK_VERSION`、主题 API/token 当前均为 0。不要据此认定任意旧 tarball 都具备最新接口。`docs/plugin-protocol-v0.md` 为生成产物，生成入口是 `pnpm plugin:api:build`，不要手工修改它。

### 当前运行模型

- 外部功能插件使用 trusted-js：单文件 ESM，加载器执行模块的 `activate({ pluginId, host, signal })`，可返回 cleanup。
- 外部主题使用 runtime none：token、CSS、assets/resources，经 parser 校验后应用，不执行 JS。
- builtin 是宿主内部运行档；随应用交付的来源与 runtime 是不同维度。
- 当前没有外部 Worker/RPC 插件运行档。trusted-js 具有应用级权限，SDK 不是沙箱。
- manifest 的 `activationEvents` 不驱动当前 trusted-js 延迟激活。`contributes.commands/menus/settings/formats/titleBarActions` 不是自动执行器；功能必须在 activate 中通过 SDK 注册。
- `contributes.strings`、`overrides`、`dependencies`、主题声明由相应资源/加载链路消费，不应与未自动注册的贡献项混为一谈。

## 2. 按需求选现有接口

| 需求 | 应使用的接口 | 方法与 snippet |
| --- | --- | --- |
| 读取/修改歌词、Ruby、元数据 | document.readSnapshot / applyEdit / onChanged | [文档事务](./plugin-development-guide.md#5-文档选区与项目) |
| 当前选区、定位行 | selection.get / onChanged、editor.revealLine | [选区](./plugin-development-guide.md#5-文档选区与项目)、[编辑器](./plugin-development-guide.md#7-表单通知与视图) |
| 作为新导入打开歌词 | project.getInfo / importDocument | [项目](./plugin-development-guide.md#5-文档选区与项目) |
| 操作入口与调用 | commands.register / execute、menus.register、titleBarActions.register | [命令和菜单](./plugin-development-guide.md#6-命令菜单与标题栏) |
| 简单参数输入、通知 | ui.showForm / notify | [表单](./plugin-development-guide.md#7-表单通知与视图) |
| 侧栏、设置页、对话框、附加标记、词编辑器 | views.registerView、ui.openView / closeView | [视图](./plugin-development-guide.md#7-表单通知与视图) |
| 自定义编辑模式 | views.registerMode | [模式](./plugin-development-guide.md#7-表单通知与视图) |
| 复用多选、拖拽和右键菜单 | editor.useLineList / LineContextMenu | [编辑器](./plugin-development-guide.md#7-表单通知与视图) |
| 只读播放状态 | audio.getState / onChanged | [音频](./plugin-development-guide.md#8-音频与-bpm) |
| 节拍显示、输入和校准 | bpm.connect / setTapMode / getTapKeyLabel / applyCalibration / getState / onChanged / setScale / setFollowPlaybackRate / setShowBeatLines / tap / reset | [BPM 全部方法](./plugin-development-guide.md#8-音频与-bpm) |
| 分词与设置 | segmentation.isKanaOnly / getConfig / setConfig / segmentText | [分词](./plugin-development-guide.md#9-分词与罗马音预测) |
| 编辑器罗马音建议 | romanization.registerPredictor | [预测](./plugin-development-guide.md#9-分词与罗马音预测) |
| 文件格式转换 | formats.register | [格式](./plugin-development-guide.md#10-格式转换) |
| 插件私有 JSON 持久化 | storage.kv.get / set / delete / keys | [存储](./plugin-development-guide.md#11-存储网络与专用桥接) |
| 匿名 HTTP | network.request / isOffline | [网络](./plugin-development-guide.md#11-存储网络与专用桥接) |
| 专用认证桥（普通插件不可调用） | github.authenticate / getIdentity / logout / post | [身份限制](./plugin-development-guide.md#11-存储网络与专用桥接) |
| 国际化文案 | i18n.t / onLocaleChanged | [国际化](./plugin-development-guide.md#12-国际化依赖与覆盖) |
| 主题样式、语言或图标覆盖 | manifest + 声明式包资源，没有对应 host 写入方法 | [资源](./plugin-development-guide.md#12-国际化依赖与覆盖)、[主题](./plugin-development-guide.md#13-主题能力) |

除此之外还有 `definePlugin()` 身份函数、注册/订阅返回的 `DisposableV0.dispose()`，以及只读属性 sdkVersion、document.revision、i18n.locale。`editor.useLineList` 返回的 onPointerDown 是 React 手势回调；LineContextMenu 是组件。不要把它们误写成 commands.execute 的命令。

以下接口不存在：`host.audio.play/pause/seek`、任意 `selection.set`、`host.theme`、通用文件系统、任意登录态网络请求、按 capability 自动生成的 `host.extensions` 对象。若需求超出 SDK，应明确提出宿主合同扩展，不导入私有 atom 或 Tauri API 冒充现有能力。

## 3. 插件实现的最小完整路径

1. 使用独立 toolkit 创建项目，确认 vendor API/SDK 与目标宿主匹配。
2. 确定最小的公开数据操作与 UI 入口；命令/视图/格式使用插件自己的 ID 前缀。
3. 在 activate 注册；不要在模块 import 顶层修改宿主状态。
4. 数据从公开快照读取，写入只通过 applyEdit 或 project.importDocument。
5. 处理错误、取消和卸载，最后验证打包产物在真实宿主的行为。

### 文档编辑模式

```ts
const snapshot = host.document.readSnapshot();
const form = await host.ui.showForm({
  title: "设置译文",
  fields: [{ kind: "text", key: "translation", label: "译文", default: "" }],
});
const line = snapshot.lines[0];
if (form.submitted && line && !signal.aborted) {
  const result = host.document.applyEdit(
    [{ op: "updateLine", lineId: line.id, patch: { translation: String(form.values.translation) } }],
    "设置译文",
    { expectedRevision: snapshot.revision },
  );
  if (!result.ok) host.ui.notify({ level: "error", message: result.error.message });
}
```

同批 ops 是一次原子事务、一次 revision、一次撤销。跨异步边界保留原 revision，冲突时重新读取/计算或让用户重试，不自动去掉保护。行、词按稳定 ID 定位；不能依赖旧数组下标。setMetadata 是全量替换；Ruby 的 null 与空数组语义不同。

自发事件防回灌：

```ts
host.document.onChanged(event => {
  if (event.sourcePluginId === pluginId) return;
  console.log(event.changedLineIds);
});
```

时间单位：歌词/词/Ruby/音频状态为毫秒；BPM tick、anchorTick 和 tap 为秒。不要通过统一的“时间”类型掩盖单位差异。

### 注册与清理模式

```ts
const registration = host.commands.register({
  id: `${pluginId}.run`, title: "执行示例", handler: () => console.log("run"),
});
host.menus.register({ command: `${pluginId}.run`, menu: "menu.tool" });
// 宿主自动释放；需要提前撤回时才调用 registration.dispose()。
```

宿主拥有 SDK 注册、订阅与打开的视图。插件拥有自己的定时器、原生监听器和额外资源，必须返回 cleanup。React 组件内订阅还应随组件卸载 dispose，不能仅等待插件停用。异步操作检查 signal；停用后不要尝试继续调用宿主修改方法。

### 错误处理模式

区分三种结果：

- `HostResult<T>`：先判断 ok，再读 value 或 error。
- 普通返回值：例如 FormResult 的 submitted、GithubIdentity 的 status，不能套用 HostResult。
- 抛错/拒绝：例如非法注册、不可用命令、存储失败，必须在用户操作边界捕获。

network.request 还需判断内层 HTTP response.ok。不要把 404 当成功，也不要声称所有超时都会返回 timeout；当前网络适配器通常返回 network-unavailable。

## 4. 宿主源码职责

| 位置 | 职责 |
| --- | --- |
| packages/plugin-api | 公开 JSON 合同、Schema、parser、资源与主题校验 |
| packages/plugin-sdk-js | trusted-js 类型表面、definePlugin、测试 mock |
| src/kernel/editor | 文档事务、历史和稳定 ID 操作 |
| src/kernel/extensions | owner scope、贡献 registry、冲突和释放 |
| src/kernel/theme | 主题状态、作用域、预览/应用/恢复 |
| src/plugins/adapters | 协议到内部模型的转换和宿主服务适配 |
| src/plugins/trusted | consent、加载、依赖、安装状态和 host facade |
| src/plugins/store | catalog、摘要、容器、安装路由 |
| src/plugins/ui | 声明式表单、React view 宿主、管理和受保护 UI |
| src/platform | IndexedDB、网络、样式与浏览器环境实现 |

plugin-api 不依赖 React/DOM/Tauri 或内部歌词类型；kernel 不依赖插件 UI。SDK 允许 React 类型但不引入宿主私有类型。插件 UI 写文档必须经过同一文档事务入口。

## 5. 修改系统时的同步清单

### 修改公开方法或数据

同步 SDK 类型 → API 类型/Schema/parser（涉及 JSON 合同时）→ 真实 host facade → 平台端口接线 → mock → 合同/行为测试 → 开发指南的方法和 snippet。检查所有调用方，不能只让接口类型编译通过。

新增 JSON 字段检查未知字段、大小限制、枚举、命名空间和跨字段约束。仅增加 TypeScript 类型不构成运行时验证。若改变 capability 名称，还需同步能力表及相关校验；不能将其描述成 trusted-js 不存在的沙箱授权。

对外发布前构建 API/SDK 包，并在消费者仓库同步 tarball/lockfile；不要在本文加入消费者业务实现或历史记录。

### 修改 contribution

先查 registry 和 UI 消费方。所有注册归属 ExtensionScope，校验命名空间、数量和冲突，返回可释放句柄。动态 React 视图仅用于 trusted-js；声明式表单/标题栏按钮不得变成任意 HTML 或回调 payload。修改文本消费方时保留覆盖层 getter，不能将可变本地化文案永久复制为快照。

### 修改安装、更新和开发加载

保留容器识别、安全解包、包 parser、身份/摘要、consent、持久化、加载的完整路径。用户导入为 ZIP；不要用仅能解析的内部 JSON 结构承诺新的 UI 安装入口。拒绝路径穿越、重复/未声明文件、超大解压、任意远程模块依赖。

非随应用捆绑代码在 import 前完成来源、禁用/崩溃、consent 检查；内容变化重新确认。开发加载只复用当前会话授权，不删除校验、scope 清理和失败恢复。禁用保留包与 KV，卸载清理包、状态、consent 和 KV。持久化失败必须向上传播；跨存储变更需要补偿，补偿失败也必须可诊断。

### 修改主题与覆盖

主题不能覆盖受保护管理/恢复 UI。保持全局与插件作用域、预览与应用、用户 override 的区分。作用域 token 不写到 :root，受保护表单 portal 不落入插件样式锚点。冲突保留明确的确认/撤销入口。覆盖资源只替换发布的 LocalizedText/白名单图标，不做通用对象 merge，不替换行为字段。

## 6. 按范围验证

| 改动 | 检查入口 |
| --- | --- |
| 类型与协议 | `pnpm plugin:api:check`、`pnpm plugin:sdk:check`、tests/plugin-api |
| SDK 与真实宿主 | tests/plugin-sdk-js、tests/plugins/trusted |
| 文档事务与贡献点 | tests/kernel、tests/plugins/adapters、tests/plugins/ui |
| 包、catalog、持久化 | tests/plugins/store、tests/platform、tests/plugins/trusted |
| 主题 | tests/kernel/theme、对应 UI/browser 用例 |
| 分层依赖规则 | `pnpm lint:boundaries`；修改规则再跑 `pnpm lint:boundaries:test` |
| 生成包/协议 | `pnpm plugin:api:build`，检查生成内容与 tarball |
| 整体构建 | `pnpm test`、`pnpm build`；需要宿主 TS 检查时使用 `pnpm build:tsc` |

SDK mock 与真实 host 应运行同一合同测试。新非平凡逻辑至少增加一个验证真实行为的测试；不要写只复述实现的测试。纯文档更新核对方法覆盖、snippet 类型和链接即可，不为此改动运行时或重新发布包。

自动化测试不能替代 React 手势、CSS 作用域、受保护 UI、真实 IndexedDB、文件选择和桌面 WebView 验收。步骤参考 [插件验收清单](./plugin-acceptance-checklist.md) 与 [浏览器验收入口](../tests/plugins/browser/README.md)。

## 7. 交付要求

说明修改了什么公开合同、影响哪些调用方、验证了哪些行为，以及仍未验证的平台。不要将“Schema 接受字段”“mock 有方法”“某次旧验收通过”写成当前真实宿主已可用的证据。文档保持面向当前能力；插件业务、专有命令和发布记录留在插件自己的仓库。
