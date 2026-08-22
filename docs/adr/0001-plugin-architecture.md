# ADR 0001：插件架构、信任边界与 MVP 范围

- 状态：已接受（experimental）
- 日期：2026-08-19
- 关联：`goal.md`、[ADR 0002](./0002-protocol-v0-contract.md)、`PLUGIN.md`

## 背景

AMLL TTML Tool 的功能持续增长，编辑器、时轴、频谱、音频、分词、音译、元数据、文件导入导出等能力
全部堆在同一层，UI 组件直接读写全局 `lyricLinesAtom`。这带来三个问题：

1. 任何功能都可能绕过撤销重做语义，静默破坏用户数据。
2. 定制版（下游 fork）与上游主线难以共存，每次同步都要处理大范围冲突。
3. 无法在不臃肿主程序的前提下满足歌词制作者的长尾定制需求。

因此需要先划定内核边界，再引入插件系统。

## 决策

### D1：内核保留的能力

以下能力**不**插件化，永久属于内核（kernel）：

- 歌词文档模型、事务、revision、撤销重做（`src/kernel/editor`）
- 时间轴与打轴交互
- 预览（AMLL 渲染）
- 频谱图与波形
- 音频引擎、解码、播放、渲染

理由：这些能力对延迟、内存和渲染同步有硬要求，跨 WASM 边界传输代价过高，且是产品的核心身份。

### D2：三类插件运行方式

| kind          | 载体                    | 信任级别 | MVP |
| ------------- | ----------------------- | -------- | --- |
| `builtin`     | 随主程序打包的 TS/React | 受信任   | 是  |
| `extism-wasm` | 独立 Worker 中的 WASM   | 不受信任 | 是  |
| `theme`       | 声明式 token + 受限 CSS | 不执行   | 是  |

`theme` 类插件不含可执行代码，因此运行方式记为 `none`。

### D3：`trusted-js` 是未来能力

不在 MVP 中对普通第三方插件开放任意 JS/React 注入。`trusted-js` 作为保留的 manifest 取值存在，
但宿主在 MVP 阶段一律拒绝加载，只有 `builtin` 可以注册受信任的 React view contribution。

理由：一旦开放任意 JS，权限系统、主题安全区域和崩溃隔离全部失效。

### D4：主题包与功能包互斥

一个插件包只能是 `FunctionPluginManifest` 或 `ThemePluginManifest` 之一。需要"带主题的功能插件"时，
发布两个插件包。

理由：主题只需要读取 token 与注入受限 CSS，不需要任何文档权限；混合会迫使主题包获得过大权限，
也让"损坏的主题不能隐藏安全 UI"这一保证无法审计。

### D5：API 为 experimental v0，不冻结

`apiVersion` 从 `0` 开始，允许破坏性变更。只有在上游版与定制版都通过同一份协议契约测试之后，
才发布 v1 并冻结。宿主对未知 `apiVersion` 一律拒绝加载而不是尽力兼容。

### D6：目标目录结构

```
packages/plugin-api/     # 稳定、与宿主实现无关的公开协议（无 React/Jotai/Tauri/TTMLLyric 依赖）
src/kernel/
  editor/                # 文档事务、revision、撤销重做
  commands/              # 命令注册与执行
  extensions/            # contribution、事件、生命周期
  platform/              # 文件、剪贴板、存储、URL 等能力
  theme/                 # 主题解析、校验、应用
src/plugins/
  runtime/               # Extism、Worker、权限和隔离
  builtin/               # 官方 TypeScript/React 插件
  adapters/              # 上游版和定制版宿主适配
  ui/                    # 插件管理器、菜单、表单
```

`packages/plugin-api` 通过 `tsconfig` paths 与 Vite alias 引入（`@amll-ttml-tool/plugin-api`），
暂不注册为 pnpm workspace 成员，以免强制重建现有 `node_modules`；这一步可在任意时机单独完成。

### D7：插件只看到公开文档投影

插件永远不会拿到宿主内部的 `TTMLLyric`。宿主在 adapter 层把内部文档投影成 `PluginDocumentV0`，
写回时按 ID 合并，**保留投影中不存在的内部字段**（如 `endTimeLink`、`obscene`、`romanWarning`
以及定制版的 `agents`、`vocalTags`、`songPart` 等）。

行与单词使用已有的稳定 `id`。协议中的事件、选区和补丁一律以 ID 定位，不使用数组索引。

### D8：事务层是唯一写入路径

`lyricLinesAtom` 降级为内核内部实现细节。所有写入（用户操作与插件操作）必须经由
`EditorDocumentService.transact()`。一次插件调用只产生一个撤销记录。异步写入必须携带
`expectedRevision`，冲突时拒绝而不是覆盖用户的新修改。

通过 import boundary 约束（`biome` + 目录约定）阻止新增代码直接引用 `lyricLinesAtom`。

### D9：MVP capability 清单

`lyrics.core`、`lyrics.ruby`、`ui.notify`、`ui.form`、`storage.kv`。

为定制版预留 `extensions` 命名空间与可协商 capability，但不允许无约束覆盖内部对象。

## 非目标（MVP 不做）

- 插件市场、远程安装、自动更新、评分
- 插件注入任意 HTML / React / CSS 选择器
- 插件直接访问 DOM、网络、文件系统或 Tauri API
- 插件访问音频 PCM、频谱数据、渲染管线
- 冻结 v1 协议

## 后果

- 迁移期成本集中在阶段 2：38 个文件、100+ 处直写点需要改为事务调用。
- 收益：撤销重做语义统一可测；插件与定制版共用同一条写入路径；协议可在不启动 React 的
  Mock Host 中做契约测试。
- 风险：Extism 在 Tauri WebKit（Linux/macOS）上的可用性尚未在真机验证，见
  `docs/plugin-runtime-poc.md` 的验收清单。若不可用，需在大规模迁移前更换运行时方案，
  而 `PluginRuntime` 接口的存在正是为了让替换只影响 `src/plugins/runtime`。
