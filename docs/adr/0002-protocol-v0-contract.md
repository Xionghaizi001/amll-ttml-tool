# ADR 0002：Plugin Protocol v0 当前契约

状态：Accepted，按当前实现重写

日期：2026-09-21

协议状态：experimental v0

## 背景

插件跨越 JSON、Worker、WASM、动态 ESM、IndexedDB 和静态 catalog。仅靠 TypeScript 类型不能保护这些边界；同时 WASM 与 trusted-js 应共享文档、表单、错误和 contribution 语义。

## 决策

### 1. 权威合同由类型、Schema 和 parser 共同组成

`packages/plugin-api/src/types.ts` 定义公开数据；`schema/schemas.ts` 验证结构；parser 和专用校验器执行跨字段、命名空间、CSS、token、网络和包语义检查。任何外部输入必须走对应 parser，不能只做类型断言。

`docs/plugin-protocol-v0.md` 由 `pnpm plugin:api:build` 生成，不入库，不能手工修改。

### 2. 协议保持 JSON 可表达

`plugin-api` 不包含 React、DOM、Worker、Tauri 或宿主内部类型。核心版本常量为：

- `PLUGIN_API_VERSION = 0`
- `THEME_API_VERSION = 0`
- `THEME_TOKEN_VERSION = 0`
- `REMOTE_PLUGIN_CATALOG_VERSION = 0`

v0 允许破坏性变更；变更必须同步类型、Schema、parser、合同测试、生成文档、SDK 和宿主。

### 3. Manifest 使用判别联合

功能插件使用 `kind: "function"`，声明 `apiVersion`、runtime、entry、capabilities、contributions 和 activation events。主题使用 `kind: "theme"`、`runtime: "none"`、theme API、appearance、tokens 与 styles。两个形态互斥。

功能 runtime 为 `builtin | extism-wasm | trusted-js`。第三方分发使用 extism-wasm 或 trusted-js；builtin 由宿主注册。

### 4. Capability 精确匹配

核心 capability 为：

- `lyrics.core`
- `lyrics.ruby`
- `lyrics.format`
- `ui.notify`
- `ui.form`
- `storage.kv`
- `network.http`

扩展 capability 使用 `extensions.<反向域名>.<名称>`。不支持通配符。WASM host 明确不授予 `network.http`；trusted-js 的 capability/API 约束是治理与兼容边界，不是代码隔离。

### 5. 文档写入是原子事务

`PluginDocumentV0` 暴露 revision、稳定 ID、歌词公开字段和受 capability 控制的 extensions。写入使用 `DocumentOpV0[]`，支持行/词更新、插入、删除、移动、metadata 替换和整文档替换。

一批 op 要么全部成功，要么全部失败，并产生一个 revision 和一个撤销记录。跨异步边界使用 `expectedRevision`；冲突返回 `revision-conflict`。来源和 pluginId 由宿主注入，guest 不能伪造。

### 6. WASM 使用回合协议

生命周期导出名由 `PLUGIN_EXPORTS` 固定。guest 通过 `amll_host_call` 发送 `HostCallV0`，返回 `PluginReturnV0`。每个回合使用开始时的文档、选择和 KV 快照；编辑与 KV 效果在成功返回后提交。

同步 WASM 不能等待用户表单，因此命令返回 `PluginCommandOutcomeV0`。宿主显示表单后调用 `plugin_resume_form`，最多 8 轮。格式转换使用 `plugin_convert_format`，conversion turn 不能写文档。

### 7. trusted-js 使用独立强类型 facade

`@amll-ttml-tool/plugin-sdk-js` 的入口模块提供 `activate({ pluginId, host, signal })`。host 包含文档、选择、项目、命令、菜单、标题栏、表单/通知、KV、网络、格式、模式和受信视图。

所有注册受插件命名空间约束并返回 disposable。宿主卸载时 abort signal，运行插件 cleanup，再释放 host handle 与 extension scope。trusted-js 可以使用 React Component，但 React/React DOM 必须由宿主共享，不能打包第二份 renderer。

### 8. Contribution 是受控声明

Manifest 可声明 commands、menus、settings、titleBarActions 和 formats。WASM 使用静态 contribution；trusted-js 可以通过 SDK 动态注册，并可额外注册 mode 与 trusted view。

enablement/when 使用受限表达式并失败关闭。声明式表单只支持协议控件、布局、动作、动画预设和 Fluent 图标白名单，不接受 HTML、CSS、SVG、React callback 或任意表达式。

### 9. 包和 catalog 都有版本化结构

自包含 package 为：

- `FunctionPluginPackageV0`：manifest + base64 WASM
- `TrustedJsPluginPackageV0`：manifest + UTF-8 ESM source
- `ThemePackageV0`：manifest + tokens + styles/assets

`RemotePluginCatalogV0` 使用同源相对 entry，channel 为 trusted-js、extism-wasm 或 theme，并可声明 SHA-256、平台、最低应用版本和 first-party。容器支持固定布局 ZIP 或 package JSON；trusted-js catalog entry 也可指向同源裸 ESM，由统一加载闸门处理。

### 10. 错误稳定且可序列化

跨边界错误使用 `PluginErrorCode` 与 `HostResult<T>`。权限、参数、revision、取消、超时、payload、limit、crash、网络和内部错误必须可区分。HTTP 非 2xx 是成功传输的 `HttpResponseV0`，不是 RPC 失败；离线或传输失败返回 `network-unavailable`。

## 验证要求

- TypeScript 与 JSON Schema 对同一有效/无效样例得出一致结论。
- parser 覆盖命名空间、跨字段、包载荷与恶意值。
- mock host 与真实 host 运行同一合同测试。
- 生成器 check 在提交中无漂移：`pnpm plugin:api:check`。
- 协议行为测试覆盖原子性、冲突、权限、限额、取消和卸载。

完整字段索引运行 `pnpm plugin:api:build` 后见 `docs/plugin-protocol-v0.md`。
