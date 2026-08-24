# Plugin Work Agent Guide

这份指南面向实现插件、宿主 adapter、runtime 或协议迁移的 agent。它不是产品文档，而是一组必须可验证的工程约束。

## 1. 权威来源和优先级

按以下顺序理解任务：

1. `packages/plugin-api/src/types.ts`：公开 TypeScript 字段和联合类型。
2. `packages/plugin-api/src/schema/schemas.ts`：运行时结构校验的权威来源。
3. `packages/plugin-api/src/parsers.ts`、`permissions.ts`：跨字段规则和 capability 规则。
4. `docs/adr/0001-plugin-architecture.md`、`0002-protocol-v0-contract.md`、`0003-kernel-command-contribution.md`：架构决策。
5. `docs/plugin-development-guide.md`：给人的使用说明。

如果文档与实现不一致，先修正实现/Schema/测试，再重新生成 `docs/plugin-protocol-v0.md`；不要只修改生成文件。

## 2. 不可违反的边界

- `packages/plugin-api` 不得导入 React、Jotai、Tauri、DOM、Worker 或内部 `TTMLLyric`。
- `src/kernel` 不得反向导入 UI、插件 runtime、adapter、React、Jotai 或 Tauri。
- `src/application` 只能依赖自身、kernel/platform 接口和 plugin-api；React hook 只能做绑定、交互和错误展示。
- 文档写入只能经 `EditorDocumentService`；禁止直接写 `lyricLinesAtom`。
- 插件只看到 `PluginDocumentV0`，不能拿到宿主内部对象；未知内部字段必须由 adapter 保留。
- 行/词/选区/事件一律用稳定 ID，不使用数组索引作为协议定位。
- 一个插件调用对应一个事务/撤销记录；异步写入必须携带 `expectedRevision`。
- capability 必须完整匹配；禁止前缀通配。定制 capability 使用 `extensions.<reverse-domain>.<name>`。
- 未经授权不得扩展宿主调用、文件、网络、DOM 或 Tauri 能力。

## 3. 接单后的工作流

### Step 1：判断任务属于哪一层

先标记改动层：`plugin-api`、`kernel`、`application`、`adapter`、`runtime`、`builtin` 或 `ui`。如果一个小需求同时跨三层，先拆成协议、宿主适配和 UI 三个可测试提交。

### Step 2：先写合同

新增字段或方法时依次完成：

1. 更新 `types.ts` 的公开类型和版本说明。
2. 更新 `schema/schemas.ts`。
3. 更新 parser 的跨字段检查和 permission map。
4. 增加正例、反例和错误码测试。
5. 更新人工手册和生成协议文档。

不要先在 React 组件里写一个只对当前宿主有效的对象，然后再“补类型”。

### Step 3：实现 host-agnostic 业务

将可复用算法放在 `src/application/<feature>`，输入使用稳定 ID 或公开协议类型，输出使用事务服务/明确结果。不要在 service 中读取 atom、调用 hook、创建 toast 或访问 DOM。

### Step 4：接入宿主

adapter 负责内部 TTMLLyric 与公开投影转换、字段保留、ID 合并和事务提交；runtime 负责序列化、调用 ID、权限、超时、取消和崩溃恢复；UI 只负责状态、表单和错误展示。

### Step 5：验证

最小验证集：

```sh
node scripts/check-editor-boundary.mjs
pnpm exec tsc -b --pretty false
pnpm test
pnpm plugin:api:check
```

涉及前端构建时再运行 `pnpm build`。不要因为本地已有 `node_modules` 就跳过锁文件一致性；依赖状态异常时使用 `pnpm install --frozen-lockfile`。

## 4. 协议实现检查表

### Manifest

- `kind` 只能是 `function` 或 `theme`。
- function 必须有 `apiVersion: 0`、合法 semver、内部/包内 entry、capability 列表。
- theme 必须有 `themeApiVersion: 0`、`runtime: "none"`、tokens 相对路径。
- `trusted-js` 在 MVP 必须拒绝。
- contribution command/settings ID 必须以 plugin ID 加点号开头。

### 文档编辑

- 读取先保存 `revision`。
- 编辑前检查 `expectedRevision`。
- 所有 op 按 ID 合并；多 op 原子提交。
- ruby 操作同时需要 `lyrics.core` 和 `lyrics.ruby`。
- 失败不得部分修改；冲突不得自动覆盖用户新修改。
- undo/redo 和 `document.changed` 事件必须保持来源与 revision 可观察。

### RPC 和错误

- 先验证 envelope，再按 method 验证 params，再检查 capability。
- 返回值必须是 JSON；禁止 `undefined`、函数、类实例和宿主引用。
- 错误使用现有 `PluginErrorCode`，不要让 guest 异常直接穿透到 UI。
- `ui.notify` 纯文本；表单不解释 HTML；存储按插件隔离。

### 主题

- token 是声明式数据，不执行代码。
- 校验 tokenVersion、颜色、长度和背景值。
- 拒绝 `url()`、远程引用、`expression()`、不受控 `var()` 和 `@import`。
- 预览失败必须可恢复到默认主题，安全 UI 不得依赖主题 CSS。

## 5. 当前范围和明确非目标

当前 v0 已定义并测试：manifest、document projection、document ops、events、errors、permissions、forms、theme tokens、Mock Host contract tests，以及时间平移 application service。

当前不应假设已经完成：

- 完整 command registry 与 React 菜单渲染。
- 第三方插件注入 React view、任意 HTML 或 CSS。
- 插件市场、远程安装、自动更新。
- 所有导入导出、分词、文件格式业务的 application service 迁移。
- 上游版和定制版共同的 API v1 冻结。

需要新增能力时，先在 `goal.md` 和 ADR 中确认阶段归属，不要把阶段 4–9 的工作偷偷塞进 v0 协议。

## 6. 交付说明模板

完成任务时报告：

```text
范围：修改了哪些层、哪些公开字段/能力。
合同：新增或变更了哪些 type、Schema、错误和版本。
行为：事务、revision、撤销、权限和失败回滚如何保证。
测试：运行的命令及结果；未通过项必须说明是否为既有问题。
文档：人工手册、生成协议、ADR 或 goal.md 是否同步。
未完成：明确列出没有实现的宿主/UI/runtime 部分。
```

不要用“已支持插件”这种笼统表述掩盖只完成类型定义或 mock 的事实；交付状态必须区分协议、宿主实现和 UI 接入。
