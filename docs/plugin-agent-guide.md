# 插件系统维护指南

状态：当前实现约束

最后核对：2026-09-21

本文供维护插件系统的开发者和编码 Agent 使用。它说明应从哪里确认事实、改动应落在哪一层，以及合并前必须验证什么。插件作者请阅读 [插件开发指南](./plugin-development-guide.md)。

## 1. 权威来源

发生冲突时，按以下顺序判断当前行为：

1. `packages/plugin-api/src/types.ts` 与 `schema/schemas.ts`
2. `packages/plugin-api/src/parsers.ts`、`permissions.ts`、`capabilities.ts`
3. `packages/plugin-sdk-js/src/host.ts`
4. `src/plugins`、`src/kernel`、`src/platform` 的实现与测试
5. [插件系统模型](./plugin-system-model.md)、本指南和开发指南

`plugin-protocol-v0.md` 由 `scripts/gen-plugin-docs.ts` 生成，不能手改。当前协议为 experimental v0，但破坏性变更仍必须同时更新类型、Schema、parser、合同测试、生成文档和调用方。

## 2. 分层边界

| 目录 | 职责 |
| --- | --- |
| `packages/plugin-api` | JSON 可表达的公开合同、Schema、解析器、权限规则 |
| `packages/plugin-sdk-js` | trusted-js 强类型 facade、mock 和合同测试 |
| `src/kernel` | 文档事务、命令、贡献点、格式、主题核心与资源所有权 |
| `src/plugins/runtime` | Worker、Extism、超时、取消、载荷限制和 RPC |
| `src/plugins/adapters` | 公开协议与宿主模型之间的转换、端口接线 |
| `src/plugins/trusted` | trusted-js 准入、状态、factory 解析与安装 |
| `src/plugins/store` | catalog、摘要校验、容器解包和安装路由 |
| `src/plugins/ui` | 权限/consent、管理器、表单、视图宿主和诊断 UI |
| `src/platform` | IndexedDB、网络、Blob URL、DOM 样式等环境适配 |

必须保持的边界：

- `plugin-api` 不依赖 React、DOM、Worker、Tauri 或内部歌词类型。
- kernel 不依赖插件 UI 或 Extism。
- 插件不能直接写 Jotai atom；文档写入最终进入 `EditorDocumentService` 事务。
- Extism 依赖只允许出现在 `src/plugins/runtime`。
- 所有跨信任边界输入都先经过 Schema/parser，再进入业务服务。
- 命令、菜单、事件、视图、模式和格式必须归属一个 `ExtensionScope`，卸载时可整体释放。

## 3. 当前运行档

### extism-wasm

用于不可信代码。每个插件有独立 Worker、串行回合队列、能力检查、配额、超时和崩溃隔离。WASM 不获得 `network.http`，也不能访问 DOM、文件或 Tauri。一个回合内的编辑合并为一个事务，KV 在回合成功后提交。表单使用 `showForm` outcome 与 `plugin_resume_form` 续体。

### trusted-js

用于经过准入的全权 ESM。它已正式实现，不得再按“保留值”或“一律拒绝”处理。非 factory 模块必须在 import 前经过来源、桌面开关、禁用/崩溃状态和 consent 检查。SDK host 负责兼容性、命名空间和资源回收，不构成安全隔离。

### theme

不执行代码。token、CSS 与资源引用必须通过解析器；主题不能覆盖带 `data-amll-protected` 的权限、插件管理和恢复 UI。应用主题、预览主题、用户 override 和安全模式是不同状态，不要合并写入。

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

所有 ZIP/JSON 入口应复用同一链路：容器识别 → 安全解包 → 对应 package parser → 授权/consent → 持久化 → 加载。catalog 中的 trusted-js 裸 ESM 不经过容器，但必须经过 catalog parser、同源解析和唯一的 trusted-js 加载闸门。商店 artifact 还要校验可选 SHA-256 和 catalog/package 身份。不要创建绕过语义校验或加载闸门的“开发快捷路径”。

## 5. 不变量检查

Manifest 与包：

- 功能/主题判别联合保持互斥。
- 插件、command、view、mode、format ID 受命名空间约束。
- ZIP 拒绝路径穿越、重复、未声明文件和解压炸弹。
- trusted-js 入口只接受单文件 ESM；WASM 字节和 JSON payload 有明确上限。

文档与生命周期：

- 编辑按稳定 ID 定位，失败不部分提交。
- 跨异步边界使用 revision 冲突保护。
- 插件自身产生的文档事件不能形成回灌循环。
- 禁用保留包与 KV；卸载删除包、授权/consent、状态和 KV。
- 停用先阻止新调用并取消在途工作，再 cleanup/dispose，最后关闭 runtime。

安全与 UI：

- WASM 每次 host call 都校验 capability。
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

按改动范围补充：

- API/Schema：`tests/plugin-api/**`
- trusted-js SDK/真实宿主：`tests/plugin-sdk-js/**`、`tests/plugins/trusted/**`
- WASM 回合与 Worker：`tests/plugins/runtime/**`
- 包、catalog、安装：`tests/plugins/store/**`、`tests/plugins/adapters/**`
- 主题：`tests/kernel/theme/**`、`tests/plugins/builtin/themes/**`
- contribution/UI model：`tests/kernel/extensions/**`、`tests/plugins/ui/**`

涉及 WebView、Worker、文件选择、IndexedDB、PWA 或 Tauri 时，自动化测试不能替代真机冒烟。运行时检查见 [运行时验证](./plugin-runtime-poc.md)，安装检查见 [安装与更新验证](./plugin-local-install-validation.md)。

## 7. 交付说明

提交说明至少写清：

- 改动的公开合同及兼容性影响
- 影响的运行档、来源与持久化数据
- 新增或改变的安全边界
- 已运行的自动化与人工验证
- 未完成的跨平台验证或已知风险

不要用“协议中已有字段”代表功能已接通，也不要用单个 mock 测试代表真实宿主、持久化和卸载路径已经完成。
