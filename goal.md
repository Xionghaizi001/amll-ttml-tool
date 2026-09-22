# AMLL TTML Tool 插件化路线图

当前执行入口是“后续实现顺序”，详细清单按前置依赖展开；并行项单独标明，原阶段编号保留以便追溯。已落地阶段的记录放在文末，只保留仍约束后续工作的决策、不变量与已知取舍。历史测试数量、lint/构建通过快照不再保留，验证数据以 CI 与专项验收记录为准；未完成的验收与平台覆盖缺口继续列出。

## 进度总览（2026-09-20）

- 已落地：阶段 0–7 的基础架构与运行能力，以及里程碑 1–3 的远程加载器、商店薄片与 time-shift 试点。
- SDK 已落地：公开 trusted-js SDK、time-shift 的 SDK-only 适配、宿主核心保留边界；项目只读信息、选择订阅、dialog/settings view 与匿名 HTTP 端口已接入，业务消费者尚未批量迁移。
- 本地安装已接通：trusted-js ZIP/JSON → consent → IndexedDB Blob → 同一加载闸门；导入、开发目录、启停、恢复、卸载与来源摘要已接入。Chrome 开发/生产预览生命周期验收通过。
- 当前优先项：工具链与 time-shift 独立模板、SDK tarball、锁定出厂 artifact 已落地；先补齐 trusted-js 单文件开发体验，再补远端仓库/静态源发布配置与桌面真机验收，之后按阶段 8 逐项迁移。
- 尚未落地：工具链/插件远端发布、插件依赖/主题作用域/局部覆盖、多商店提供者、QuickJS、阶段 8/9 完整业务迁移、阶段 10 后端。
- 测试统一位于根目录 `tests/`（镜像源码路径，包测试在 `tests/plugin-api`、`tests/plugin-sdk-js`），随分支入库。

## 后续实现顺序

| 顺序 | 工作 | 前置与完成边界 |
| --- | --- | --- |
| 1 | trusted-js 单文件开发体验 | 已完成 `definePlugin()` 元数据读取、manifest 自动生成、TypeScript/JSX ESM 构建、可复现 pack、`dev` 监听与插件级热重载；开发面板和完整来源标记仍待补齐 |
| 2（并行） | 商店提供者 → 插件依赖 → 主题作用域/局部覆盖 | 提供者依赖本地安装；跨提供者依赖解析依赖聚合目录；依赖协议须先于需要共享的迁移插件，主题/覆盖不阻塞无关迁移 |
| 3 | 阶段 8：批量迁移 | 第 1 项收口后，按辅助工具 → 元数据/Ruby/分词 → 帮助/设置/更新 → 可选格式 → 网络服务迁移 |
| 4（按需并行） | QuickJS guest SDK | 设计可先做；壳体实现等待 wasm 合同与 toolkit 首版，不作为 trusted-js 迁移前置 |
| 5（贯穿） | 开发文档整理 | 随各项实现同步交付；QuickJS 教程随壳体交付，其余文档不等待 QuickJS |
| 6 | 阶段 9：定制功能插件化 | SDK、外置模板与插件间关系三项就绪；审阅功能开发可与后端并行 |
| 7 | 阶段 10：后端实化与发布 | 提供者合同先完成；资格过滤、kill switch、审计须在审阅插件上架前就绪 |
| 8 | 最终收口 | 全部定制功能通过合同测试后冻结 API v1，完成插件交付后退役定制版分支 |

## 当前安全模型的冗余项与降级项（2026-09-21 复核）

定位：用户对自己的操作负主要责任，程序只保证稳定性与平台内的基本安全性。trusted-js 按应用级代码处理，consent 负责告知与授权，不承诺代码沙箱；只有随应用构建的 factory 模块免 consent，所有远程 trusted-js（含第一方更新）均须用户授权。后续机制按以下职责评审。

### 必须保留的稳定性与平台边界

- WASM 的独立 Worker、超时、调用与存储限额、崩溃自动禁用和单事务编辑；capability 校验、无 DOM/文件系统/Tauri 直达、宿主网络代理与隔离 KV。网络能力仍按实现进度开放，当前未接通的 bridge 不视为已有能力。
- manifest、协议、表单、主题 CSS、ZIP 路径和解压大小校验，避免损坏、卡死、资源耗尽与 UI 失控。
- trusted-js 的 consent、来源与风险展示、scope 清理和崩溃恢复；SDK capability 声明只用于文档、兼容性及提示，不能宣称可隔离任意 trusted-js 代码。
- 宿主凭据不进入插件存储、文档投影或公开 API，业务 API 在服务端鉴权。trusted-js 可借宿主能力操作用户数据及以当前登录身份调用 API；不向插件提供凭据原文是接口约束，不是同一 JS 环境内的强隔离承诺。

### 降级为完整性、兼容性、恢复与运营措施

- SHA-256、内容寻址与 artifact 字节一致性用于完整性、缓存、回退和可复现构建，不作为发布者身份认证或代码安全边界。
- 同源脚本、CDN 反向代理、immutable 缓存和 catalog `no-store` 用于部署与更新一致性；同源不等于可信。
- `firstParty` 是来源标识；factory/shadow/pin、`minAppVersion` 与平台过滤分别服务于出厂回退、版本兼容和运营策略，不替代用户授权或服务端鉴权。
- crash marker、自动禁用与主题安全模式只负责恢复和可用性；依赖闭包、批次回滚和失败隔离只负责安装一致性与兼容性，不传递权限。
- 资格过滤、kill switch 与必要操作记录用于运营和事故响应，发布溯源复用现有代码托管与 CI 记录。运营上可以不公开部分代码；代码公开后用户可修改源码自行运行，业务权限始终由服务端控制。

本次复核删除的冗余规划已从后续任务与历史决策中移除，不保留延后待办。新增安全机制须说明它如何防止插件故障或平台越界；仅增加高级攻击者成本的治理机制不列入本路线图。

## 目标结构

```
packages/plugin-api/          # 稳定、与宿主实现无关的公开协议
packages/plugin-sdk-js/       # trusted-js 运行时 SDK（TrustedJsHostV0、Mock 宿主），只依赖 plugin-api 与 React 类型
src/kernel/
  editor/                     # 文档事务、revision、撤销重做
  commands/                   # 命令注册与执行
  extensions/                 # contribution、事件、生命周期
  platform/                   # 文件、剪贴板、存储、URL 等能力
  theme/                      # 主题解析、校验、应用
src/plugins/
  runtime/                    # Extism、Worker、权限和隔离
  builtin/                    # 官方 TypeScript/React 插件
  adapters/                   # 宿主适配
  trusted/                    # trusted-js 加载闸门、工厂注册表、shadow 决策
  store/                      # 容器格式、安装管线、catalog 客户端
  ui/                         # 插件管理器、菜单、表单
tests/                        # 全部测试，镜像 src/ 与 packages/ 路径

仓库外（工具链与 time-shift 独立项目已落地）：
amll-ttml-plugin-toolkit/     # 插件工具链：脚手架、zip 打包、合同测试 CLI、本地静态 catalog 服务
amll-ttml-plugin-<name>/      # 外置插件，各自独立仓库，CI 产出 zip artifact 仅发布到自有商店源；出厂副本由宿主构建时从商店源按锁定版本拉取
```

## 里程碑 4 前置：trusted-js SDK 固化与开发者体验（2026-09-13 规划）

第 1 项与第 2 项构建边界已完成，第 3 项本地安装及外置模板已接通并完成 Chrome 验收。余下平台/发布缺口见各节；QuickJS 不阻塞首批 trusted-js 迁移。

### 1. 封装 trusted-js API

- [x] 分包：`packages/plugin-api` 继续只放与运行档无关的协议类型；新增 `packages/plugin-sdk-js`（trusted-js 运行时 SDK），允许 React 类型（仅类型，peer），仍禁止 Jotai/Tauri/内部 TTMLLyric。边界脚本为新包加正向白名单。
- [x] 定义 `TrustedJsHostV0` 公开接口：`document`（`readSnapshot()` 返回 `PluginDocumentV0` 投影而非 TTMLLyric、`applyEdit(ops: DocumentOpV0[], label)` 走同一 `document-ops`、`revision`、`onChanged` 订阅）；`selection`（选中行/词 id）；`commands`/`menus`/`titleBarActions` 注册（薄封装 ExtensionScope，`pluginId.` 命名空间强制不变）；`ui.showForm`/`ui.notify`；`storage.kv`（复用 `amll-plugin-kv` 命名空间隔离）；`formats.register`（同一 provider registry）；trusted 专属 `views`（mode/trusted view/titlebar group，React 组件入参）。
- [x] 宿主侧：`trusted-js-host.ts` 由裸 adapter 改为实现 `TrustedJsHostV0`，文档访问经 `PluginDocumentGateway` 投影/合并（与 WASM 回合宿主共用 document-ops 与 revision 冲突逻辑），使两档对文档的语义一致：单事务、来源标记、内部字段原位保留。
- [x] activation 合同：`activate(ctx: { pluginId, host, signal })` 返回 cleanup；`signal` 在 unload/崩溃禁用时 abort，覆盖"异步 handler 在途取消"的遗留取舍。
- [x] 合同测试：`runHostContractTests` 增加 trusted-js Mock 与真实宿主实现；边界脚本新增规则：`src/plugins/builtin/<plugin>/**` 插件模块与 `examples/` 只能导入 `@amll-ttml-tool/plugin-api` 与 `@amll-ttml-tool/plugin-sdk-js`，不得导入 `$/kernel`、`$/application`、`$/states`、`$/plugins/adapters`。
- 验收：SDK 包可在不含宿主源码的独立项目里编译；同一插件源在 Node 中以 Mock trusted host 完成命令 → 表单 → 单事务 → 撤销。

#### 第 1 项完成记录（2026-09-13，接口状态同步至 2026-09-19）

- 分包：`packages/plugin-sdk-js`（`@amll-ttml-tool/plugin-sdk-js`，`./testing` 子路径导出 `MockTrustedJsHost` 与 `createTrustedJsHostUnderTest`）。与 plugin-api 同样不走 pnpm workspace，靠 tsconfig paths 与 Vite/Vitest alias 解析；alias 改为正则形式以支持包子路径。React 只允许 `import type`（边界脚本逐条 import 检查）。`pnpm plugin:sdk:check` 以独立 tsconfig（仅 SDK 源 + plugin-api 源，lib 含 DOM 以取 AbortSignal）证明可脱离宿主编译。
- `TrustedJsHostV0` 定稿：`document.readSnapshot()` 返回含 ruby 的 `PluginDocumentV0`；`revision` 为 getter；`applyEdit(ops, label, { expectedRevision? })` 省略 expectedRevision 即不校验冲突（同步读改无间隙时无需传，跨 await 表单时应传）；`onChanged` 事件为 `DocumentChangedEventV0`（含 `sourcePluginId`）；`selection.get()` 只读，现已补充 `selection.onChanged` 订阅；`commands`/`menus`/`titleBarActions`/`formats`/`views` 均是 ExtensionScope 薄封装，命名空间与 titlebar 上限由 registry 强制；formats provider 以投影转换（importer 返回 `NewLineV0[]` + metadata，宿主用 seeded allocator 分配 id；exporter 收投影 lines/metadata）；`storage.kv` 每次调用直读写 `amll-plugin-kv` 命名空间；`views.registerMode` 经 `registerHostMode`（与 core.modes 同一入口，含切换快捷键）。
- 宿主共享服务：新增 `src/plugins/adapters/host-services.ts`（`pluginDocumentGateway`、`pluginKvStorage`、`getHostSelection`、`subscribeHostDocumentChanges`），WASM 回合宿主与 trusted-js 宿主共用同一实例，两档的事务路径、revision 冲突规则、来源标记与 kv 命名空间因此一致。`createTrustedJsHost`（`trusted-js-host-api.ts`）为纯工厂、端口注入，可在 Node 中与 `EditorDocumentService` 组成真实宿主。
- 加载器：ports 由共享 `host` 改为 `createHost({ pluginId, scope, signal })` 返回 handle；activate 上下文精简为 `{ pluginId, host, signal }`（不再暴露 entry 与 scope）；unload 顺序固定为 abort → cleanup → host handle dispose → scope dispose；activation 抛错同样 abort 并全清理。
- 合同测试入口：`runHostContractTests` 由 MockPluginHost、WASM 真实宿主、MockTrustedJsHost、真实 trusted-js 宿主共用；`createTrustedJsHostUnderTest` 把 HostCallV0 映射为 SDK 调用，不做能力检查（trusted 档全权）。
- 边界脚本：`src/plugins/builtin/<plugin>/**`（formats/modes/themes 三个宿主核心目录除外）与 `examples/` 只允许 plugin-api、SDK、React；SDK 包只允许 plugin-api 与 type-only React；`tests/` 纳入遍历，`tests/plugin-api`、`tests/plugin-sdk-js` 仅限对应包 + vitest，其余测试不受层规则约束。
- time-shift 提前迁至 SDK（本属第 2 项，被新边界规则强制）：算法改为生成 updateLine/updateWord（含 ruby）op 批，一次 `applyEdit` 即一次事务；`$/application/time-shift` 删除；版本升至 1.1.0；通知与 WASM 档一致附插件 id。
- 已知取舍：SDK 已提供 document 与 selection 变更订阅；`storage.kv.get/keys` 以读取整个命名空间实现（v0 数据量小）。

### 2. 内置插件改用 SDK

- [x] `builtin.time-shift`：移除对宿主内部路径的全部导入，只依赖 SDK；`shiftLyricTimes` 纯算法随插件打包（或由 SDK utils 提供），商店 artifact 不再隐式依赖宿主内部。
- [x] 划定不迁 SDK 的宿主核心：`core.modes`（fail-safe Edit）、`core.formats`（hostNative TTML）、内置主题。它们保持 builtin 直接注册；provider/mode 注册已与 SDK 的 `formats.register`/`views.registerMode` 共用 registry 入口。
- [x] catalog 构建脚本对 trusted-js 最终 ESM 产物校验：拒绝 `$/` 残留、非白名单静态/动态导入、不可静态确定的动态导入、运行时 require 和内嵌 React。SDK/API 随插件打包；React、React DOM 及 JSX/compiler runtime 的受支持入口保留 bare import，由宿主生成 import map，映射到同一次构建的共享模块（开发模式复用 Vite 依赖图）。宿主固定 React/React DOM 19.2.7，插件不得覆盖映射；构建约定见开发者手册。
- [ ] 里程碑 4 迁出的每个插件都以 SDK 为唯一依赖，本项作为其模板。
- 验收：边界检查通过；产物拒绝用例、开发映射及生产相对/根/子路径映射验证通过，React hooks/Context 与 renderer 共享已验证；time-shift 工厂版与构建 artifact 共用真实宿主的命令 → 表单 → 单事务 → 撤销测试。真实 Chrome 开发/生产预览安装生命周期已验证；time-shift artifact 的表单 → 单事务 → 撤销由真实宿主合同测试覆盖。

### 3. 插件加载器接受 trusted-js 来源安装

- [x] ZIP/JSON 使用 `parseTrustedJsPackage` 单一语义入口；本地、商店与开发目录都经过 `TrustedJsPluginService.load()`。
- [x] 执行来源：IndexedDB `amll-plugins` v2 的 `trusted-js` store 保存 Blob；同库 WASM 连接使用统一升级入口。consent 后持久化、再创建 Object URL；卸载或加载失败撤销 URL。
- [x] 宿主接线：商店安装端口、设置页/商店页导入、开发目录加载、启动恢复、禁用/启用/卸载、崩溃记账、semver shadow/pin 均已接入。开发目录仅会话有效。
- [x] 来源展示：user/dev/store 与客户端包内容 SHA-256；摘要仅供识别，不作为安全依据。同 id 内容变化重新 consent；失败恢复旧包与旧授权。
- [x] 验收：真实 Chrome 开发与生产预览完成 ZIP → consent → 菜单命令 → 禁用/刷新 → 启用/刷新 → 卸载/刷新；错误授权、写盘失败、恢复损坏与桌面默认关闭由自动化测试覆盖。
- [ ] 平台收口：桌面原生 WebView 的 Blob/共享 React 实测；当前 HTML CSP 原已允许 blob，本轮未把全应用 CSP 收紧为仅 `script-src 'self' blob:`（既有 inline/eval 等需求需独立梳理）。

### 4. 单文件 trusted-js 开发体验

目标是让插件作者主要维护一个 `src/plugin.ts`（可包含 TypeScript、JSX 和同目录静态模块），由 toolkit 自动完成 manifest、入口 ESM、source map 与 ZIP 产物；插件作者不需要手工同步 manifest 的重复字段或编写宿主专用构建配置。该项只覆盖 trusted-js，WASM 工具链另行规划。

- [ ] 入口约定：扩展 `definePlugin()` 支持从单一源码入口声明插件身份、版本、capability、静态 contribution 与 `activate()`；保留显式 `manifest.json` 覆盖机制，但默认模板不要求手写。
- [ ] 自动构建：`amll-plugin build/pack` 从源码声明生成或校验 manifest，编译 TypeScript/JSX 为宿主兼容的 ESM，继续 externalize 宿主 React，保留可用 source map，并复用现有 artifact 校验与打包路径。
- [x] 开发服务：提供 `amll-plugin dev`，监听源码及声明变化，输出临时开发模块和 manifest；宿主开发目录加载器可接收构建结果，不把开发产物写入持久安装记录。
- [x] 插件级热重载：源码变化后按 abort → cleanup → host handle dispose → scope dispose → 重新 import → activate 的顺序重载；保留插件 KV、用户授权、启用状态和宿主文档，不保留旧模块的闭包、监听器或 UI 注册。
- [ ] 失败处理：编译或激活失败时保留上一份可运行模块，开发面板显示错误并允许立即重试；热重载不得改变正式插件的 crash 计数和发布包状态。
- [ ] 最小调试能力：开发服务提供 source map、模块构建日志和重载原因；宿主显示当前来源为 `dev`，避免把临时构建误认为已安装发布版本。

2026-09-22 热重载适配：工具链成功构建后发布 `dist/module/manifest.json` 与入口模块，编译失败保留上次输出；宿主监听归应用会话所有，关闭设置页继续轮询，连续保存与手动重载串行处理。开发 consent 按同 id 的当前会话复用，与正式包的内容授权、崩溃计数分开；同版本开发副本可替换出厂实例且不改 factory pin。激活失败清理新实例并重新激活旧模块，KV 和文档不清空（不会撤销插件已经提交的文档事务）。错误目前以通知呈现，开发面板、source map 与真实浏览器/桌面端完整验收仍待完成。操作说明见 `docs/plugin-development-guide.md`。
- [ ] 安全取舍：trusted-js 继续按“用户对自己的操作负责”处理，保留 API/manifest 校验、来源展示、consent、scope 清理和崩溃恢复等必要机制。开发模式的权限与正式 trusted-js 一致，文案明确其可访问应用数据和登录态。
- 验收：从只含 `src/plugin.ts` 的最小项目执行 `create → dev → 修改源码 → 自动重载 → test → pack` 全流程；React 组件、命令、表单、文档事务和 cleanup 在真实宿主中可用；连续修改不会累积旧命令、监听器、视图或窗口；构建失败时上一版本仍可运行；正式 ZIP 与开发模块使用同一 API/manifest 解析和 artifact 校验。

## 插件工具链与 time-shift 外置（2026-09-20）

本地独立仓库位于同级 `amll-ttml-plugin-toolkit/`、`amll-ttml-plugin-time-shift/`，均未配置 remote。源码真相源：API/SDK 留宿主；插件实现与插件单元测试归独立插件仓库；宿主保留消费锁定 artifact 的真实宿主合同测试。

- [x] API/SDK 版本 0.1.0，exports 指向 ESM/声明产物，保留 testing 子路径与 private。`plugin:packages:build` 生成 tarball；tag `plugin-sdk-v*` 的 Release 附件 workflow 已提供。外部依赖采用 Release tarball，不采用 git prepare。
- [x] toolkit：create（trusted-js / Rust Extism WASM / theme）、build、test、可复现 ZIP pack、静态 catalog serve；共享 React external/产物导入检查；开发期轻量 mock 与权威 SDK Mock 分开。JS/WASM 生成项目通过同一协议合同，主题包通过 schema 与静态服务字节一致性检查。
- [x] time-shift：源码与单元测试外置，仅依赖公开 SDK/API；已生成唯一 ZIP。独立项目 vendored tarball 可脱离宿主源码安装。CI 包含测试、重复打包摘要一致性、tag 版本检查与可选静态 Pages 发布。
- [x] 宿主：`factory-plugins.lock.json` 锁定 id/version/sha256/source；收集器支持本地镜像或 HTTPS，验证后生成静态模块，catalog 引用同一 ZIP。宿主已删除 time-shift 源码与插件单元测试，保留 artifact 的真实宿主事务验收。sample WASM 仍以已编译资源打 ZIP，catalog 不编译插件源码。
- [x] 本地静态源：toolkit serve 的 catalog/内容寻址 artifact 可用；首个出厂 artifact 放在 `vendor/plugin-store/` 作离线镜像，构建与商店分发字节一致。
- [x] Chrome 夹具：toolkit `tests/chrome-smoke.mjs` 使用真实已安装 Chrome 与独立 profile；通过 HOST_URL 接入宿主生产预览，覆盖完整安装生命周期。
- [ ] 远端交付：创建/绑定两个远端仓库，发布 SDK/工具链 Release 附件与 time-shift 静态商店，随后把 lock source 指向正式 HTTPS 地址。当前本地镜像不等于远端已发布；发布后宿主升版才可做到仅改 lock。
- [ ] 平台补测：桌面 WebView 与跨平台 ZIP 可复现性。阶段 8 新插件直接沿用外置模板；有依赖关系的迁移须等待依赖协议。

v0 版本政策：SDK → 插件 → 宿主 lock 协调发布；宿主锁精确插件版本，升级、回退与离线出厂副本原则不变。操作手册见 `docs/plugin-development-guide.md`，本轮验收见 `docs/plugin-local-install-validation.md`。

## 商店提供者抽象与自托管（2026-09-13 规划，阶段 10 前置）

动机：允许用户或团队自托管插件后端，同时把阶段 10 官方后端约束为"提供者合同的一个实现"，避免后端接口与客户端各自生长。可在里程碑 4 前置第 3 项定稿后随时开始，与阶段 8 / 9 并行；须在阶段 10 立项前完成，作为后端的公开契约。

- [ ] 提供者合同 `StoreProviderV0 { id, name, catalogUrl, official }`：提供者只需提供清单（沿用唯一的 `RemotePluginCatalogV0` schema）与 zip artifact 两类静态产物，artifact 相对路径按提供者 catalog 所在目录解析；`catalog-client.ts` 由单一同源地址改为多提供者聚合（逐提供者缓存与失败隔离，一个提供者不可达不影响其他货架）。最小自托管后端 = 任意静态文件托管上的 `catalog.json` + 内容寻址 artifact（toolkit 的 `serve`/`pack` 即产出此布局），因此自托管在阶段 10 动态后端出现之前即可用；阶段 10 的资格 / kill switch 等动态能力以提供者描述中的可选端点扩展合同，静态提供者只是缺少这些端点。
- [ ] 来源与覆盖规则：`firstParty` 仅对官方（同源）提供者生效，其他提供者的该字段强制为 false；非官方提供者不得 shadow 出厂插件 id；跨提供者同 id 且 sha256 相同视为镜像、可互相替代，同 id 字节不同视为冲突，官方优先且非官方条目标记为"冲突不可安装"。
- [ ] 非官方提供者的安装路径（2026-09-13 复核定稿）：商店把 artifact 下载到本地后，一律经本地安装路径入库，三档统一为 fetch → sha256 校验 → 容器剥离 → 对应 `parse*Package` 闸门 → 授权 / consent → 持久化到 IndexedDB → 以本地来源加载；不复用远程 URL 直接执行。trusted-js 因此依赖里程碑 4 前置第 3 项落地本地执行来源（`blob:` 或 Service Worker 虚拟路径二选一），该项原备选"trusted-js 安装限于 catalog 内容寻址 URL"与本决策不相容、予以排除；其 consent 使用第三方措辞并标注提供者名，桌面 consent 闸门同样作用。官方同源提供者的 trusted-js 仍可走同源动态 import 与 shadow 路径，但同样须经用户 consent；`firstParty` 不豁免授权。
- [ ] 网络与平台：自托管服务须返回 CORS 头；Tauri 端沿用 WebView fetch、同受 CORS 约束，不为此引入原生 http 插件。
- [ ] 用户侧：商店页（受保护区域）提供添加 / 移除提供者，添加时按三档措辞给出警示并注明"该来源的 JS 插件一律按第三方处理"；提供者列表用户级持久化；移除提供者不卸载其插件，仅将它们标记为"来源已移除、不再更新"。
- [ ] 可用性：任一提供者不可达只在其货架显示"不可用"，不进入错误循环；依赖闭包解析（"插件间关系"第 1 项）跨全部提供者求解。
- 验收：用 toolkit `serve` 在本机起一个静态提供者，添加后其 wasm 与主题条目可安装、更新、卸载；同 id 镜像与冲突按规则处理；移除提供者后已装插件仍可用但不再提示更新；官方提供者不可达时自托管货架照常。

## 插件间关系：依赖、主题作用域与局部覆盖（2026-09-13 规划）

动机：阶段 8 会把原本在宿主内部互相调用的功能拆成多个插件（如元数据、Ruby、分词），阶段 9 的定制功能需要为宿主与其他插件提供语言包与专属视觉，这些都要求插件之间可以声明关系。三项顺序为 1 → 2 → 3：主题作用域与局部覆盖都以"目标插件存在且启用"为前提，复用依赖解析与级联规则。硬前置：里程碑 4 前置第 3 项（安装器接受三档来源），否则商店无法自动安装任意档的依赖。第 1 项须在阶段 8 出现首个跨插件依赖前完成；第 2、3 项可与阶段 8 并行，须在阶段 9 开始前就位。

### 1. 插件依赖

- [ ] 协议：`PluginManifestBase` 增加 `dependencies?: { id, version, optional? }[]`（`version` 为 semver range），function 与 theme 包均可声明；`parseManifest` 校验 id 格式、禁止自依赖、每 manifest ≤16 条。v0 依赖只表达"存在、版本范围与激活顺序"，不提供跨插件调用能力；跨插件命令调用作为后续 capability 另行评审。
- [ ] 解析规则：依赖满足 = 目标已安装且已启用且版本落在范围内；出厂副本视为已安装；依赖图必须无环（成环即拒绝安装）；激活按拓扑顺序进行；解析在安装与每次启用时都执行，不只在安装时。
- [ ] 商店安装：catalog 客户端对被依赖项求闭包（跨全部提供者，见"商店提供者抽象"），在一个确认弹窗中列出全部待安装项并按各自档位如实措辞（wasm 列能力清单、trusted-js 走 consent、theme 无需授权），用户一次确认后按拓扑顺序安装；任一项失败即回滚本批次已安装项，不留半状态。
- [ ] 手动安装（JSON / zip 导入、开发目录加载）：依赖缺失或版本不匹配时安装成功但状态置为 `disabled(missingDependency)`，插件管理器逐条列出缺失的 id 与版本范围，catalog 中存在时提供"去商店安装"入口；补齐后不自动启用，由用户显式启用。
- [ ] 级联：禁用或卸载被依赖项时，其依赖者自动置为 `disabled(missingDependency)` 并以通知列出；卸载确认弹窗预先列出受影响插件。状态区分 `disabledByUser` 与 `disabledByDependency`：被依赖项重新启用后，仅后者自动恢复启用，前者保持用户决定。
- [ ] 更新：catalog 更新会破坏现有依赖者版本范围时，商店页阻止一键更新并说明；版本选择取满足全部范围的最高版本。
- [ ] 信任边界不变：依赖不传递任何能力，wasm 插件依赖 trusted-js 插件不获得后者的权限；依赖关系仅影响激活顺序与启用状态。
- 验收：商店安装一个依赖两级的插件，一次确认后三者全部可用；中途失败全部回滚；手动导入缺依赖的插件被禁用并给出补齐指引；禁用被依赖项后依赖者消失，重新启用后自动恢复；重启后状态一致。

### 2. 主题作用域

- [ ] 协议：`ThemePluginManifest` 增加 `scope?: "global" | { pluginId }`，默认 global；插件作用域主题必须同时声明对目标插件的依赖（复用第 1 项，级联规则随之生效）；"主题包与功能包互斥"规则不变。
- [ ] 作用域锚点由宿主打标而非插件自报：插件贡献的视图根（mode mainView、trusted view、titlebar group）由宿主包裹并标记 `data-amll-plugin-scope="<pluginId>"`；宿主渲染的声明式表单与安全 UI 不属于任何插件作用域，不受作用域主题影响。
- [ ] 作用域 CSS 校验：作用域主题的每个选择器必须以 `[data-amll-plugin-scope="<目标 id>"]` 前缀锚定，其后沿用既有 slot / part 规则；功能插件可通过 `contributes.themeParts` 声明自有 part 名（强制 `pluginId.` 前缀、≤32 个）并在自己的 DOM 上以 `data-part` 标记，校验白名单 = `THEME_PART_NAMES_V0` ∪ 目标插件声明的 part。作用域主题的 token 编译到作用域元素而非 `:root`；强调色与 surfaces 属 `<html>` 级 flag，作用域主题不得设置（校验拒绝）。
- [ ] 多主题激活：`ThemeService` 的激活集由单一主题改为"至多一个 global + 每个 pluginId 至多一个"；应用一个主题时，若其作用域已被占用，则新主题生效、被替换者回到"已安装未激活"（最后应用者胜出）。强提醒不止于 toast：在受保护区域弹出确认对话框，点名两个主题及作用域，并提供"撤销本次应用"回退。启动时若持久化状态中出现同作用域多主题（迁移等原因），按应用时间保留最后一个并同样提醒。
- [ ] 安全机制覆盖全部作用域：安全模式、救援快捷键与恢复默认清空所有作用域主题；崩溃标记协议对作用域主题同样生效；用户 token override 仍为全局且在 `amll.user` 层永远胜出。
- [ ] 目标插件禁用时作用域元素消失、主题自然失效但保持激活态；目标插件卸载时按第 1 项级联为 `disabledByDependency`。
- 验收：一个全局主题与两个针对不同插件的作用域主题同时生效且互不干扰；对同一插件应用第二个作用域主题触发强提醒并可回退；作用域主题无法触及宿主 slot、安全 UI 与表单；安全模式一键清空全部。

### 3. 作用域内的局部覆盖

- [ ] 原则：只开放不影响被覆盖者核心功能的声明式表面。v0 可覆盖种类限定为 `localization`（命令 / 菜单 / 标题栏动作 / 设置表单 / 格式 provider 标题等 contribution 的 LocalizedText，以及插件自有字符串表）与 `icons`（宿主图标白名单内的替换）；命令处理器、文档操作、能力、激活事件、格式转换行为、视图组件与任何 id 一律不可覆盖。
- [ ] 协议：覆盖方 manifest 声明 `overrides?: { pluginId, kind, entry }[]`，`entry` 指向包内资源（如 `strings/<locale>.json`），且必须同时声明对目标插件的依赖（复用第 1 项）；覆盖 payload 沿用 LocalizedText 体积上限（≤2048 字符、≤16 语言）与无 HTML 约束；目标中不存在的 key 忽略并记诊断日志。
- [ ] 字符串表：为使插件代码内的文案也可被覆盖，SDK 增加 `host.i18n.t(key)`，读取插件包内声明的字符串表（`contributes.strings` 指向 `strings/<locale>.json`），trusted-js 与 wasm 两档同一形状；覆盖包提供同形状文件。硬编码在代码中的字符串不在覆盖范围内，迁移插件时应走字符串表。
- [ ] 解析：`ExtensionRegistry` 在读取 LocalizedText 时经过按目标 pluginId + contribution id + 字段 + locale 索引的覆盖层；覆盖项归属覆盖方 scope，scope dispose 即撤销、文案即时回退。语言包类覆盖不需要目标插件同意，但插件管理器在目标插件条目上显示"已被 X 覆盖"及来源。
- [ ] 冲突：多个插件覆盖同一目标同一 key 时，最后启用者胜出，并以与主题作用域相同的强提醒方式告知；插件管理器列出覆盖链。
- 验收：安装一个语言包插件后，目标插件的菜单、表单与代码内文案全部切换且核心功能不变；禁用语言包即回退；两个语言包冲突时触发提醒且顺序可预期；覆盖包无法改变目标插件任何 id、命令或能力。

## 阶段 8：批量迁移外围功能

执行清单（time-shift 外置模板就绪后开始）：

- [ ] 外围辅助工具。
- [ ] 元数据、Ruby、分词。
- [ ] 帮助、设置和更新。
- [ ] 文件与格式支持。
- [ ] 网络服务（先迁移 LRCLIB 等业务消费者，并接入网络端口与离线总开关）；GitHub、歌词站、NCM 与 Review 的外置迁移归阶段 9。

每迁移一个功能，都要求旧入口删除、插件禁用后功能消失、重新启用后状态恢复。按 2026-08-28 调序，本阶段即"里程碑 4"，其前置条件见"里程碑 4 前置"。迁出的插件沿用“插件工具链与 time-shift 外置”的独立项目模板；存在插件间依赖的功能（如元数据 / Ruby / 分词之间的共享）以"插件间关系"第 1 项的依赖声明表达，不得退回宿主内部直接耦合。

### 本轮迁移范围划定（2026-09-15）

本节是阶段 8 的范围基线。它只划定边界，不代表本轮已经完成插件适配、源码复制或外置仓库创建；后续实现必须先满足里程碑 4 前置的 SDK/安装/工具链条件，再按下表逐项迁移。

#### 纳入迁移的功能

下列功能属于业务能力或可替换 provider，目标是按 trusted-js（需要 React/完整交互）或 extism-wasm（纯逻辑、格式转换）适配为插件，在同级 `amll-ttml-plugin-<name>/` 独立仓库交付。按消费者需要补充公开端口，业务逻辑归插件；宿主核心的内部重构不作为迁移前置。

| 功能组 | 当前代码线索 | 目标插件边界 |
| --- | --- | --- |
| 时间平移 | `amll-ttml-plugin-time-shift/`（已外置，作为模板） | command、表单和单事务文档编辑已走 SDK；宿主消费锁定 artifact |
| 元数据编辑 | `src/modules/project/modals/MetadataEditor.tsx`、`src/modules/project/logic` | 元数据读取/编辑、文件名推导；通过 document/project API，不持有宿主 atom |
| Ruby/罗马音 | `src/modules/lyric-editor/tools/RubyEditor.tsx`、`src/modules/segmentation/utils/Transliteration` | Ruby 生成、分配与批量应用；与分词的共享通过插件依赖声明表达 |
| 分词与词级编辑辅助 | `src/modules/segmentation`、`src/modules/lyric-editor/tools/{ReplaceWordDialog,SyllableSmoothingDialog}.tsx` | 纯算法走 wasm；需要交互的编辑器走 trusted-js；统一使用 document-ops |
| 外围辅助工具 | `src/modules/lyric-drag`、非核心批处理/导入辅助对话框 | 仅迁出可由 contribution、command、声明式表单表达的功能；拖拽宿主手势保留，业务变更通过插件命令提交 |
| 帮助、设置和更新扩展 | `src/modules/settings` 中可独立关闭的业务页/工具 | 设置壳、插件管理、权限与恢复入口留在宿主；可替换的业务设置页/更新检查器再插件化 |
| 网络服务与定制功能 | `src/modules/lrclib`、GitHub/歌词站/NCM 等阶段 9 功能 | 通过明确的网络 capability 与离线总开关接入；凭据由宿主持有，插件只经宿主端口操作 |
| 可选格式 provider | 阶段 7 已定义的非 TTML provider 及未来第三方格式 | 复用 `core.formats` registry；TTML 不在此项迁出 |

#### 明确保留在宿主的功能

以下能力是应用稳定性、恢复入口、信任边界或宿主原生实现的一部分，保留在宿主，不以插件禁用为其生命周期条件：

- `core.modes`（包括 fail-safe Edit）、编辑器主视图与行/词渲染、选择/撤销/历史恢复等宿主交互骨架。
- `core.formats` 中的 `hostNative` TTML provider；阶段 7 已登记的 provider registry 入口保留，但 TTML 仍由宿主原生实现。
- 内置主题、主题 token/surface、受保护的权限/插件管理/恢复 UI，以及主题安全校验。
- 音频播放、频谱/时间轴渲染、FFmpeg/音频 worker、键盘与窗口控制等实时宿主设施。
- 文件选择/保存端口、项目打开与自动保存、IndexedDB/平台存储、Tauri/Web 宿主适配和应用启动编排。
- 插件加载器、安装器、catalog/store、consent、崩溃自动禁用、能力授权和 SDK/合同测试基础设施。

#### 暂缓或跳过迁移

- Review 独立模式及其页面壳、FLIP/WAAPI 动画、标题栏动作组留到阶段 9；report/filter/operation-log 纯逻辑随审阅插件迁出。
- QuickJS guest SDK、插件间依赖/主题作用域、商店后端与自托管属于路线图中的前置或并行工作项；在相应协议完成前不创建依赖它们的外置插件。
- 任何无法通过 SDK 表达、需要直接访问 Jotai/Tauri/DOM/内部 `TTMLLyric` 的代码，先留在宿主并拆出端口，不以“复制源码”方式绕过边界。

#### 迁出后的统一收尾条件

每个功能在独立仓库交付前，必须完成：SDK-only 或声明的 wasm capability 边界检查；宿主旧入口和重复实现删除；禁用/卸载后 contribution、监听器、worker 与存储命名空间全清理；重新启用和重启后状态恢复；工厂副本与商店 artifact 使用同一 sha256；宿主只保留锁定版本与加载适配，不再保留该插件的源码真相。

#### 接口与功能映射

| 功能 | 本轮可用的框架接口 | 业务迁移状态 |
| --- | --- | --- |
| 时间平移 | 既有 SDK commands/menus/form/document-ops | 已 SDK-only 并外置，宿主消费锁定 artifact |
| 元数据编辑 | document 投影/metadata ops + 新增只读 `project.getInfo()` | 接口就绪，现有 MetadataEditor 业务实现尚未改写为独立插件 |
| Ruby、罗马音、分词与词级工具 | 既有 ruby/document-ops + 新增 `selection.onChanged`、dialog view 宿主 | 接口就绪，算法与旧工具入口仍在宿主；依赖声明与完整业务迁移另行验收 |
| 帮助、设置扩展 | `settings-view` 接入设置页动态标签；贡献消失时回退常规页 | 插槽就绪；宿主设置壳、权限与恢复入口保留 |
| 网络服务 | trusted-js `network.request/isOffline`、协议 `network.http`、持久化插件网络开关 | 匿名 HTTP 接口就绪；LRCLIB/GitHub/NCM 尚未替换原调用，认证业务端口待实现 |
| 格式 provider、宿主模式 | 既有 `formats.register` / `views.registerMode` 共用 registry | core.formats/core.modes/内置主题仍保留宿主身份，未复制源码 |

实现约束：新增接口不暴露 Jotai、内部 TTMLLyric 或凭据；选择订阅在 host handle dispose 时清理；dialog 按实际 owner 检查，注册消失后自动关闭。网络请求禁携带宿主授权头/cookie，仅允许 HTTPS 和本机 HTTP 开发地址；请求体上限按 UTF-8 字节计算，响应流限制 8 MiB，超时与卸载中断请求，拒绝重定向。离线开关仅拦截经插件端口发起的新请求，不宣称覆盖尚未迁移的宿主网络调用或 trusted-js 自行调用 fetch。WASM 暂无 HTTP bridge，能力协商明确拒绝 `network.http`。

待补验收：接口适配尚未完成浏览器交互冒烟与 Tauri 真机测试；业务迁移后仍须逐项验证禁用、卸载与重启恢复。

SDK 构建边界、React 共享、本地安装与外置模板已落地；余下远端发布与桌面验收见对应章节。后续逐项迁移上表业务消费者并删除旧入口，通过禁用/重启恢复验收后在独立仓库交付。不得据“接口就绪”勾选阶段 8 全部迁移验收条件。

## 并行项：QuickJS guest SDK 适配

现状：仓库尚无 QuickJS 代码。路线沿用再校准结论（方案 A）：QuickJS 编译进 wasm 壳，插件作者写 JS，以 extism-wasm 档运行并享受沙箱，宿主零改动。

### 引入时机评估（2026-09-15）

当前不宜把 QuickJS 作为阶段 8 的硬前置：宿主已有稳定的 Extism Worker / `WasmGuestSession` / 回合限制 / 文档事务合同测试，但 QuickJS 壳、JS SDK、嵌入式构建链和真实 wasm fixture 均不存在；直接引入会同时改变 guest ABI、打包工具链和跨平台构建矩阵，延迟已经可以开始的 trusted-js 插件迁移。

建议采用“先冻结接口、后实现壳体”的时机：

1. **现在即可做接口准备**：把 QuickJS 能力限制写入 `plugin-api`/协议与文档，确定同步 `host.call(json)`、无 DOM/Node/网络、无跨回合 async、共享 `DEFAULT_WASM_TURN_LIMITS`，并用现有 `WasmGuestSession` 设计 fixture 输入输出；这不引入 QuickJS 依赖，也不阻塞阶段 8。
2. **满足以下三个门槛后再实现 QuickJS 壳**：`plugin-api` v0 的 wasm 调用合同冻结；`plugin:sdk` 的 wasm 侧高层 API 与 trusted-js API 形状完成对照测试；toolkit 的 `pack/test` 能稳定产出并加载普通 wasm 插件。届时可在 `examples/plugins/quickjs-shell` 建立独立实验，不接入默认 catalog。
3. **完成真实 fixture 和体积/启动基线后再开放给迁移插件**：壳体能通过 `WasmGuestSession` 全链路合同测试，10 秒回合限制下留有明确余量，Web 与 Tauri 构建均能复现；先用 sample-tools 的 `trimWords/wordCount` 验证，再允许阶段 8 新插件选择 QuickJS 入口。

因此，QuickJS 的**设计准备可以本轮开始**，**工程实现应排在 plugin-api/wasm 合同与 toolkit 首版之后、阶段 8 首个需要“同一业务代码跨 trusted-js/wasm”插件之前**；在上述门槛达成前，阶段 8 插件使用 trusted-js 或现有 Extism wasm，不为 QuickJS 保留宿主特判。

- [ ] 限制文档化：同步桥、无跨回合 async、无网络、Extism 内存上限、回合限额同 `DEFAULT_WASM_TURN_LIMITS`。
- [ ] wasm 壳 `examples/plugins/quickjs-shell`（Rust：extism-pdk + rquickjs，或 C quickjs-ng）：导出 `plugin_activate`/`plugin_execute_command`/`plugin_handle_event`/`plugin_resume_form`/`plugin_convert_format`，读取嵌入的 JS 源并把回合参数交给 JS；`amll_host_call` 暴露为 JS 全局 `host.call(json)` 同步桥；JS 异常映射为 plugin error 码。
- [ ] JS 侧 SDK（TypeScript → 单文件 JS，无 DOM/Node API）：与 trusted-js SDK 同名的高层 API（`document.readSnapshot/applyEdit`、`ui.showForm` 以 outcome 续体形式、`storage.kv`、`ui.notify`），差异只在能力范围与表单续体；类型来自 plugin-api。目标：一份插件业务代码在两档间只换打包入口。
- [ ] 打包脚本 `pnpm plugin:build:quickjs <dir>`：esbuild 打 JS → 嵌入 wasm 壳（自定义 section 或 `include_bytes`） → 产出 wasm + manifest；记录壳体积与回合启动时间基线（须在 10s 回合超时内留足余量）。
- [ ] 合同测试：以真实 wasm fixture 在 Node 中跑 `WasmGuestSession` 全链路（与 sample-tools 同套）。
- 验收：用 JS 重写 sample-tools 的 trimWords/wordCount，行为一致并通过同一合同测试。

## 贯穿项：开发文档整理

现状：`PLUGIN.md`（架构）、`docs/plugin-development-guide.md`（以 WASM 为主）、`docs/plugin-agent-guide.md`、`docs/plugin-protocol-v0.md`（自动生成）、`docs/plugin-runtime-poc.md`、ADR 0001–0003。trusted-js 接口与安装限制已有补充说明，但完整教程、商店/分发、主题包制作与 QuickJS 指南仍待整理；PLUGIN.md 的"阶段顺序"节已过时；信任模型决策目前只存在于本文档。

- [ ] 文档地图：PLUGIN.md 只做入口与架构概览并更新阶段顺序；开发指南按档拆分为 wasm（现有）、trusted-js、quickjs、theme（含 CSS 校验规则与 slot/part 合同）、分发与商店（zip 容器、catalog、sha256、factory/shadow/pin）；新增 ADR 0004 记录 trusted-js 档与信任模型再校准。
- [ ] 自动生成扩展：`gen-plugin-docs.ts` 覆盖 `TrustedJsHostV0` 与 SDK 类型，`plugin:api:check` 继续在 CI 保证一致。
- [ ] 人工/agent 撰写：每档一份"最小插件 → 构建 → 本地安装 → 发布到 catalog"端到端教程；各阶段"已知取舍"迁入文档 FAQ，本文档只留链接；agent guide 更新为新分层与 SDK 边界。
- 验收：随首个外置模板交付 trusted-js / wasm 教程；QuickJS 实现后补齐对应教程。新人或 agent 只凭 docs 完成相应插件并通过合同测试；基础文档不等待 QuickJS，信任模型与分发文档在审阅插件上架前收口。

## 阶段 9：定制功能插件化（原"移植定制版"，2026-08-28 调整）

执行边界：功能开发可与阶段 10 并行；审阅插件正式上架必须等待后端资格过滤、kill switch 与审计就绪。API v1 冻结与分支退役放在最终收口。

- [ ] 迁出审阅功能：页面壳、FLIP/WAAPI 动画与标题栏动作组由插件的受信任视图承接，report/filter/operation-log 格式化等纯逻辑归审阅插件，通过公开 SDK 接入宿主。
- [ ] 将插件事务接入 review operation log（以审阅插件内的 operation log 形态实现，不再依赖定制版宿主）。
- [ ] 为 agents、vocalTags、多语言和 songPart 增加 capability：不作为原生能力提供，而是作为插件接入现有体系，对应修改插件系统的作用范围。
- [ ] 通知中心、设置页扩展和复杂对话框按 trusted-js 插件 contribution 形态承接。
- [ ] 将 GitHub、Review、歌词站和 NCM 功能迁移为外置插件（非必须功能，且涉及版权或数据安全风险，不内置）。

## 阶段 10：插件商店后端（2026-09-22 身份与离线策略更新）

两条承重原则：

- 商店的“不分发”包含出于资格或运营需求而不公开部分代码的安排；这是分发策略，不是业务访问控制。代码一旦公开，用户可修改源码自行运行插件；审阅等业务 API 必须自行鉴权，业务安全性不得依赖“用户看不到或不能运行这个插件”。
- trusted-js artifact 保持不可变、内容寻址、CI 构建发布与同版本字节一致，以保证更新一致性、缓存、回退和可复现构建；这些措施及同源交付均不证明发布者身份或代码可信。

- [ ] 身份与资格：自托管服务器接入 GitHub OAuth，首次登录创建本地账号，以 GitHub 稳定用户 ID 关联身份，为组织内其他项目提供账号对接基础；OAuth 负责身份认证，服务端校验组织成员身份并按插件所需资格授权，登录成功不等于获得受限插件权限。清单 API 按当前会话与资格返回可见条目，未登录或无相应资格的用户只获得不含受限插件的清单；不再以歌词站账号 SDK 为商店身份前置。插件不内嵌秘密，业务 API 仍独立执行服务端鉴权。
- [ ] 受限下载：受限 artifact 的每次下载均由服务端依据上述会话与资格鉴权，不能只隐藏清单条目而暴露公开下载 URL；组织资格查询失败与明确无权限必须区分，无法确认资格时不新增受限下载授权，也不向客户端伪报资格撤销。GitHub OAuth 凭据由服务端保管，不提供给插件。
- [ ] 发布流水线：trusted-js 档只接受 CI 从源码构建发布（2026-09-13：以 PR 中的 commit 引用取代打 tag，见下文"托管形态与发布流水线"），记录 commit hash → artifact hash 溯源；版本不可覆盖重传；普通下架停止清单分发，受限插件另支持 kill switch，二者不得混为一谈；发布记录复用代码托管平台的 review 与 CI 记录。
- [ ] 同源交付：trusted-js artifact 从应用自身 origin 提供，CDN 只能藏在应用 origin 之后回源，不得成为独立脚本 origin；内容寻址 URL 保持不变，公开 artifact 使用 immutable 长缓存，受限 artifact 禁止未经鉴权的公共缓存命中，客户端缓存与服务端下载资格分开处理；按身份返回的清单使用 private, no-store，明确受限插件控制状态在下一次成功刷新后应用。
- [ ] 清单与版本协商：入参 platform/appVersion/pluginApiVersion，按兼容矩阵过滤返回；支持灰度发版与按用户锁版本。
- [ ] 运营控制：kill switch 仅作用于受限插件，支持插件级 / 版本级控制，不用于远程禁用普通公开插件；发布记录复用代码托管与 CI，资格变更及 kill 操作保留必要的运营记录；客户端崩溃自动禁用机制独立于服务端 kill switch，可选上报，除此之外遥测最小化。
- [ ] 客户端控制状态：清单缺项本身不视为 kill 或资格撤销，提供者的可选控制合同须明确区分禁用、资格失效与状态未知。收到服务端明确且适用于当前账号的禁用 / 资格失效结果后停止对应受限插件运行并 dispose scope，但不因此删除已安装包、插件数据或缓存；已确认的禁用状态需持久化，不能因后续断网自动解除。网络波动、超时、服务不可达或离线只记为状态未知，保留最近一次确认状态，不新增禁用或清理；恢复联网后重新校验。
- [ ] artifact 一致性约束：禁止服务端按用户个性化生成代码，同版本对所有用户字节一致；个性化一律走数据 API。
- [ ] 分档差异：第三方 trusted-js 可上架，走 consent + 来源展示（2026-08-27 再校准）。WASM/主题包货架以客户端校验为边界，后端做托管、元数据、账号实名与上传时复验客户端同款体积上限（主题包已迁 IndexedDB，上限重新定档后两端同步）；两个货架发布通道分离。
- [ ] 可用性：商店不可用不影响编辑器与出厂功能；清单请求失败只影响本次目录刷新、安装或更新，不等同资格失效，不禁用已有插件或清除数据与缓存，不进入错误循环。受限插件遵循最近一次明确控制状态；离线期间无法获知新的禁用决定，不承诺离线即时撤销，业务 API 权限仍由服务端控制。
- [ ] 包容器格式（前端部分已在里程碑 2 实现）：本地手写导入用 base64-JSON（保留设置页粘贴导入体验，维持既有紧上限）；商店分发一律 zip（固定布局、加固解包）。两条路径只是容器剥离前端，汇入同一 `parse*Package` 信任边界；格式识别用 magic bytes；手写 JSON 上架由打包脚本一键转 zip；IndexedDB 落盘统一为 manifest JSON + 二进制 Blob，不存 base64。

### 托管形态与发布流水线（2026-09-13 定稿，2026-09-22 同步身份与控制策略）

参考过的三种模型：Obsidian 社区插件（[obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)，Git JSON 索引 + 作者自托管 Releases，零服务端但无资格 / kill switch / 审计）、Zed 扩展（[zed-industries/extensions](https://github.com/zed-industries/extensions)，Git 索引 + 官方 CI 构建托管，与本项目发布约定最契合）、Open VSX（[eclipse-openvsx/openvsx](https://github.com/eclipse-openvsx/openvsx)，完整注册中心服务，对本项目规模过重）。最终采用 Zed 式主体加自有服务器动态层。

- 托管：artifact 分发与数据库由自有服务器与域名托管。服务器对客户端的公开面即"商店提供者抽象"中的官方提供者（清单 + zip artifact）；trusted-js 产物经应用 origin 的反向代理路径下发，内容寻址，公开 artifact 使用 immutable 长缓存，受限 artifact 遵循上述下载鉴权与缓存策略，服务器不得成为独立脚本 origin。服务端语言与数据库选型随实现立项时确定，本文档不预设。
- 投稿：以 commit 引用投稿（PR 中登记源码仓库 + commit hash），不接受存档文件。PR 阶段由无凭据 CI（fork 的 `pull_request` 工作流）跑 `parseManifest` / `parse*Package` 闸门、能力清单摘要与 toolkit 合同测试，结果以 bot 评论回帖；运营者依据校验结论审批。审批 = 分支保护 + CODEOWNERS + 必需 reviewer，GitHub review 记录即发布审计日志，不自建。
- CI：GitHub Actions 拉取指定 commit 构建，产出并发布 artifact，记录插件 id、版本、sha256、commit hash 与 workflow run id；投稿代码构建不暴露宿主或业务凭据。
- 构建与上架分离：推送成功的产物入库为"已入库未上架"状态，不进入清单；运营者在真实宿主上测试可用性与功能冲突后，经管理端点上架。构建成功不等于插件可用。
- 服务器接收：校验 sha256 与 CI 产物记录一致，拒绝同插件同版本换字节重传，不可变性由服务器强制而非约定。catalog 条目记录 commit hash 与 run id 供溯源。
- kill switch：仅针对受限插件，由后端管理端点自主控制（插件级 / 版本级），与 CI 推送弱相关；在线且成功刷新控制状态时以分钟级生效为目标，离线或请求失败不视为禁用。禁用只停止运行并保留包、数据与缓存；客户端刷新与控制状态合同遵循上文约定。
- 资格过滤：使用 GitHub OAuth 身份与服务端组织资格校验，由 API 选择返回的清单，未登录或无权限用户看不到受限条目；受限下载执行同样的资格校验。身份、清单过滤、下载鉴权与客户端控制状态须在审阅插件上架前就位，按用户锁版本保留扩展入口。
- GitHub 侧产物保留仅作备份（Actions artifact 最长 90 天且下载需鉴权，不可作分发节点）；如需公开镜像与回源兜底，用 Releases 附件。

## 最终收口：API v1 与定制版分支退役

- [ ] 上游宿主 + 全部原定制功能插件通过协议合同测试后，才冻结 API v1。
- [ ] 全部定制功能插件化完成后，以插件基座版本覆盖定制版分支并停止维护该分支；原定制功能经商店分发。

## MVP 完成标准

MVP 应能安装一个主题插件和一个 WASM 功能插件；功能插件能注册菜单、打开声明式表单、修改歌词并完整撤销；主题能安全替换视觉 token；插件超时或崩溃不会破坏编辑器；Web 和 Tauri 均通过冒烟测试。

## 基础阶段记录与遗留约束

以下保留阶段 0–7、信任模型和里程碑 1–3 的实现边界与决策。历史顺序用于追溯；新增工作按文首执行顺序推进，未完成的主题扩展等遗留项按需处理。

## 阶段 0：固定架构决策

- [x] 从干净的上游 main 创建独立 worktree 和功能分支，避免当前未跟踪的定制目录混入提交。
- [x] 编写 ADR，明确内核保留编辑、时轴、预览、频谱和音频能力。
- [x] 明确三类运行方式：builtin、extism-wasm、theme/none。
- [x] 规定主题包与功能包互斥，需要组合时使用两个插件包。
- [x] 将插件 API 标记为 experimental/v0，在全部原定制功能插件通过合同测试前不冻结 v1。
- [x] 重写 PLUGIN.md，先记录架构和协议，不急于保留现有函数原型。

验收条件：架构、信任边界、MVP 范围和非目标均已文档化。ADR 0001–0003 与 `PLUGIN.md` 为架构和协议的权威入口。

## 阶段 1：先验证高风险技术

- [x] 制作最小 Extism 插件，只接收 JSON 并返回 JSON。
- [x] 在浏览器 Worker、Tauri Windows 和 Tauri WebKit 目标上验证加载。
- [x] 验证插件终止、超时、重复加载和大 payload。
- [x] 记录启动时间、包体和序列化耗时；内存基线待目标平台回填。
- [x] 验证所需语言 PDK，覆盖 Rust 和 C#（WASI）。
- [x] 确认 Extism 被封装在 PluginRuntime 接口后，不泄漏到业务模块（`src/plugins/runtime` 之外不得出现 extism 依赖，有自动断言）。

## 阶段 2：建立编辑器事务层

- [x] 新增 EditorDocumentService，提供 readSnapshot、transact、replace、undo、redo。
- [x] 每次修改携带 source、label、pluginId 和 expectedRevision。
- [x] 一个插件操作只产生一个撤销记录。
- [x] 加入 revision 冲突检测，禁止异步插件静默覆盖用户新修改。
- [x] 插件只能看到公开文档投影，宿主内部字段由 adapter 保留。
- [x] 为行和单词使用稳定 ID，事件中不依赖数组索引。
- [x] 禁止新增代码直接写 lyricLinesAtom，通过 lint/import boundary 约束。
- [x] 分模块迁移现有直接写入点：编辑器、Ribbon、频谱、工具、导入器、元数据（含同步打轴、右键菜单、拖拽排序、分词对话框、设置页与历史恢复）。
- [x] 为事务、撤销、重做、冲突和字段保留添加测试。

验收条件：所有用户和插件文档修改都能被统一观察、撤销并标记来源。

## 阶段 3：建立公开 Plugin API

- [x] 创建独立的 packages/plugin-api，不得依赖 React、Jotai、Tauri 或内部 TTMLLyric（tsconfig `lib: ["ESNext"]` + `types: []` 编译期强制）。
- [x] 固定 UI 与业务的分层边界：业务逻辑只能依赖 kernel、platform 接口和 plugin-api；UI 只能通过 adapter、application service 或 command 调用业务。

- [x] 为文档、导入导出、分词、时间处理等可复用业务建立 host-agnostic application service（TimeShift、PlainTextImport、LyricExport、LyricTimeline/Mutation、TtmlFormat、LyricNavigation、LrcLibImport、Metadata、Segmentation、Romanization、项目历史/快照、SubmitToAmll 编排与 `HttpClientPort`）；React hook 只负责状态绑定、交互和错误展示。
- [x] 以时间平移完成 UI → command/application service → EditorDocumentService 的首个完整闭环迁移，并删除旧直写入口。
- [x] 为分层增加 import boundary/lint 约束，并在 CI 中检查新增跨层依赖。
- [x] 定义 FunctionPluginManifest 和 ThemePluginManifest 判别联合。
- [x] 定义 PluginDocumentV0、事件、命令、错误、权限和生命周期协议。
- [x] 使用 JSON Schema 校验所有 manifest、宿主调用和插件返回值。
- [x] 加入 apiVersion、themeApiVersion 和 capability negotiation。
- [x] 首批 capability：lyrics.core、lyrics.ruby、ui.notify、ui.form、storage.kv。
- [x] 为定制字段预留 capability 和 extensions，但不允许无约束覆盖内部对象。
- [x] 自动生成 SDK 类型和协议文档。

验收条件：Mock Host 中可以运行插件合同测试，不需要启动 React 应用；至少一个完整功能可在不渲染 React 的情况下通过 application service 执行、产生统一文档事务并撤销；业务层无 React/Jotai/Tauri/DOM 直接依赖。

### 阶段 3 完成记录：分层检查规则

`scripts/check-editor-boundary.mjs`（`pnpm lint:boundaries`，CI 执行）现行规则，后续新增模块须遵守：

- 相对导入按解析后的真实目标校验，不能以 `../../modules/...` 绕过 application/kernel 边界。
- 宿主全局补查小写 `document`、`window`、`localStorage`、`fetch` 等。
- 遍历 `tests/plugin-api/` 与 `tests/plugin-sdk-js/`；`src/platform` 与 `src/plugins`（runtime、adapters、ui、trusted、store 与根目录）有正向依赖白名单。
- rule E：UI 不得以别名或相对路径直接导入纯算法模块（drag-reorder、segmentation、syllable-smoothing、LRC parser、时间线边界等），只能经 application service 与 adapter；`?worker` 资源只能由 platform/runtime adapter 引入。
- 普通菜单项不得重新内联 `onSelect`/`onClick`/`onCheckedChange`（菜单只引用 command ID）。
- state 层不得重新访问 idb、fetch、localStorage 或 Object URL API（走 platform adapter）。

## 阶段 4：命令和 UI Contribution

- [x] 扩展现有 keyboard registry，使 command 同时包含 handler、enablement、来源和清理逻辑。
- [x] 菜单项只引用 command ID，不直接保存回调。
- [x] 建立菜单、工具栏、侧栏、设置页和对话框 contribution registry。
- [x] MVP 只开放命令、菜单、通知和声明式表单。
- [x] 第三方插件不得注入 React 组件或任意 HTML。
- [x] 内置插件可以注册受信任 React view contribution。
- [x] 插件卸载时必须自动清理全部 contribution 和事件监听器。
- [x] 将 `custom-background.ts` 的 Jotai、IndexedDB、localStorage 迁移、fetch 与 Blob URL 生命周期拆到 platform storage/resource adapter。

### 阶段 4 完成记录（2026-08-25，含交叉安全审计加固）

- `src/kernel/commands` 是 command 真相源；keyboard registry 保留原快捷键 storage key 并桥接 handler、enablement、source、execute 与 disposable。`CommandRegistry.execute` 在 enablement 回调后重新验证注册未被重入替换。
- `ExtensionRegistry` 以 owner scope 统一收集 command、contribution 与事件监听器，scope dispose 后三类资源全部消失；`emit` 按监听器隔离异常，单个插件抛错不阻断其后监听器。
- 命名空间：plugin scope 强制 `pluginId.` 前缀（command、menu、form id），menu 只能引用自己的命令；协议层 `parseManifest` 同步检查 `menus[].command` 前缀。`registerManifestContributions` 入口强制运行时 `parseManifest`，theme 包与非法 manifest 直接拒绝。
- 第三方 manifest adapter 仅映射 command、menu 和声明式 settings form；toolbar、sidebar、trusted view 仅 builtin/trusted scope 可注册，有正反合同测试。
- 菜单 contribution 的 `when` 以 `parseEnablement/evaluateEnablement` fail-closed 求值，宿主上下文由 `src/plugins/adapters/enablement-context.ts` 提供（mode/hasSelection/documentEmpty/audioLoaded/canUndo/canRedo 等）。
- 声明式表单：宿主完全控制渲染，协议拒绝 HTML/CSS/React/回调注入。能力包括宿主尺寸、递归 group、row/column 布局、`visibleWhen` 条件显示、数字 stepper、横向 radio、禁用 option、紧凑字段、缩进、按 `@fluentui/react-icons` 导出名引用宿主图标（`FORM_FLUENT_ICON_NAMES_V0` 白名单）与动画预设。
- 表单安全约束：`parseHostCall` 的 `ui.showForm` 与 manifest settings 共用 `validateFormSemantics`，宿主侧 `declarativeFormService.showForm` 再验一次；体积上限为 localizedText ≤2048 字符与 ≤16 语言、字段每层 ≤64、options ≤200、text default/placeholder/maxLength 设上限；提交前按 schema 重新 sanitize（类型强转、数字 clamp、选项成员与禁用检查、截断超长文本、丢弃 schema 外的键）；`complete/cancel` 必须携带 request id，不匹配即忽略。
- `ManagedResource`（自定义背景抽出的通用资源生命周期）：generation 计数使过期操作不改变状态（latest-wins），dispose 使在途操作失效；可复用于主题包资源。IndexedDB 打开失败不缓存、连接 terminated 后可重开；`browserKeyValueStorage` 包裹 SecurityError/QuotaExceededError。
- 首个内置插件 `builtin.time-shift` 完成 contribution 菜单 → command → 声明式表单 → `TimeShiftService` → 单一文档事务 → 通知闭环，旧 `TimeShiftDialog` 已删除。

### 阶段 4 扩展：模式、标题栏动作与表单动画（2026-08-26）

安全边界结论：

- 一级页面（模式）contribution 必须分信任档。builtin/trusted 插件可注册完整 React mainView；向第三方 WASM 开放一级页面等于交出整个主视口的任意渲染面（可伪造设置对话框等安全 UI），违反"第三方不得注入 React/任意 HTML"红线，MVP 排除。后续如需支持，只能走声明式页面 schema 或 WASM 渲染数据协议，另行评审。
- 标题栏承载模式切换器与窗口控制，属恢复入口性质区域。第三方最多获得声明式动作位（自身 command ID + 宿主图标白名单 + 纯文本 tooltip），固定插槽、数量上限、悬停展示插件来源，不得触碰窗口拖拽区、窗口控制和模式切换器。
- 表单动画采用声明式预设，不向表单协议开放 CSS 文本（对话框内视觉仿冒与遮挡风险）。如未来需要主题动画，应在主题合同内以受限 `@keyframes`（名称强制前缀 + 仅 transform/opacity/filter）另行扩展，属主题包能力，不进表单协议。

工作项（全部完成）：

- [x] mode/page contribution registry：modeId 全局唯一、按 order 排序、仅 trusted owner 可注册（与 trusted view 同一信任闸门），plugin scope 注册抛错，`parseManifest` 对任何声明 `contributes.modes` 的 manifest 直接拒绝。内置 Edit/Sync/Preview 由永不 dispose 的 `core.modes` builtin scope 注册（Edit/Sync 共享 mainViewKey，切换不重挂载编辑器）；App 主视口、RibbonBar、TitleBar 遍历 registry 渲染。
- [x] fail-safe：`FALLBACK_MODE_ID = "edit"`，未注册/已卸载的活动模式自动回退 Edit；edit 模式禁止携带 `when`；模式切换器包在 `data-amll-protected` 内且与 contribution 渲染区物理隔离。
- [x] 动态模式快捷键：内置三模式沿用 legacy storage key，动态模式使用 `keybindings:switchMode.<modeId>`；enablement 上下文 `mode` 字段返回解析后的活动模式 id，未知模式的 `when` 比较为 false。
- [x] 标题栏声明式动作位 `contributes.titleBarActions`：每 manifest ≤3 条，plugin owner 强制自身命名空间（command 与 id），tooltip 显示"文案 · 插件来源"，命令经 enablement 门控；builtin 可注册 `titlebar-group` trusted view 与模式级动作组。
- [x] 表单动画 `FormAnimationV0`（preset: fade/slide-up/scale-in；speed: fast/normal/slow = 120/200/320ms）加入 FormSchemaV0、字段 presentation、note 与 group；拒绝未知预设与任何数值 duration；`prefers-reduced-motion: reduce` 下全部禁用。

已知取舍：标题栏动作的 `when` 在 contribution/命令状态变化与父级重渲染时重估，选择态驱动的表达式可能滞后一帧；动态模式快捷键设置项显示 contribution 标题的 default 文本。

## 阶段 5：主题系统

- [x] 建立版本化 design token schema。
- [x] 为核心组件暴露稳定的 data-slot、data-part 或 CSS Parts。
- [x] 使用 @layer amll.base, amll.theme, amll.user 管理覆盖顺序。
- [x] 支持亮色、暗色、字体、间距、歌词、频谱和背景等 token。
- [x] 使用 CSS parser 校验扩展 CSS，禁止 @import、远程 URL 和越界选择器。
- [x] 将主题资源转换为本地 Blob URL。
- [x] 权限弹窗、插件管理和恢复入口放在不可被主题覆盖的区域。
- [x] 实现安全模式、主题预览、恢复默认和用户 token override。
- [x] 主题编辑器只编辑声明式 token，不执行主题代码。

验收条件：损坏或恶意主题不能隐藏安全 UI，应用重启后可以恢复默认主题。

### 阶段 5 完成记录（2026-08-25）

- Token 合同：`ThemeTokensV0` 的 color/lyrics/spectrogram 组仅接受 `THEME_*_TOKEN_NAMES_V0` 白名单键（`additionalProperties: false`），另有 `light`/`dark` 模式覆盖组；token 值经 unsafe-CSS 正则（禁 url/var/expression/@import/协议/转义/结构字符）与 per-kind 白名单（颜色、长度、字体族）双重校验。
- `ThemePackageV0` + `parseThemePackage` 是主题包唯一信任边界入口：校验 manifest kind、tokens、逐文件 CSS、manifest.styles 与包内文件双向一致、资源命名/mime 白名单与体积上限。内置示例主题（Midnight Violet、Paper & Ink）走与第三方完全相同的校验。
- CSS 校验器（`theme-css.ts`，纯 TS 零依赖）规则：状态机剥离注释并拒绝反斜杠转义、未终结注释/字符串、字符串内结构字符 `{};@\:`；文本级禁 `!important`（保证 amll.user 层永远胜出）、`@media/@supports/@font-face` 之外的全部 at-rule、`https:/data:/javascript:/file:/blob:`、`expression()/element()/-moz-binding` 与 `data-amll-protected` 字符串；`url()` 仅允许 `url(asset:<name>)` 且必须命中包内资源；结构层校验花括号配平、禁嵌套规则、@media/@supports 递归深度 ≤4；每个选择器必须以 `[data-slot="…"]`/`[data-part="…"]`（可带 `[data-amll-appearance="dark|light"]` 前缀）锚定，名称在 `THEME_SLOT_NAMES_V0`/`THEME_PART_NAMES_V0` 白名单内。
- 内核 `ThemeService`（`src/kernel/theme`，端口注入）：token 编译为 `--attt-*` CSS 变量（`:root` + 模式覆盖）；管理注册/导入/移除、应用/预览/取消预览/恢复默认、用户 token override、安全模式与资源 URL 生命周期。崩溃标记协议：注入前写 applyPending，宿主 mount 稳定后 confirmStartupStable 清除；下次启动发现残留标记即进入安全模式并持久化。initialize 幂等（StrictMode 双挂载不误判）。
- 层叠与安全 UI 保护：`index.css` 声明 `@layer amll.base, amll.theme, amll.user`，未分层的应用 CSS 永远压过三层，主题只能影响 slot 作用域；设置对话框标记 `data-amll-protected`；对话框/Toast portal 到 body 且 appContent 有独立 stacking context，slot 内元素无法绘制到 portal 之上。救援快捷键 Ctrl+Alt+Shift+F12（capture 阶段监听）一键恢复默认主题；`?theme-safe-mode=1` 强制单次安全模式启动。
- slot 合同：app-root、background-layer、title-bar、ribbon-bar、sidebar、lyric-editor、preview、audio-controls、spectrogram；part：lyric-line、lyric-word。已桥接 token：panel background、app background、歌词行选中/悬停背景、频谱背景/播放头、字体族、`--attt-spacing-scale` → Radix `--scaling`。

### 阶段 5 扩展：组件级背景、强调色与可读性检测（2026-08-26）

- `surfaces` token 组（`THEME_SURFACE_NAMES_V0`：titleBar、ribbonBar、dropdownMenu、playControls、modalLarge/Medium/Small），每个 surface 为 `{ kind: solid|gradient|image|none, value, scrim }`；image 只能引用包内资源。模态回退链 小 → 中 → 大，因此配置 modalMedium/modalSmall 必须存在 modalLarge，校验作用于 base 与合并 light/dark 后的有效集；`validateThemeTokens` 提供 `requireModalFallbackChain: false` 供宿主校验"主题+用户"组合。
- Flag 门控桥接：`ThemeService` 通过 `ThemeStyleSinkPort.setFlags` 在 `<html>` 打 `data-amll-accent` / `data-amll-surface-*`，桥接规则只在属性存在时生效，未设置的 token 永不重绘组件；强调色/surfaces 的 light/dark 覆盖要求 base 定义存在；安全模式与恢复默认清空全部 flag。
- 强调色：`color.accent` 经 color-mix 派生完整 Radix accent 量表，`--accent-contrast` 由相对亮度计算黑/白。
- 模态按 `data-amll-modal-size` 分大/中/小（未标注 Dialog 视为中、AlertDialog 视为小），全部规则 `:not([data-amll-protected])`；gradient 编译进 `-image` 变量，`none` 编译为 `initial` 以精确回退。
- 用户侧：token 覆盖编辑器支持强调色与 7 个 surface 的纯色/渐变（用户 token 禁止 image kind）；每个 surface 可另选本地图片，`ThemeService.setUserSurfaceImage` 只接受宿主生成的 `blob:` URL + 安全 scrim（该入口不得暴露给插件），Blob 持久化在 IndexedDB `amll-theme-surfaces`。
- 可读性检测（`src/kernel/theme/readability.ts`，纯函数）：WCAG 相对亮度取最差十分位对比度 + 局部梯度均值 + 亮度标准差；阈值对比度 ≥3、梯度 ≤0.05、标准差 ≤0.22；不达标时求解最小遮罩不透明度（目标 4.5，上限 0.85）。接入点：surface 选图自动叠加推荐遮罩并 toast 说明；全局自定义背景选图对五个 slot 逐一检测并调整遮罩/透明度滑杆。
- 已知取舍：强调色量表是 color-mix 近似而非 Radix 官方算法；surface 图片可读性用选择时的组件尺寸近似，窗口大幅缩放后不重算；下拉菜单 surface 会影响设置对话框内的菜单（核心安全控件不是菜单）。

### 阶段 5 遗留

- [x] 安装主题包已从 localStorage 迁到 IndexedDB `amll-theme-packages`（阶段 6 完成，首次启动自动迁移旧键）。原按 localStorage 设计的体积上限（单资源 ≤2MB base64、≤16 个、CSS 单文件 ≤128KB）可以放宽，新上限与分发容器格式在阶段 10 一并定档（IndexedDB origin 配额与自动保存/历史快照共享，仍需显式上限）。
- [x] 插件管理器与权限弹窗 portal 到 body 并标记 `data-amll-protected`，与设置对话框同等防主题覆盖。
- v0 已定义但尚未桥接到组件的 token：color.accent 之外的 textPrimary/textSecondary/border/danger、font.scale、spacing.radius、lyrics.wordText/wordSecondaryText/wordHighlight、spectrogram.lineSegment/wordSegment/gapSegment/waveform（频谱段颜色需接入 canvas 调色板）。CSS 变量已按约定名编译，按需在 base 层加 var() 桥接即可，不动协议。
- 主题编辑器 MVP 仅覆盖高频 token 的声明式输入；完整 token 编辑器与"导出为主题包"留待后续。
- 新增 slot/part/token 名需扩展 `THEME_*_NAMES_V0` 并 bump THEME_TOKEN_VERSION，跑同一份合同测试后再冻结 v1。

## 阶段 6：WASM 插件宿主

- [x] 每个第三方插件运行在独立 Worker 中。
- [x] 实现生命周期、RPC、调用 ID、取消、超时和 Worker 重启。
- [x] 限制 payload、并发、日志数量和持续执行时间。
- [x] 宿主函数逐项校验权限，WASM 不直接访问 DOM、网络和 Tauri。
- [x] 为插件提供隔离 KV 存储。
- [x] 实现崩溃通知、自动禁用和诊断日志。
- [x] 提供开发模式、目录加载、热重载、Mock Host 和示例插件。

### 阶段 6 完成记录（2026-08-26）

- 回合制调用约定：受 Extism `runInWorker: false` + 无 SharedArrayBuffer 约束，宿主函数必须同步。每次 guest 调用（activate/executeCommand/handleEvent/resumeForm/convertFormat）为一个回合，主线程随回合下发文档投影、选区与 KV 快照；Worker 内唯一同步宿主桥 `amll_host_call`（`extism:host/user`）解析 `HostCallV0` → `HostResponseV0`，逐调用 schema 校验 + capability 检查，回合外的宿主调用被拒绝。
- `ui.showForm` 改为命令 outcome 续体：`PluginCommandOutcomeV0`（done/showForm）+ `plugin_resume_form` 导出，每次命令 ≤8 轮；同步桥内的 `ui.showForm` 显式拒绝。`FunctionPluginPackageV0` + `parseFunctionPluginPackage` 为功能插件包单一信任入口；`document-ops` 由 MockPluginHost 与 Worker 回合宿主共用。
- 事务保证：回合内全部 `lyrics.applyEdit` 在回合结束后由 `PluginDocumentGateway` 合并为一个 `EditorDocumentService` 事务（source=plugin、携带 pluginId/label），以回合起始 revision 做冲突检测，冲突则整批拒绝并 toast；一次插件操作 = 一条撤销记录。插入行/词的 id 由回合种子确定性分配，guest 回合内可立即引用；投影未携带的内部字段按 id 原位 patch 得以保留。
- 运行时组件：`WasmTurnHost`（纯逻辑，Node 全测）、`WasmGuestSession`（Extism 会话 + 宿主函数绑定）、`wasm-host.worker.ts`、`WasmPluginWorkerClient`（调用 ID、每回合超时 → 终止 Worker、cancelAll、下次调用自动重建重载、指标）。`DEFAULT_WASM_TURN_LIMITS`：宿主调用 ≤128/回合、调用 payload ≤1MB、通知 ≤16、applyEdit 批次 ≤16 / ops ≤10000、存储键 ≤128、单值 ≤32KB、命名空间 ≤1MB、模块 ≤32MB、回合超时 10s；并发为每插件串行队列（一插件一 Worker 一在途回合）。
- 生命周期编排（`wasm-plugin-service.ts`，端口注入）：install（能力协商 + 持久化 + 激活）、enable/disable、uninstall（scope dispose + Worker 关闭 + KV 命名空间清除）、dev reload；激活失败进入 failed；崩溃/超时/内部错误连续 3 次自动禁用并持久化；每插件 200 条环形诊断日志。`document.changed` 按 manifest `activationEvents: ["onDocumentChanged"]` 派发，插件自身修改不回灌，队列中未开始的事件回合按最新事件合并。
- 权限与存储：授权弹窗在安装前列出逐项能力说明，授权全有或全无（v0）；插件包 + 授权状态存 IndexedDB `amll-plugins`（加载时重跑 parseManifest），隔离 KV 存 `amll-plugin-kv`（复合键 [pluginId, key]，配额 Worker 侧先行强制）。WASM 无 DOM/网络（allowedHosts 为空）/文件系统/Tauri 访问面。
- 宿主 UI：设置 → 插件页（列表/状态/能力徽章/启停/卸载/诊断日志/导入 JSON 插件包/安装示例插件）。开发模式（支持 File System Access 的浏览器）：选择目录（manifest.json + 入口 wasm）加载为会话级 dev 插件，轮询 lastModified 热重载；dev 加载、文件导入、示例安装、商店安装共用 `installPluginPackage` 单一闸门与授权弹窗。契约菜单位置：menu.file/edit/tool/help 与 context.lyricLine/lyricWord 全部渲染 `ContributionMenuItems`。
- 示例与合同：`examples/plugins/sample-tools`（Rust + extism-pdk，`pnpm plugin:build:sample`，产物 fixture 已提交）演示 trimWords 与 wordCount（showForm 续体）。真实宿主栈与 MockPluginHost 通过同一份 `runHostContractTests`；`WasmGuestSession` 以真实 wasm fixture 在 Node 中测全链路。
- 已知取舍：applyEdit 成功响应在回合内是乐观的，提交时 revision 冲突则整批拒绝并通知；跨多个表单轮次的编辑按回合分别成交；`document.undo/redo` 与 `selection.changed` 事件类型已定义但暂未派发；能力授权为整包确认；Tauri 端 File System Access 不可用时开发模式区块隐藏。

## 阶段 7：文件与格式插件化

- [x] 将平台文件选择能力和歌词格式处理拆开。
- [x] 建立 FileProvider 与 LyricFormatPlugin 接口。
- [x] 将 TTML、LRC、YRC、QRC 等注册为格式 provider。
- [x] 文件流程统一处理 dirty 确认、项目 ID、文件名、导入事务和导出校验。
- [x] Web 使用 File API/IndexedDB，Tauri 使用平台 adapter（范围见完成记录）。
- [x] 文件和格式插件不得绕过文档事务服务。

粒度决策（2026-08-27）：插件化的单位是"provider 注册"，不是"实现打包"。TTML 由自有 ttml-processor wasm 承担，ESLRC/QRC/YRC/LYS/ASS 来自上游 `@applemusic-like-lyrics/lyric` 单一 wasm 包，LRC 为 TS。不拆分这些整包：由单一 builtin scope `core.formats` 注册多个 provider，每个 provider 是包内函数的薄 adapter。这些 wasm-bindgen 包是主线程内部库，不改造成 Extism 沙箱插件（builtin 档不为受信任代码付 Worker/序列化成本）。TTML 是宿主原生序列化格式，注册为不可卸载 hostNative provider；其余 provider 可禁用，禁用后对应导入/导出命令随 scope 消失。第三方格式插件经 extism-wasm 的 `lyrics.format` capability 接入同一 registry 与同一文件流程。

### 阶段 7 完成记录（2026-08-27）

- provider 合同（`src/kernel/formats/LyricFormatProvider.ts`）：formatId/LocalizedText title/extensions/mimeType/importer/exporter 与 `LyricFormatHandledError`（provider 已自行展示错误时抑制通用 toast）。registry 规则：formatId 全局唯一、extensions 归一化、至少一个方向、plugin owner 强制命名空间前缀；`hostNative` 仅限 trusted owner、必须双向、全局唯一，扩展名冲突时优先解析。
- 平台文件端口：`FilePickerPort`/`TextFileSaverPort`/`HostOpenedFile`；`BrowserFileDialog` 以 File API 实现（Web 与 Tauri WebView 通用）；`TauriStartupFile` 承接 Tauri 启动参数文件。范围调整：Tauri 端文件选择/保存沿用 WebView 内 File API（仓库无 tauri fs/dialog 插件），如需原生对话框只需替换这两个端口实现。
- 统一文件流程 `lyric-file-flow.ts`（纯类、端口注入）：dirty 确认、项目 ID 匹配、文件名推导、单一导入 replace 事务（source=user + expectedRevision）、导出前后校验、音频元数据合并事务；纯决策在 `LyricFileService`。新建/打开/保存/剪贴板/纯文本导入/LRCLIB 导入/错误页救援保存全部经流程。历史恢复按"恢复"语义保留自身 replace 路径。
- 内置 provider（`core.formats`，终生存活）：ttml（hostNative）、lrc、eslrc/qrc/yrc/lys（双向）、ass（仅导出），实现全部动态 import。行为变化：导出 ESLyRiC 产出 `.eslrc`（原误用 `.lrc`）。
- 命令与菜单：`format-commands.ts` 依据 registry 自动派生 `core.formats.import/export.<formatId>` 命令，provider 消失时同步销毁；导入导出子菜单完全由 registry 驱动（第三方 provider 自动出现），标签用 i18n 模板 + provider 本地化名称。
- 第三方格式插件：协议新增 `lyrics.format` capability 与 manifest `contributes.formats`（id 强制插件命名空间前缀、需声明该 capability、至少一个方向、扩展名 `^[a-z0-9]{1,16}$`、每插件 ≤8），guest 导出 `plugin_convert_format`（import 收文本 ≤1MiB，export 收文档投影），返回 `FormatConversionResultV0` 且 kind 必须匹配方向。转换回合 `editsAllowed=false`，导入结果由宿主文件流程作为一次导入事务提交，格式插件无法绕过事务服务；能力未授予时跳过注册并记诊断日志；provider 与派生命令随插件禁用/卸载消失。
- 已知取舍：浏览器文件选择器取消时 Promise 不 resolve（与旧行为一致）；Ctrl+O 的音频路径依赖 `HostOpenedFile.asFile`；wasm 格式插件示例与开发文档留待里程碑 4 前置的文档整理。

## 信任模型决策记录

### 审阅功能采用受信任插件的原因

审阅功能是测量驱动的命令式 React UI（FLIP 卡片、DOMRect/WAAPI 动画、标题栏动作组、独立审阅模式），无法在声明式/WASM 档表达，只能以受信任插件承载；其代码已在公开分支上，因此远程分发的收益是发布解耦、包体卫生与权限门控，而非藏代码。该决策是 trusted-js 档的第一个实例。

当前准入规则见下文“信任模型再校准”；同源远程加载、本地 Blob 安装与 activation 合同分别见里程碑 1 和里程碑 4 前置。审阅功能迁移统一列于阶段 9。

### 信任模型再校准（2026-08-27 定稿）

背景：本工具用户量不足五位数；内容完整性的真正防线在上游（业务 API 服务端鉴权 + 人工审阅），凭据滥用的防线在 GitHub PAT scope。据此把安全投入按真实威胁模型重新定档：防"高级恶意攻击者"的增量基础设施停止新建；防"善意但有 bug 的插件"的健壮性设施（事务层、Worker 隔离、超时/崩溃自动禁用、单事务撤销）与已建成的沙箱档全部保留。

决策：

- 已建成的 WASM 沙箱档原样保留，定位为"无脑安装"档：坏插件最多自己崩溃，碰不到账号与系统。
- trusted-js 档提前并放宽向第三方开放：准入为"诚实 consent + 来源展示"（作者名/仓库链接，或轻量的社区已知作者名单）。审阅插件的资格门控保留，定位为运营/资格控制。
- 桌面端 trusted-js 由"MVP 禁止"改为 consent 门控：默认关闭，用户显式同意后启用。
- 用户提示语按三档如实定价（浏览器保护的是系统、不是账号，措辞不得混淆）：
  1. WASM 插件 / 主题：随便装，坏插件最多自己崩溃，碰不到你的账号和系统。
  2. JS 插件（浏览器）：可在本应用内以你的身份行事（读改数据、使用你的登录），但碰不到你的电脑。
  3. JS 插件（桌面）：在 2 之外还可能危害你的系统，请像"安装一个软件"一样对待。
- QuickJS guest SDK 按文首顺序作为按需并行项推进：与 PDK 共享同一信任档与协议，属 SDK 增量而非架构变更（方案 A：插件自带解释器，宿主零改动）。
- 两条不随规模松动的红线：
  1. 凭据（PAT/登录态）由宿主持有，不进插件可读存储、不进文档投影；trusted-js 的 consent 文案说明“插件可通过宿主提供的应用能力读取或修改用户数据，并以当前登录身份调用业务 API”。宿主 API 不应提供凭据原文；trusted-js 与应用同处 JS 环境，这一接口约定不构成对任意 JS 的凭据隔离保证。
  2. 业务 API 鉴权在服务端、不信任客户端。
- 风险自知：小社区信任集中且脆弱，一次"插件偷 token"事故的损害不按用户数摊薄；上述红线 + 诚实措辞即为此保留的最低纪律。

### 工作顺序调整与定制版分支退役（2026-08-28 定稿）

阶段 0–7 已建成全部底层边界，"不要从插件管理页/应用市场开始"的早期警告前提已失效。为让每个迁移出来的插件都能立即通过真实分发管线做接续测试，当时将阶段 8/9/10 的执行顺序重排如下；当前前置条件与并行关系以文首“后续实现顺序”为准：

1. 远程受信任插件加载器（已完成）。
2. 商店薄片：同源静态清单 + 内容寻址 zip artifact + 商店页面（已完成）。
3. 试点迁移：`builtin.time-shift` 走全链路（已完成）。
4. 批量迁移非核心内置功能（阶段 8 顺序沿用）与定制功能插件化。当前前置条件见文首“后续实现顺序”。
5. 后端实化（账号资格、kill switch、审计）安排在审阅插件上架前完成。

三条设计修正：

- 出厂副本原则：非核心内置功能迁移为插件后仍随应用打包（factory 版），商店只是更新与增量安装通道（Android 系统应用更新模型：清单版本更高时 shadow 出厂版，卸载更新回退出厂版）。商店不可用 = 没有更新，功能不缺席；桌面端与离线场景不影响随包 factory 插件可用；远程 trusted-js（包括第一方更新）仍须经过 consent。
- 清单协议只有一份：trusted-js、WASM 与 theme 三档共用同一清单 schema（入参 platform/appVersion/pluginApiVersion 过滤）。
- API v0 未冻结期间，远程分发插件由 CI 与应用版本联动发布，清单协商过滤不兼容版本。

定制版分支退役：插件系统投入运行后不再维护定制版分支，原定制功能全部以插件形式运行在上游基座上。阶段 9 更名为"定制功能插件化"，删除以双宿主长期并存为前提的工作项（"定制版 EditorHostAdapter"作废）。API v1 冻结条件改为：上游宿主 + 全部原定制功能插件（含审阅、GitHub、歌词站、NCM）通过协议合同测试。

## 里程碑 1：远程受信任插件加载器完成记录（2026-08-28）

- 协议：`RemotePluginCatalogV0` 三档共用，entry 字段在 schema 层只能表达相对路径（禁 scheme/绝对路径/`//`/反斜杠），parser 再拒点段与重复插件 id；含 apiVersion、sha256、platforms（运营过滤，非安全依据）、minAppVersion 与 firstParty。`parseRemotePluginCatalog` 为单一解析入口。
- 内核：`ContributionOwner` 的 trusted-js plugin owner 可 `trusted: true`（仅由加载闸门授予），可注册 mode、trusted view、toolbar/sidebar，同时保留 plugin 身份供来源展示与命名空间强制；extism-wasm owner 恒为 trusted: false。
- 加载器（`src/plugins/trusted/trusted-js-service.ts`，纯逻辑、端口注入）：`load()` 顺序执行 already-loaded/apiVersion/同源解析/桌面闸门/崩溃门/consent 后才 import；activation 与卸载合同见里程碑 4 前置第 1 项。崩溃标记：import 前落 pending，宿主 mount 稳定 5s 后清除并归零；上一会话遗留 pending 计一次崩溃，连续 3 次自动禁用。consent 每插件一次并持久化，拒绝不持久化；只有随应用构建的 factory 模块免 consent，所有远程 trusted-js 均须经用户授权，`firstParty` 仅作来源标识。桌面默认拒绝所有远程 trusted-js，须显式打开 `amll-trusted-js-desktop-enabled`。
- 宿主装配（`trusted-js-host.ts`）：`import(/* @vite-ignore */ url)` 同源动态导入；loader 状态存 localStorage（异常护栏，配额失效只降级崩溃记账、不降级信任检查）；启动时 fetch 同源 `plugins/catalog.json`（no-store），缺失/不可达/校验失败静默跳过。
- Consent UI：portal 到 body + `data-amll-protected`，措辞按三档如实定价，展示作者与主页。
- 已知取舍：桌面闸门同样拦截 firstParty 远程条目（桌面第一方随包插件走编译内置）；minAppVersion 客户端未强制（静态薄片由 CI 保证，后端实化时启用）；trusted-js ES module 的 sha256 未在 import 时校验（动态 import 无字节钩子，后端实化时以内容寻址 URL 解决），wasm/theme artifact 已在客户端强制校验。

## 里程碑 2 + 3：商店薄片与试点迁移完成记录（2026-08-28）

- 容器格式（`src/plugins/store/package-container.ts`，fflate）：magic bytes 识别（`PK\x03\x04` vs `{`，不看扩展名）；zip 固定布局 = 根下 manifest.json + assets/<name>；entry 名单由 manifest 派生，解压前按声明尺寸拦截 zip bomb（单 entry ≤33MiB、总量 ≤64MiB、≤64 个 entry），拒绝重复 entry、反斜杠、绝对路径与点段；容器层不做语义校验，剥离后汇入唯一的 `parseFunctionPluginPackage` / `parseThemePackage`。
- 安装管线（`store-install.ts` + `store-host.ts`）：fetch 同源 artifact → sha256 校验（crypto.subtle，内容完整性由客户端校验） → 容器剥离 → kind/channel 交叉校验 → 既有安装闸门。trusted-js 容器解析、安装端口与真实宿主均已接线（见里程碑 4 前置第 3 项）。
- Catalog 生成（`scripts/build-plugin-catalog.ts`，已并入 `pnpm build`）：按 lock 收集 time-shift ZIP、fflate 打包预编译 sample-tools zip（固定 mtime，字节级可复现）；产物写入 `public/plugins/store/<sha256>.<ext>` 与 `public/plugins/catalog.json`，均 gitignore。
- 试点迁移（time-shift → trusted-js 工厂插件）：`TrustedJsPluginEntry.loadModule` 为 bundled 工厂模块加载器，与主包同信任根，跳过同源解析与桌面闸门（桌面构建不丢失出厂功能），崩溃记账不变；`factory-plugins.ts` 从锁定 ZIP 生成目录导入，商店与出厂共用同一 artifact；旧 `BuiltinPluginHost` 已删除。shadow 决策（`trusted-js-load-plan.ts`）：catalog 同 id + trusted-js + 平台匹配 + semver 严格更高 + 未 pin → 远程 shadow 出厂版并附 fallback；桌面闸门关闭时计划层直接丢弃远程候选。启动顺序：工厂插件先加载 → catalog 到达后按计划换装；远程加载失败自动回退出厂版。pin 持久化在 `amll-trusted-js-factory-pins-v0`。
- 商店页（`PluginStoreDialog.tsx`，独立 modal，"工具"菜单入口，`tool.openPluginStore` 命令，Content 标记 `data-amll-protected`）：目录列表（三档徽章 + 第一方 + 作者来源）、安装/更新/回退出厂版、JS 插件启停、桌面远程 JS 插件 consent 开关、商店不可用提示。catalog fetch 收敛为共享缓存客户端 `catalog-client.ts`。
- 已知取舍：商店 wasm 条目每次更新走完整能力授权弹窗（无差量授权）；theme 货架 zip 路径已实现但 CI catalog 暂未发布主题条目；设置 → 插件页与商店页并存（前者管 WASM 安装/开发模式，后者管分发与 trusted-js），合并留待批量迁移时整理。
