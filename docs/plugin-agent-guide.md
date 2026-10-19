# 插件系统维护指南

状态：当前实现约束

本文供维护插件系统的开发者和编码 Agent 使用。它说明应从哪里确认事实、改动应落在哪一层，以及合并前必须验证什么。插件作者请阅读 [插件开发指南](./plugin-development-guide.md)。

## 1. 权威来源

发生冲突时，按以下顺序判断当前行为：

1. `packages/plugin-api/src/types.ts` 与 `schema/schemas.ts`
2. `packages/plugin-api/src/parsers.ts`、`capabilities.ts`
3. `packages/plugin-sdk-js/src/host.ts`
4. `src/plugins`、`src/kernel`、`src/platform` 的实现与测试
5. 仓库根目录 `PLUGIN.md`、本指南和开发指南

`docs/plugin-protocol-v0.md` 由 `pnpm plugin:api:build` 生成，不入库，不能手改。当前协议为 experimental v0，但破坏性变更仍必须同时更新类型、Schema、parser、合同测试、生成文档和调用方。架构决策与信任边界以仓库根目录 `PLUGIN.md` 为准，不再维护单独的 ADR 文件。

## 2. 分层边界

| 目录 | 职责 |
| --- | --- |
| `packages/plugin-api` | JSON 可表达的公开合同、Schema、解析器、权限规则 |
| `packages/plugin-sdk-js` | trusted-js 强类型 facade、mock 和合同测试 |
| `src/kernel` | 文档事务、命令、贡献点、格式、主题核心与资源所有权 |
| `src/plugins/adapters` | 公开协议与宿主模型之间的转换、端口接线 |
| `src/plugins/trusted` | trusted-js 准入、状态、factory 解析与安装 |
| `src/plugins/store` | catalog、摘要校验、容器解包和安装路由 |
| `src/plugins/ui` | 权限/consent、管理器、表单、视图宿主和诊断 UI |
| `src/platform` | IndexedDB、网络、Blob URL、DOM 样式等环境适配 |

必须保持的边界：

- `plugin-api` 不依赖 React、DOM、Worker、Tauri 或内部歌词类型。
- kernel 不依赖插件 UI 。
- 插件不能直接写 Jotai atom；文档写入最终进入 `EditorDocumentService` 事务。
- 所有跨信任边界输入都先经过 Schema/parser，再进入业务服务。
- 命令、菜单、事件、视图、模式和格式必须归属一个 `ExtensionScope`，卸载时可整体释放。

## 3. 当前运行档

### trusted-js

用于经过准入的全权 ESM。它已正式实现，不得再按“保留值”或“一律拒绝”处理。非 factory 模块必须在 import 前经过来源、禁用/崩溃状态和 consent 检查。SDK host 负责兼容性、命名空间和资源回收，不构成安全隔离。

开发模式与正式 trusted-js 同权，入口与授权文案必须明确可访问应用数据和当前登录态。仅开发包及授权限于会话，数据副作用不会自动撤销。保留 API/manifest 校验、来源展示、scope 清理、热重载失败恢复和正式安装崩溃恢复；不要为开发模式新增一套权限模型。桌面 Blob 与共享 React 验收复用 `tests/plugins/browser/README.md` 的原生 WebView 步骤。

### theme

不执行代码。token、CSS 与资源引用必须通过解析器；主题不能覆盖带 `data-amll-protected` 的权限、插件管理和恢复 UI。应用主题、预览主题、用户 override 和安全模式是不同状态，不要合并写入。

激活集按 global / pluginId 分组，更新 UI 时使用 `activeThemeIds`，旧 `activeThemeId` 仅表示全局主题。同作用域替换与启动恢复冲突必须保留受保护的确认/撤销入口，不能降级为 toast。锚点由宿主视图包装生成，不能包住表单或安全 UI。作用域 token 不得写 `:root` 或 html flag；用户层必须在作用域后代上声明 token，单纯根上的继承无法战胜后代声明。CSS `@scope` 下边界与目标 part 重校验不要删去；旧 WebView 支持需平台实测。

回归集中在 `tests/kernel/theme/scoped-themes.test.ts`：协议负例、多作用域、冲突撤销、启动仲裁、依赖缺失和全量恢复。真实浏览器需额外检查计算样式、受保护对话框、宿主锚点及 portal 表单隔离；临时主题不可加入 factory/catalog 引用。

面向用户的主题或插件冲突提示应直接点名双方，例如“「XX」主题与「YY」主题产生冲突，无法同时使用”，并说明当前使用哪一个、如何恢复。不要用“作用域重合”等技术概念解释操作结果；不同商店的同名插件应同时显示来源，便于区分。

### builtin 与 factory

`builtin` 是宿主核心运行档；factory 是随应用交付的 trusted-js 来源。两者不是同一个维度。当前 `builtin.time-shift` 由外置仓库产生锁定 artifact，构建期校验 SHA-256 并生成 loader；高版本安装包可遮蔽 factory，pin 后回退到随应用副本。

## 4. 改动流程

### 修改公开协议

1. 修改 `plugin-api` 类型与版本常量。
2. 同步 Schema、parser、跨字段约束、capability/permission 映射。
3. 增加 parser、JSON Schema 和 mock host 合同测试。
4. 更新 SDK 与真实宿主实现。
5. 运行 `pnpm plugin:api:build` 生成协议文档和包。
6. 更新开发指南，并检查独立插件/toolkit 是否需要同步。

仅增加 TypeScript 类型是不完整的；跨边界字段如果没有运行时校验，等同于没有合同。

### 增加宿主能力

先判断它属于：公开文档操作、平台端口、contribution，还是 trusted-js 专用能力。安全敏感能力必须有独立 capability、默认拒绝策略、输入上限、取消语义和错误映射。不得把内部对象、凭据、文件句柄或 Tauri API 直接交给插件。

### 增加 contribution

静态声明放入 manifest；动态注册只开放给 trusted-js SDK。注册必须校验 owner 命名空间和冲突，返回 disposable，并由 extension scope 接管。UI 只渲染声明式数据或明确受信任的 React view。

### 修改安装或分发

底层 ZIP/JSON 容器处理应复用同一链路（用户导入入口只接受 ZIP）：容器识别 → 安全解包 → 对应 package parser → 授权/consent → 持久化 → 加载。catalog 中的 trusted-js 裸 ESM 不经过容器，但必须经过 catalog parser、同源解析和唯一的 trusted-js 加载闸门。商店 artifact 还要校验可选 SHA-256 和 catalog/package 身份。不要创建绕过语义校验或加载闸门的“开发快捷路径”。

## 5. 不变量检查

Manifest 与包：

- 功能/主题判别联合保持互斥。
- 插件、command、view、mode、format ID 受命名空间约束。
- ZIP 拒绝路径穿越、重复、未声明文件和解压炸弹。
- 安装持久化回归位于 `tests/plugins/trusted/installed-trusted-js.test.ts`、`trusted-js-state-storage.test.ts`、`tests/kernel/theme/ThemeService.packageStore.test.ts` 和本地导入测试：提交等待、写盘/状态失败、卸载恢复、KV 快照与回滚失败必须覆盖。`node tests/platform/storage/extensions.browser-check.mjs` 使用专用 Chromium profile 验证真实 IndexedDB 事务；可用 `CHROME_EXECUTABLE` 指定浏览器。不得吞掉 KV/localStorage 写入错误，跨 localStorage/IndexedDB 使用补偿并保留回滚失败诊断。
- toolkit 的 `pnpm test` 覆盖开发内联 source map 的模块/源码行映射、编译失败保留旧输出和正式构建不含映射；宿主只为 dev Blob 添加 sourceURL，正式包摘要仍绑定原始代码字节。
- 修改 toolkit ZIP 打包或压缩依赖时运行其 `tests/reproducibility.test.mjs`；固定摘要基线覆盖 Unicode 排序、语言/时区、文件 mtime、trusted-js/theme 与 catalog 一致性。保留三平台 CI，摘要变化必须审阅原因，不自动更新基线。此合同要求相同输入字节和锁定依赖。
- trusted-js 入口只接受单文件 ESM；代码和表单 payload 有明确上限。

文档与生命周期：

- 编辑按稳定 ID 定位，失败不部分提交。
- 跨异步边界使用 revision 冲突保护。
- 插件自身产生的文档事件不能形成回灌循环。
- 禁用保留包与 KV；卸载删除包、授权/consent、状态和 KV。
- 停用先阻止新调用并取消在途工作，再 cleanup/dispose，最后关闭 runtime。

安全与 UI：

- trusted-js consent 在执行任何插件代码之前完成，内容变化重新 consent。
- 主题和插件内容不能覆盖受保护恢复入口。
- 网络端口不带凭据，遵守离线开关、URL/头部规则、大小上限和取消。

## 6. 验证矩阵

最小命令：

```sh
pnpm plugin:api:check
pnpm plugin:sdk:check
pnpm lint:boundaries
pnpm test
pnpm build
```

`pnpm lint:boundaries` 使用 dependency-cruiser 校验依赖方向，再由 Biome 的路径 overrides 检查宿主全局与受限导入，最后运行不足 100 行的 AST 菜单/文档写入检查。修改这些规则时另跑 `pnpm lint:boundaries:test`：该命令创建并清理临时负例，验证跨层别名/相对导入、state 层 fetch、内联菜单回调、Worker 资源、纯算法与 SDK React 类型边界。不得以跳过 dependency-cruiser 的局部检查替代完整验收。

协议验证还必须证明类型、JSON Schema 与 parser 对相同样例得出一致结论；parser 覆盖命名空间、跨字段、包载荷和恶意输入；`MockTrustedJsHost` 与真实宿主运行同一合同测试。生成器检查提交中没有协议文档漂移，行为测试覆盖原子性、revision 冲突、权限、限额、取消和卸载。

按改动范围补充：

- API/Schema：`tests/plugin-api/**`
- trusted-js SDK/真实宿主：`tests/plugin-sdk-js/**`、`tests/plugins/trusted/**`
- 包、catalog、安装：`tests/plugins/store/**`、`tests/plugins/adapters/**`
- 主题：`tests/kernel/theme/**`、`tests/plugins/builtin/themes/**`
- contribution/UI model：`tests/kernel/extensions/**`、`tests/plugins/ui/**`

涉及 WebView、Worker、文件选择、IndexedDB、PWA 或 Tauri 时，自动化测试不能替代真机冒烟。验收步骤见 [插件验收清单](./plugin-acceptance-checklist.md)。

## 7. 交付说明

提交说明至少写清：

- 改动的公开合同及兼容性影响
- 影响的运行档、来源与持久化数据
- 新增或改变的安全边界
- 已运行的自动化与人工验证
- 未完成的跨平台验证或已知风险

不要用“协议中已有字段”代表功能已接通，也不要用单个 mock 测试代表真实宿主、持久化和卸载路径已经完成。

## 统一管理入口

首选项中的插件管理子页复用设置 Dialog.Content，保留 `data-amll-protected` 和 body portal；返回导航恢复原设置页。工具菜单不再提供商店入口。管理列表只订阅 `pluginInstallationService`，功能与主题 runtime 状态保留在 installation 附加字段，不在 UI 分别订阅两个 service。主题包安装、更新与卸载在管理器完成；主题设置继续负责预览、应用、恢复默认和用户 override。

边界完整负例与合法对照由 `pnpm lint:boundaries:test` 在临时项目快照运行，保持真实配置和路径，不修改源码目录；桌面构建 quality job 必须运行该检查。

## 局部覆盖协议维护与验收

manifest、payload Schema 与包语义门禁位于 plugin-api；JSON/ZIP 使用同一个 resources 合同。新增字段必须保持只允许 LocalizedText 与白名单图标的边界，不能用通用对象 merge 实现。未知 key 由 resolveOverridePayload 过滤并返回 diagnostics，后续运行时必须记录覆盖方与目标身份；目标缺失不在安装时伪造白名单。

合同测试：`tests/plugin-api/overrides.test.ts` 覆盖依赖、路径、HTML/大小/语言数、图标白名单、未知及禁止字段与嵌套表单；`tests/plugins/store/package-container.test.ts` 覆盖 ZIP 资源；`tests/plugins/trusted/installed-trusted-js.test.ts` 覆盖存储恢复、资源篡改摘要与运行时字符串表；`tests/plugin-api/strings.test.ts` 覆盖字符串表合并、default/locale 规则与 `/strings/<key>` 地址；`i18n` 在 mock（`tests/plugin-sdk-js`）与真实宿主（`trusted-js-host-api.test.ts`）各有一条。字符串表与覆盖共用 `resources`，修改上限需同步 `packageResources` 的 maxProperties。修改时运行这些测试、plugin-api/store 测试、API/宿主类型检查和边界 lint。后续验收还需覆盖真实 UI 即时回退、目标禁用/缺失、冲突提醒与日志，当前协议通过不能代表这些功能完成。
