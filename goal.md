# AMLL TTML Tool 插件化路线图

当前执行入口是“后续实现顺序”，详细清单按前置依赖展开；并行项单独标明，原阶段编号保留以便追溯。已落地阶段的记录放在文末，只保留仍约束后续工作的决策、不变量与已知取舍。历史测试数量、lint/构建通过快照不再保留，验证数据以 CI 与专项验收记录为准；未完成的验收与平台覆盖缺口继续列出。

## 进度总览（2026-09-19）

- 已落地：阶段 0–7 的基础架构与运行能力，以及里程碑 1–3 的远程加载器、商店薄片与 time-shift 试点；阶段 3 的遗留 UI/业务拆分仍未完成。
- SDK 已落地：公开 trusted-js SDK、time-shift 的 SDK-only 适配、宿主核心保留边界；项目只读信息、选择订阅、dialog/settings view 与匿名 HTTP 端口已接入，业务消费者尚未批量迁移。
- 安装链路部分完成：trusted-js 包解析、zip/JSON 解包、商店安装端口已实现；真实宿主未装配本地安装端口，持久化、执行来源与安装 UI 尚未完成。
- 当前优先项：收口 SDK 产物检查与 React 共享方案，完成本地安装链路，建立工具链和 time-shift 外置模板；随后按阶段 8 逐项迁移。
- 尚未落地：工具链/插件独立仓库、插件依赖/主题作用域/局部覆盖、多商店提供者、QuickJS、阶段 8/9 完整业务迁移、阶段 10 后端。
- 测试统一位于根目录 `tests/`（镜像源码路径，包测试在 `tests/plugin-api`、`tests/plugin-sdk-js`），随分支入库。

## 后续实现顺序

| 顺序 | 工作 | 前置与完成边界 |
| --- | --- | --- |
| 1 | 迁移准备 + 里程碑 4 前置第 2 项 | 按待迁功能拆分遗留业务边界；先落实 SDK 构建约束、React 共享与产物依赖检查 |
| 2 | 里程碑 4 前置第 3 项：trusted-js 本地安装 | 先确定 Blob / Service Worker 执行来源，再接持久化、consent、宿主安装端口、UI 与重启恢复 |
| 3 | 工具链 → time-shift 外置模板 | API/SDK 可被独立项目消费 → toolkit pack/test/serve → 静态源发布 → 锁定出厂副本；安装验收依赖第 2 步 |
| 4（并行） | 商店提供者 → 插件依赖 → 主题作用域/局部覆盖 | 提供者依赖本地安装；跨提供者依赖解析依赖聚合目录；依赖协议须先于需要共享的迁移插件，主题/覆盖不阻塞无关迁移 |
| 5 | 阶段 8：批量迁移 | 第 1–3 步收口后，按辅助工具 → 元数据/Ruby/分词 → 帮助/设置/更新 → 可选格式 → 网络服务迁移 |
| 6（按需并行） | QuickJS guest SDK | 设计可先做；壳体实现等待 wasm 合同与 toolkit 首版，不作为 trusted-js 迁移前置 |
| 7（贯穿） | 开发文档整理 | 随各项实现同步交付；QuickJS 教程随壳体交付，其余文档不等待 QuickJS |
| 8 | 阶段 9：定制功能插件化 | SDK、外置模板与插件间关系三项就绪；审阅功能开发可与后端并行 |
| 9 | 阶段 10：后端实化与发布 | 提供者合同先完成；资格过滤、kill switch、审计须在审阅插件上架前就绪 |
| 10 | 最终收口 | 全部定制功能通过合同测试后冻结 API v1，完成插件交付后退役定制版分支 |

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

仓库外（2026-09-13 规划，名称待定）：
amll-ttml-plugin-toolkit/     # 插件工具链：脚手架、zip 打包、合同测试 CLI、本地静态 catalog 服务
amll-ttml-plugin-<name>/      # 外置插件，各自独立仓库，CI 产出 zip artifact 仅发布到自有商店源；出厂副本由宿主构建时从商店源按锁定版本拉取
```

## 迁移准备：收口遗留业务边界

阶段 3 遗留项，按阶段 8/9 即将迁移的消费者逐步完成；不要求先拆完全部宿主模块才开始独立插件模板。

- [ ] 将 Jotai、React、Tauri、DOM 和 Worker 依赖收敛到 adapters/ui/runtime；业务层不得反向导入这些实现。
  - [x] `kernel`、`application`、`plugin-api` 层已禁止反向导入并由 lint 检查。
  - [ ] 继续拆分 `src/modules` 中混合 UI/业务的遗留模块，优先级依次为：`sync-keybinding.tsx`（整套打轴判定/智能首末词/空拍状态机，建议抽出 `SyncTimingService`）、`lyric-line-view.tsx`（endTimeLink 联动规则）、`lyric-word-menu.tsx`（词拆分/合并/增删事务构造）、`useLyricListDrag.ts`（指针几何/自动滚动）、`useTopMenuActions.ts` 的 `onSyncLineTimestamps` 与 `buildRubySegments`、`lyric-line-menu.tsx` 的行合并时间重排；`ttml-processor/index.ts` 直接读取 `globalStore` 取生成配置，建议改为注入。

## 里程碑 4 前置：trusted-js SDK 固化与开发者体验（2026-09-13 规划）

执行顺序：第 1 项已完成；先收口第 2 项的构建边界与 React 共享方案，再完成第 3 项本地安装链路。工具链开发可同步推进，但独立插件模板的安装验收依赖第 3 项接入真实宿主。QuickJS 与开发文档已单列为后续并行项，不阻塞首批 trusted-js 迁移。

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
- 已知取舍：SDK 已提供 document 与 selection 变更订阅；`storage.kv.get/keys` 以读取整个命名空间实现（v0 数据量小）；catalog 构建脚本尚未对产物断言"无 `$/` 残留"（第 2 项）。

### 2. 内置插件改用 SDK

- [x] `builtin.time-shift`：移除对宿主内部路径的全部导入，只依赖 SDK；`shiftLyricTimes` 纯算法随插件打包（或由 SDK utils 提供），商店 artifact 不再隐式依赖宿主内部。
- [x] 划定不迁 SDK 的宿主核心：`core.modes`（fail-safe Edit）、`core.formats`（hostNative TTML）、内置主题。它们保持 builtin 直接注册；provider/mode 注册已与 SDK 的 `formats.register`/`views.registerMode` 共用 registry 入口。
- [ ] catalog 构建脚本对 trusted-js 产物断言：无 `$/` 别名残留、外部依赖只允许 SDK 与 React；React 采用宿主 import map 外置，插件构建时将 `react`/`react-dom` 标记为 external，确保插件与宿主共享同一 React 实例（避免 hooks、Context 和 renderer 不一致）。宿主统一固定 React 版本与映射，插件不得覆盖 import map；产物仍需保留 `import React from "react"` 等 bare import，并由构建校验确认不存在其他外部依赖。
- [ ] 里程碑 4 迁出的每个插件都以 SDK 为唯一依赖，本项作为其模板。
- 验收：边界脚本对插件目录的新规则通过；time-shift 商店 artifact 与工厂版行为一致（现有 Playwright 冒烟脚本复跑）。

### 3. 插件加载器接受 trusted-js 来源安装

现状：`parseTrustedJsPackage`、zip/JSON 容器解包与 `store-install.ts` 的 trusted-js 安装端口已实现；`store-host.ts` 尚未装配 `installTrustedJsPackage`，真实宿主仍拒绝本地 JS artifact 安装。现有执行来源仍为工厂模块与同源 catalog 模块；持久化、本地执行来源、导入 UI 与开发目录加载待接入。

- [x] 接口迁移：trusted-js 包复用 zip 容器（根下 manifest.json + `assets/<entry>.js`），以 manifest 的 `runtime: "trusted-js"` 判别；新增 `TrustedJsPluginPackageV0` 与 `parseTrustedJsPackage` 单一语义闸门，容器层只剥离并返回 UTF-8 源码，不执行代码。
- [ ] 模块执行来源决策：安装的 JS 源以 Blob 存 IndexedDB `amll-plugins`，运行时用 `blob:` Object URL import，CSP 放宽为 `script-src 'self' blob:`。
- [x] 接口迁移：`store-install` 接受 trusted-js channel，并将解包结果交给注入的 `installTrustedJsPackage` 端口；该端口负责 `parseTrustedJsPackage`、consent、持久化及同一 `TrustedJsPluginService.load()` 闸门。此处仅完成端口合同，尚未在真实宿主装配。
- [ ] 宿主接线：实现并向 `store-host.ts` 注入 `installTrustedJsPackage`，接通 consent、IndexedDB Blob 持久化、启动恢复、导入 UI 与开发目录加载；执行统一经过 `TrustedJsPluginService.load()`。
- [ ] 语义对齐：卸载/禁用/崩溃自动禁用/semver 更高 shadow 与 catalog 条目一致；本地安装包的 sha256 由客户端计算并在来源展示中列出（不是安全依据）；`PluginInstallSource` 沿用 user/dev/store。
- 验收：从 zip 安装一个第三方 trusted-js 插件 → consent → 菜单命令可用 → 禁用后消失 → 重启后恢复 → 卸载后 scope/存储全清理；桌面闸门关闭时被拒并给出开关指引。

## 插件工具链与内置插件外置（2026-09-13 规划）

动机：里程碑 4 会产出十余个 SDK-only 插件。若它们继续以 `src/plugins/builtin/<plugin>` 形态住在宿主仓库，插件的发布节奏、测试与 CI 都与宿主强耦合，商店"更新通道"的意义被架空，第三方作者也没有可照抄的独立项目样板。因此在批量迁移开始前先把工具链与首个插件（time-shift）外置，形成模板；此后阶段 8 的每个插件按模板"生而外置"。前置：里程碑 4 前置第 1 项（已完成）与第 2 项中 time-shift 的 SDK-only 化（已完成）。两项顺序为 1 → 2，均可与"插件间关系"并行。第 1 项的端到端安装验收依赖 trusted-js 本地安装链路；第 2 项须先有静态商店源与 artifact 发布通道，不必等待阶段 10 的动态后端。

### 1. 插件工具链外置项目

- [ ] 让 `packages/plugin-api` 与 `packages/plugin-sdk-js` 可被仓库外项目消费：真实 semver（0.x，与 API v0 同步）、`exports` 指向构建产物而非源文件（当前 `import` 条件指向 `src/index.ts`，只在宿主 alias 下可用）、CI 在打 tag 时构建并附产物到 GitHub Release。外部项目以 git tag 引用消费（`github:<owner>/<repo>#<tag>` 依赖加 `prepare` 构建，或引用 Release 附件 tarball，二选一定稿），保持 `private: true`。两个包的源码真相源仍在宿主仓库：协议在 v0 期间与宿主同步演进，分离仓库会制造双向发布依赖。
- [ ] Mock 宿主两处并存（2026-09-13 复核定稿）：宿主仓库内的 `MockPluginHost`、`MockTrustedJsHost`、`runHostContractTests` 与 `document-ops` 保持以 `testing` 子路径随包发布，是真实载入前合同测试的权威实现；toolkit 另持一份面向开发阶段的 mock 宿主，作为插件开发工作流中的自动化测试工具（快速迭代、无需宿主构建产物）。漂移控制：toolkit 的 mock 宿主只能基于已发布的 plugin-api 包类型与 schema 构造，不复制宿主内部逻辑；插件发布前必须在宿主自带的 mock 宿主与真实宿主上通过合同测试，toolkit 测试通过不作为上架依据。
- [ ] 新建空项目 `amll-ttml-plugin-toolkit`（名称待定），承载与宿主实现无关的开发工具：`create` 脚手架（首版 trusted-js / wasm / theme 模板，quickjs 模板待壳体可用后补齐）、`test`（在 Node 中以 Mock 宿主跑合同测试）、`pack`（zip 容器打包，逐字节可复现，从 `scripts/build-plugin-catalog.ts` 抽出与宿主无关的打包部分）、`serve`（本地静态 catalog 服务，产出与商店同布局的 `catalog.json` + 内容寻址 artifact，供开发与自托管）、e2e 夹具（拉起真实宿主构建产物 + 待测插件的 Playwright 冒烟）。
- [ ] 宿主仓库的 `scripts/build-plugin-catalog.ts` 收缩为"收集已固定版本的 artifact + 生成 catalog"，不再编译插件源码（见本节第 2 项）。
- 验收：在不克隆宿主仓库的机器上，用 toolkit 脚手架生成一个 trusted-js 插件与一个 wasm 插件，`test` 通过同一份合同测试，`pack` 产物可被宿主"导入插件包"直接安装。

### 2. 内置插件外置

- [ ] 范围：`src/plugins/builtin/<plugin>` 中 SDK-only 的功能插件（当前为 time-shift，阶段 8 产出随后跟进）。宿主核心目录 `core.modes`、`core.formats`、内置主题不外置（里程碑 4 前置第 2 项已划定）。
- [ ] 每个外置插件为独立仓库（命名约定待定，如 `amll-ttml-plugin-<name>`），只依赖 plugin-api、SDK 与 React 类型；每个 tag 由 CI 产出唯一产物 zip artifact，逐字节可复现，只发布到自有商店源，不进入任何公共包注册中心。
- [ ] 宿主侧：新增锁定文件 `factory-plugins.lock.json`（每个出厂插件的 id、版本、sha256、商店源 artifact 路径）；宿主构建脚本按锁定文件从商店源拉取 zip artifact、校验 sha256 后解包到生成目录（gitignore），`factory-plugins.ts` 从生成目录静态导入 trusted-js 工厂模块，wasm / theme 出厂包则作为资源打包并经同一容器剥离路径加载；catalog 直接引用同一 artifact（sha256 必须一致，CI 断言）。外置完成后删除仓库内对应源码与测试，边界脚本的插件目录规则随之收缩。
- [ ] v0 期间的版本耦合政策：宿主锁定精确插件版本；插件仓库 CI 以其声明的 SDK 版本范围跑合同测试；SDK 破坏性变更走协调发布（SDK 打 tag → 各插件更新并发布到商店源 → 宿主更新锁定文件），变更按批合并以减少轮次。接受这一成本，换取插件独立迭代与真实的更新通道。
- [ ] 出厂副本原则不变：出厂版 = 锁定文件所指的商店源 artifact 版本，与商店分发的是同一份字节；catalog 中 semver 更高者按既有 shadow/pin 规则换装；商店不可用不缺功能。
- [ ] 与阶段 8 的关系：time-shift 模板验证通过后，阶段 8 新迁出的插件直接以外置形态落地；此前已在仓库内落地的 SDK-only 插件在里程碑 4 收口前完成外置。外置插件的测试随插件仓库迁移，各仓库沿用"根目录 `tests/` 镜像源码"约定。
- 验收：宿主仓库不再含 time-shift 源码；宿主按锁定文件从商店源拉取出厂副本构建、现有 Playwright 冒烟通过；商店 artifact 与出厂版为同一 sha256；插件仓库单独发版后，宿主升版 PR 只改锁定文件。

## 商店提供者抽象与自托管（2026-09-13 规划，阶段 10 前置）

动机：允许用户或团队自托管插件后端，同时把阶段 10 官方后端约束为"提供者合同的一个实现"，避免后端接口与客户端各自生长。可在里程碑 4 前置第 3 项定稿后随时开始，与阶段 8 / 9 并行；须在阶段 10 立项前完成，作为后端的公开契约。

- [ ] 提供者合同 `StoreProviderV0 { id, name, catalogUrl, official }`：提供者只需提供清单（沿用唯一的 `RemotePluginCatalogV0` schema）与 zip artifact 两类静态产物，artifact 相对路径按提供者 catalog 所在目录解析；`catalog-client.ts` 由单一同源地址改为多提供者聚合（逐提供者缓存与失败隔离，一个提供者不可达不影响其他货架）。最小自托管后端 = 任意静态文件托管上的 `catalog.json` + 内容寻址 artifact（toolkit 的 `serve`/`pack` 即产出此布局），因此自托管在阶段 10 动态后端出现之前即可用；阶段 10 的资格 / kill switch 等动态能力以提供者描述中的可选端点扩展合同，静态提供者只是缺少这些端点。
- [ ] 信任规则：`firstParty` 仅对官方（同源）提供者生效，其他提供者的该字段强制为 false；非官方提供者不得 shadow 出厂插件 id；跨提供者同 id 且 sha256 相同视为镜像、可互相替代，同 id 字节不同视为冲突，官方优先且非官方条目标记为"冲突不可安装"。
- [ ] 非官方提供者的安装路径（2026-09-13 复核定稿）：商店把 artifact 下载到本地后，一律经本地安装路径入库，三档统一为 fetch → sha256 校验 → 容器剥离 → 对应 `parse*Package` 闸门 → 授权 / consent → 持久化到 IndexedDB → 以本地来源加载；不复用远程 URL 直接执行。trusted-js 因此依赖里程碑 4 前置第 3 项落地本地执行来源（`blob:` 或 Service Worker 虚拟路径二选一），该项原备选"trusted-js 安装限于 catalog 内容寻址 URL"与本决策不相容、予以排除；其 consent 使用第三方措辞并标注提供者名，桌面 consent 闸门同样作用。官方同源提供者的 trusted-js 仍可走同源动态 import 与 shadow 路径。
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

每迁移一个功能，都要求旧入口删除、插件禁用后功能消失、重新启用后状态恢复。按 2026-08-28 调序，本阶段即"里程碑 4"，其前置条件见"里程碑 4 前置"。迁出的插件以"插件工具链与内置插件外置"第 2 项的模板落地；存在插件间依赖的功能（如元数据 / Ruby / 分词之间的共享）以"插件间关系"第 1 项的依赖声明表达，不得退回宿主内部直接耦合。

### 本轮迁移范围划定（2026-09-15）

本节是阶段 8 的范围基线。它只划定边界，不代表本轮已经完成插件适配、源码复制或外置仓库创建；后续实现必须先满足里程碑 4 前置的 SDK/安装/工具链条件，再按下表逐项迁移。

#### 纳入迁移的功能

下列功能属于业务能力或可替换 provider，目标是按 trusted-js（需要 React/完整交互）或 extism-wasm（纯逻辑、格式转换）适配为插件；迁移完成后才复制到 `Plugins/<plugin-name>`，每个目录独立初始化 git 仓库。

| 功能组 | 当前代码线索 | 目标插件边界 |
| --- | --- | --- |
| 时间平移 | `builtin.time-shift`（已完成 SDK 适配，作为模板） | 保留 command、表单和单事务文档编辑；后续按外置模板迁出 |
| 元数据编辑 | `src/modules/project/modals/MetadataEditor.tsx`、`src/modules/project/logic` | 元数据读取/编辑、文件名推导；通过 document/project API，不持有宿主 atom |
| Ruby/罗马音 | `src/modules/lyric-editor/tools/RubyEditor.tsx`、`src/modules/segmentation/utils/Transliteration` | Ruby 生成、分配与批量应用；与分词的共享通过插件依赖声明表达 |
| 分词与词级编辑辅助 | `src/modules/segmentation`、`src/modules/lyric-editor/tools/{ReplaceWordDialog,SyllableSmoothingDialog}.tsx` | 纯算法走 wasm；需要交互的编辑器走 trusted-js；统一使用 document-ops |
| 外围辅助工具 | `src/modules/lyric-drag`、非核心批处理/导入辅助对话框 | 仅迁出可由 contribution、command、声明式表单表达的功能；拖拽宿主手势保留，业务变更通过插件命令提交 |
| 帮助、设置和更新扩展 | `src/modules/settings` 中可独立关闭的业务页/工具 | 设置壳、插件管理、权限与恢复入口留在宿主；可替换的业务设置页/更新检查器再插件化 |
| 网络服务与定制功能 | `src/modules/lrclib`、GitHub/歌词站/NCM 等阶段 9 功能 | 通过明确的网络 capability 与离线总开关接入；凭据由宿主持有，插件只经宿主端口操作 |
| 可选格式 provider | 阶段 7 已定义的非 TTML provider 及未来第三方格式 | 复用 `core.formats` registry；TTML 不在此项迁出 |

#### 明确保留在宿主的功能

以下能力是应用稳定性、恢复入口、信任边界或宿主原生实现的一部分，本路线不复制到 `Plugins`，也不以插件禁用为其生命周期条件：

- `core.modes`（包括 fail-safe Edit）、编辑器主视图与行/词渲染、选择/撤销/历史恢复等宿主交互骨架。
- `core.formats` 中的 `hostNative` TTML provider；阶段 7 已登记的 provider registry 入口保留，但 TTML 仍由宿主原生实现。
- 内置主题、主题 token/surface、受保护的权限/插件管理/恢复 UI，以及主题安全校验。
- 音频播放、频谱/时间轴渲染、FFmpeg/音频 worker、键盘与窗口控制等实时宿主设施。
- 文件选择/保存端口、项目打开与自动保存、IndexedDB/平台存储、Tauri/Web 宿主适配和应用启动编排。
- 插件加载器、安装器、catalog/store、consent、崩溃自动禁用、能力授权和 SDK/合同测试基础设施。

#### 暂缓或跳过迁移

- Review 独立模式及其页面壳、FLIP/WAAPI 动画、标题栏动作组留到阶段 9；其中可抽出的 report/filter/operation-log 纯逻辑仍按 application service 先拆边界。
- QuickJS guest SDK、插件间依赖/主题作用域、商店后端与自托管属于路线图中的前置或并行工作项；在相应协议完成前不创建依赖它们的外置插件。
- 任何无法通过 SDK 表达、需要直接访问 Jotai/Tauri/DOM/内部 `TTMLLyric` 的代码，先留在宿主并拆出端口，不以“复制源码”方式绕过边界。

#### 迁出后的统一收尾条件

每个功能在复制到独立 `Plugins/<plugin-name>` 仓库前，必须完成：SDK-only 或声明的 wasm capability 边界检查；宿主旧入口和重复实现删除；禁用/卸载后 contribution、监听器、worker 与存储命名空间全清理；重新启用和重启后状态恢复；工厂副本与商店 artifact 使用同一 sha256；宿主只保留锁定版本与加载适配，不再保留该插件的源码真相。

#### 接口与功能映射

| 功能 | 本轮可用的框架接口 | 业务迁移状态 |
| --- | --- | --- |
| 时间平移 | 既有 SDK commands/menus/form/document-ops | 已 SDK-only，继续作为工厂插件模板 |
| 元数据编辑 | document 投影/metadata ops + 新增只读 `project.getInfo()` | 接口就绪，现有 MetadataEditor 业务实现尚未改写为独立插件 |
| Ruby、罗马音、分词与词级工具 | 既有 ruby/document-ops + 新增 `selection.onChanged`、dialog view 宿主 | 接口就绪，算法与旧工具入口仍在宿主；依赖声明与完整业务迁移另行验收 |
| 帮助、设置扩展 | `settings-view` 接入设置页动态标签；贡献消失时回退常规页 | 插槽就绪；宿主设置壳、权限与恢复入口保留 |
| 网络服务 | trusted-js `network.request/isOffline`、协议 `network.http`、持久化插件网络开关 | 匿名 HTTP 接口就绪；LRCLIB/GitHub/NCM 尚未替换原调用，认证业务端口待实现 |
| 格式 provider、宿主模式 | 既有 `formats.register` / `views.registerMode` 共用 registry | core.formats/core.modes/内置主题仍保留宿主身份，未复制源码 |

实现约束：新增接口不暴露 Jotai、内部 TTMLLyric 或凭据；选择订阅在 host handle dispose 时清理；dialog 按实际 owner 检查，注册消失后自动关闭。网络请求禁携带宿主授权头/cookie，仅允许 HTTPS 和本机 HTTP 开发地址；请求体上限按 UTF-8 字节计算，响应流限制 8 MiB，超时与卸载中断请求，拒绝重定向。离线开关仅拦截经插件端口发起的新请求，不宣称覆盖尚未迁移的宿主网络调用或 trusted-js 自行调用 fetch。WASM 暂无 HTTP bridge，能力协商明确拒绝 `network.http`。

待补验收：接口适配尚未完成浏览器交互冒烟与 Tauri 真机测试；业务迁移后仍须逐项验证禁用、卸载与重启恢复。

后续先收口 SDK 构建边界、React 共享方案、本地安装与外置模板，再逐项迁移上表业务消费者并删除旧入口；通过禁用/重启恢复验收后在独立仓库交付。不得据“接口就绪”勾选阶段 8 全部迁移验收条件。

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

- [ ] 拆分审阅功能：页面壳、FLIP/WAAPI 动画与标题栏动作组留在受信任视图，report/filter/operation-log 格式化等纯逻辑抽为 application service。
- [ ] 将插件事务接入 review operation log（以审阅插件内的 operation log 形态实现，不再依赖定制版宿主）。
- [ ] 为 agents、vocalTags、多语言和 songPart 增加 capability：不作为原生能力提供，而是作为插件接入现有体系，对应修改插件系统的作用范围。
- [ ] 通知中心、设置页扩展和复杂对话框按 trusted-js 插件 contribution 形态承接。
- [ ] 将 GitHub、Review、歌词站和 NCM 功能迁移为外置插件（非必须功能，且涉及版权或数据安全风险，不内置）。

## 阶段 10：插件商店后端（2026-08-27 要求定稿）

两条承重原则：

- 商店的"不分发"不是访问控制：插件代码公开，任何资格用户可见 artifact URL。安全闸门必须在审阅等业务 API 自身的鉴权上；任何业务安全性不得依赖"用户看不到这个插件"。
- trusted-js artifact 必须不可变、内容寻址、仅由 CI 发布、对所有用户字节一致，四个属性共同支撑"同源 = 与主应用等信任"的论证，缺一不可。

- [ ] 身份与资格：复用歌词站账号体系（reviewPermission）；插件在商店侧声明所需资格，清单接口每会话重新校验；资格收回后下一次清单即不返回该插件（对接客户端"资格失效 → scope dispose"）；插件代码不内嵌任何秘密，运行时以用户自身凭据调业务 API。
- [ ] 发布流水线：trusted-js 档只接受 CI 从源码构建发布（2026-09-13：以 PR 中的 commit 引用取代打 tag，见下文"托管形态与发布流水线"），记录 commit hash → artifact hash 溯源；版本不可覆盖重传，下架用 kill switch；发布操作走独立强认证（受限发布账号 + 2FA）并留审计日志；artifact 元数据 schema 预留签名字段。
- [ ] 同源交付：trusted-js artifact 从应用自身 origin 提供，CDN 只能藏在应用 origin 之后回源，不得成为独立脚本 origin；内容寻址 URL + immutable 长缓存；清单接口 no-store/秒级缓存，保证 kill switch 下次刷新即生效。
- [ ] 清单与版本协商：入参 platform/appVersion/pluginApiVersion，按兼容矩阵过滤返回；对 platform=tauri 不返回 trusted-js 条目（运营性过滤，非安全依据）；支持灰度发版与按用户锁版本。
- [ ] 运营控制：插件/版本级 kill switch；发布、资格授予/回收、kill 操作全量审计；客户端崩溃自动禁用机制可选上报，除此之外遥测最小化。
- [ ] artifact 一致性红线：禁止服务端按用户个性化生成代码，同版本对所有用户字节一致；个性化一律走数据 API。
- [ ] 分档差异：第三方 trusted-js 可上架，走 consent + 来源展示（2026-08-27 再校准）；签名档为未来桌面强化项。WASM/主题包货架以客户端校验为边界，后端做托管、元数据、账号实名与上传时复验客户端同款体积上限（主题包已迁 IndexedDB，上限重新定档后两端同步）；两个货架发布通道分离。
- [ ] 可用性：商店不可用不影响编辑器，清单请求失败 = 功能缺席，不进入错误循环。
- [ ] 包容器格式（前端部分已在里程碑 2 实现）：本地手写导入用 base64-JSON（保留设置页粘贴导入体验，维持既有紧上限）；商店分发一律 zip（固定布局、加固解包）。两条路径只是容器剥离前端，汇入同一 `parse*Package` 信任边界；格式识别用 magic bytes；手写 JSON 上架由打包脚本一键转 zip；IndexedDB 落盘统一为 manifest JSON + 二进制 Blob，不存 base64。

### 托管形态与发布流水线（2026-09-13 定稿）

参考过的三种模型：Obsidian 社区插件（[obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)，Git JSON 索引 + 作者自托管 Releases，零服务端但无资格 / kill switch / 审计）、Zed 扩展（[zed-industries/extensions](https://github.com/zed-industries/extensions)，Git 索引 + 官方 CI 构建托管，与本项目红线最契合）、Open VSX（[eclipse-openvsx/openvsx](https://github.com/eclipse-openvsx/openvsx)，完整注册中心服务，对本项目规模过重）。最终采用 Zed 式主体加自有服务器动态层。

- 托管：artifact 分发与数据库由自有服务器与域名托管。服务器对客户端的公开面即"商店提供者抽象"中的官方提供者（清单 + zip artifact）；trusted-js 产物经应用 origin 的反向代理路径下发，内容寻址 + immutable 长缓存，服务器不得成为独立脚本 origin。服务端语言与数据库选型随实现立项时确定，本文档不预设。
- 投稿：以 commit 引用投稿（PR 中登记源码仓库 + commit hash），不接受存档文件。PR 阶段由无凭据 CI（fork 的 `pull_request` 工作流）跑 `parseManifest` / `parse*Package` 闸门、能力清单摘要与 toolkit 合同测试，结果以 bot 评论回帖；运营者依据校验结论审批。审批 = 分支保护 + CODEOWNERS + 必需 reviewer，GitHub review 记录即发布审计日志，不自建。
- CI：GitHub Actions，两个 job 严格分离。构建 job 零 secrets，拉取指定 commit 构建，产出 artifact 与声明（插件 id、版本、sha256、commit hash、workflow run id）；发布 job 在受保护 Environment 下以 OIDC 短期令牌换取推送凭据，只下载并推送 artifact，永不执行投稿代码。
- 构建与上架分离：推送成功的产物入库为"已入库未上架"状态，不进入清单；运营者在真实宿主上测试可用性与功能冲突后，经管理端点上架。构建成功不等于插件可用。
- 服务器接收：校验 sha256 与 CI 声明一致、核对推送方 OIDC 声明（仓库 / 分支 / 工作流名）、拒绝同插件同版本换字节重传，不可变性由服务器强制而非约定。catalog 条目记录 commit hash 与 run id 供溯源，GitHub 构建来源证明为可选增强。
- kill switch：由后端管理端点自主控制（插件级 / 版本级），与 CI 推送弱相关，分钟级生效；清单接口 no-store / 秒级缓存原则不变。
- 资格过滤：不在本次范围，由歌词站账号 SDK 接入后补齐；清单接口预留按账号资格过滤与按用户锁版本的入口，审阅插件上架前必须就位。
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
- [x] 将 trusted-js 标记为未来能力，MVP 不开放给普通第三方插件。（2026-08-27 再校准后已放宽，见"信任模型再校准"。）
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

遗留模块拆分见“迁移准备：收口遗留业务边界”；基础 API 已就绪不代表全部旧 UI/业务模块已拆分。

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

### 审阅功能的受信任插件分发（2026-08-26，部分条款已被再校准取代）

审阅功能是测量驱动的命令式 React UI（FLIP 卡片、DOMRect/WAAPI 动画、标题栏动作组、独立审阅模式），无法在声明式/WASM 档表达，只能以受信任插件承载；其代码已在公开分支上，因此远程分发的收益是发布解耦、包体卫生与权限门控，而非藏代码。该决策是 trusted-js 档的第一个实例。

信任模型（分发方式 / 信任等级 / 使用资格三维正交）：

- 信任锚是代码完整性而非登录态：认证只决定是否下载，完整性决定是否执行。
- Web 端远程分发实现为同源 ES module 动态 import。TLS + 同源 + 服务端鉴权已提供与主应用等同的信道完整性，MVP 不建签名/撤销/包缓存基础设施；CSP 维持 `script-src 'self'`，禁止 fetch+eval。
- 一旦载入即为应用全权（可读全部 atom、PAT、调用宿主能力），与 builtin 无隔离差异；所有防护均作用于"载入之前"，加载闸门必须唯一且可测试。
- 桌面端原定"MVP 禁止 + 编译期物理剔除"，2026-08-27 再校准改为"默认关闭 + 运行时 consent 闸门"（已实现），编译期剔除降级为可选构建选项（未做）。

工作项：

- [x] 远程受信任插件加载器：同源动态 import → 注册进 trusted 等级 scope，scope dispose 全量清理。资格/认证清单接口属"后端实化"里程碑，当前为同源静态清单薄片。
- [x] 单一加载入口 `TrustedJsPluginService.load()`（同源校验 → apiVersion 协商 → 桌面 consent 闸门 → 诚实 consent → 崩溃标记护卫的 import/activate），不存在第二条路径。
- [x] 加载器只接受自身 origin 的模块 URL；清单协议在 schema 层无法表达带 scheme/绝对路径/点段的 entry。
- [x] 故障回退：复用主题系统崩溃标记模式，连续 3 次自动禁用；apiVersion 不匹配直接拒绝。
审阅功能拆分的未完成工作统一列于阶段 9，不强行下沉 WASM。

### 信任模型再校准（2026-08-27 定稿）

背景：本工具用户量不足五位数；内容完整性的真正防线在上游（业务 API 服务端鉴权 + 人工审阅），凭据滥用的防线在 GitHub PAT scope。据此把安全投入按真实威胁模型重新定档：防"高级恶意攻击者"的增量基础设施停止新建；防"善意但有 bug 的插件"的健壮性设施（事务层、Worker 隔离、超时/崩溃自动禁用、单事务撤销）与已建成的沙箱档全部保留。

决策：

- 已建成的 WASM 沙箱档原样保留，定位为"无脑安装"档：坏插件最多自己崩溃，碰不到账号与系统。
- trusted-js 档提前并放宽向第三方开放：准入为"诚实 consent + 来源展示"（作者名/仓库链接，或轻量的社区已知作者名单），不建签名流水线。审阅插件的资格门控保留，定位为运营/资格控制。
- 桌面端 trusted-js 由"MVP 禁止"改为 consent 门控：默认关闭，用户显式同意后启用。
- 用户提示语按三档如实定价（浏览器保护的是系统、不是账号，措辞不得混淆）：
  1. WASM 插件 / 主题：随便装，坏插件最多自己崩溃，碰不到你的账号和系统。
  2. JS 插件（浏览器）：可在本应用内以你的身份行事（读改数据、使用你的登录），但碰不到你的电脑。
  3. JS 插件（桌面）：在 2 之外还可能危害你的系统，请像"安装一个软件"一样对待。
- 缓建清单（插件生态数量证明需求后再评审）：第三方 iframe/webview UI 沙箱面、桌面签名流水线。QuickJS guest SDK 原在此清单，2026-09-13 提前为里程碑 4 前置工作项；路线结论不变：与 PDK 共享同一信任档与协议，属 SDK 增量而非架构变更（方案 A：插件自带解释器，宿主零改动）。
- 两条不随规模松动的红线：
  1. 凭据（PAT/登录态）由宿主持有，不进插件可读存储、不进文档投影；trusted-js 的 consent 文案必须如实包含"该插件可读取你的登录凭据、可以你的身份操作"。
  2. 业务 API 鉴权在服务端、不信任客户端。
- 风险自知：小社区信任集中且脆弱，一次"插件偷 token"事故的损害不按用户数摊薄；上述红线 + 诚实措辞即为此保留的最低纪律。

### 工作顺序调整与定制版分支退役（2026-08-28 定稿）

阶段 0–7 已建成全部底层边界，"不要从插件管理页/应用市场开始"的早期警告前提已失效。为让每个迁移出来的插件都能立即通过真实分发管线做接续测试，当时将阶段 8/9/10 的执行顺序重排如下；当前前置条件与并行关系以文首“后续实现顺序”为准：

1. 远程受信任插件加载器（已完成）。
2. 商店薄片：同源静态清单 + 内容寻址 zip artifact + 商店页面（已完成）。
3. 试点迁移：`builtin.time-shift` 走全链路（已完成）。
4. 批量迁移非核心内置功能（阶段 8 顺序沿用）与定制功能插件化。前置：trusted-js SDK 固化（2026-09-13 新增，见下）。
5. 后端实化（账号资格、kill switch、审计）安排在审阅插件上架前完成。

三条设计修正：

- 出厂副本原则：非核心内置功能迁移为插件后仍随应用打包（factory 版），商店只是更新与增量安装通道（Android 系统应用更新模型：清单版本更高时 shadow 出厂版，卸载更新回退出厂版）。商店不可用 = 没有更新，功能不缺席；桌面端与离线场景不受 trusted-js consent 门控影响；第一方随包插件与主包同信任根，免 consent。
- 清单协议只有一份：trusted-js、WASM 与 theme 三档共用同一清单 schema（入参 platform/appVersion/pluginApiVersion 过滤）。
- API v0 未冻结期间，远程分发插件由 CI 与应用版本联动发布，清单协商过滤不兼容版本。

定制版分支退役：插件系统投入运行后不再维护定制版分支，原定制功能全部以插件形式运行在上游基座上。阶段 9 更名为"定制功能插件化"，删除以双宿主长期并存为前提的工作项（"定制版 EditorHostAdapter"作废）。API v1 冻结条件改为：上游宿主 + 全部原定制功能插件（含审阅、GitHub、歌词站、NCM）通过协议合同测试。

## 里程碑 1：远程受信任插件加载器完成记录（2026-08-28）

- 协议：`RemotePluginCatalogV0` 三档共用，entry 字段在 schema 层只能表达相对路径（禁 scheme/绝对路径/`//`/反斜杠），parser 再拒点段与重复插件 id；含 apiVersion、sha256、platforms（运营过滤，非安全依据）、minAppVersion 与 firstParty。`parseRemotePluginCatalog` 为单一解析入口。
- 内核：`ContributionOwner` 的 trusted-js plugin owner 可 `trusted: true`（仅由加载闸门授予），可注册 mode、trusted view、toolbar/sidebar，同时保留 plugin 身份供来源展示与命名空间强制；extism-wasm owner 恒为 trusted: false。
- 加载器（`src/plugins/trusted/trusted-js-service.ts`，纯逻辑、端口注入）：`load()` 顺序执行 already-loaded/apiVersion/同源解析/桌面闸门/崩溃门/consent 后才 import；`activate(context)` 收 `{ pluginId, entry, scope, host }`，可返回 cleanup；unload = cleanup + scope.dispose。崩溃标记：import 前落 pending，宿主 mount 稳定 5s 后清除并归零；上一会话遗留 pending 计一次崩溃，连续 3 次自动禁用。consent 每插件一次并持久化，拒绝不持久化；firstParty 免 consent。桌面默认拒绝所有远程 trusted-js，须显式打开 `amll-trusted-js-desktop-enabled`。
- 宿主装配（`trusted-js-host.ts`）：`import(/* @vite-ignore */ url)` 同源动态导入；loader 状态存 localStorage（异常护栏，配额失效只降级崩溃记账、不降级信任检查）；启动时 fetch 同源 `plugins/catalog.json`（no-store），缺失/不可达/校验失败静默跳过。
- Consent UI：portal 到 body + `data-amll-protected`，措辞按三档如实定价，展示作者与主页。
- 已知取舍：桌面闸门同样拦截 firstParty 远程条目（桌面第一方随包插件走编译内置）；minAppVersion 客户端未强制（静态薄片由 CI 保证，后端实化时启用）；trusted-js ES module 的 sha256 未在 import 时校验（动态 import 无字节钩子，后端实化时以内容寻址 URL 解决），wasm/theme artifact 已在客户端强制校验。

## 里程碑 2 + 3：商店薄片与试点迁移完成记录（2026-08-28）

- 容器格式（`src/plugins/store/package-container.ts`，fflate）：magic bytes 识别（`PK\x03\x04` vs `{`，不看扩展名）；zip 固定布局 = 根下 manifest.json + assets/<name>；entry 名单由 manifest 派生，解压前按声明尺寸拦截 zip bomb（单 entry ≤33MiB、总量 ≤64MiB、≤64 个 entry），拒绝重复 entry、反斜杠、绝对路径与点段；容器层不做语义校验，剥离后汇入唯一的 `parseFunctionPluginPackage` / `parseThemePackage`。
- 安装管线（`store-install.ts` + `store-host.ts`）：fetch 同源 artifact → sha256 校验（crypto.subtle，内容寻址红线客户端强制） → 容器剥离 → kind/channel 交叉校验 → 既有安装闸门。trusted-js channel 已补充容器解析与可注入安装端口，但真实宿主尚未接线（见里程碑 4 前置第 3 项）。
- Catalog 生成（`scripts/build-plugin-catalog.ts`，已并入 `pnpm build`）：Vite lib 构建 time-shift trusted-js ES module、fflate 打包 sample-tools zip（固定 mtime，字节级可复现）；产物写入 `public/plugins/store/<sha256>.<ext>` 与 `public/plugins/catalog.json`，均 gitignore。
- 试点迁移（time-shift → trusted-js 工厂插件）：`TrustedJsPluginEntry.loadModule` 为 bundled 工厂模块加载器，与主包同信任根，跳过同源解析与桌面闸门（桌面构建不丢失出厂功能），崩溃记账不变；`factory-plugins.ts` 工厂注册表与商店 artifact 构建共用同一插件源文件；旧 `BuiltinPluginHost` 已删除。shadow 决策（`trusted-js-load-plan.ts`）：catalog 同 id + trusted-js + 平台匹配 + semver 严格更高 + 未 pin → 远程 shadow 出厂版并附 fallback；桌面闸门关闭时计划层直接丢弃远程候选。启动顺序：工厂插件先加载 → catalog 到达后按计划换装；远程加载失败自动回退出厂版。pin 持久化在 `amll-trusted-js-factory-pins-v0`。
- 商店页（`PluginStoreDialog.tsx`，独立 modal，"工具"菜单入口，`tool.openPluginStore` 命令，Content 标记 `data-amll-protected`）：目录列表（三档徽章 + 第一方 + 作者来源）、安装/更新/回退出厂版、JS 插件启停、桌面远程 JS 插件 consent 开关、商店不可用提示。catalog fetch 收敛为共享缓存客户端 `catalog-client.ts`。
- 已知取舍：商店 wasm 条目每次更新走完整能力授权弹窗（无差量授权）；theme 货架 zip 路径已实现但 CI catalog 暂未发布主题条目；设置 → 插件页与商店页并存（前者管 WASM 安装/开发模式，后者管分发与 trusted-js），合并留待批量迁移时整理。
