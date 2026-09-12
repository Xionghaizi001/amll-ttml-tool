# AMLL TTML Tool 插件化路线图

清单按依赖顺序排列。核心原则：先建立内核边界和稳定协议，再接 Extism；先迁移一个完整功能闭环，再批量插件化。各阶段的"完成记录"只保留仍在约束后续工作的决策、不变量与已知取舍；测试数量、lint 基线等验证数据以 CI 为准，不再在本文档记录。

## 进度总览（2026-09-13）

- 阶段 0–7 已完成：架构决策、运行时 PoC、编辑器事务层、公开 Plugin API、命令与 contribution registry、主题系统、WASM 插件宿主、文件与格式 provider。
- 2026-08-28 调序后的里程碑 1（远程受信任插件加载器）、里程碑 2（商店薄片）、里程碑 3（time-shift 试点迁移）已完成。
- 当前位置：里程碑 4（批量迁移非核心内置功能）之前。本轮新增"里程碑 4 前置：trusted-js SDK 固化与开发者体验"，见下文。
- 尚未完成：阶段 3 遗留的 UI/业务混合模块拆分；阶段 8 批量迁移；阶段 9 定制功能插件化；阶段 10 商店后端。

## 已知问题（需人工决策）

- 测试文件从未入库：`.gitignore` 第 20–21 行的 `*.test.ts` / `*.spec.ts` 自阶段 1 提交 `9ccef5a1` 起就存在，工作区现有 51 个测试文件全部被 git 忽略。历次完成记录中"N/N 测试通过"对应的套件因此都不在分支提交里，干净检出上 CI 的 `pnpm test` 无测试可跑（2026-08-28 记录中"推测遗留在另一工作区未提交"属误判）。需决定：移除这两行并补提交全部测试，或确认有意不入库并调整 CI 断言。

## 目标结构

```
packages/plugin-api/          # 稳定、与宿主实现无关的公开协议
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
```

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
- [ ] 将 Jotai、React、Tauri、DOM 和 Worker 依赖收敛到 adapters/ui/runtime；业务层不得反向导入这些实现。
  - [x] `kernel`、`application`、`plugin-api` 层已禁止反向导入并由 lint 检查。
  - [ ] 继续拆分 `src/modules` 中混合 UI/业务的遗留模块，优先级依次为：`sync-keybinding.tsx`（整套打轴判定/智能首末词/空拍状态机，建议抽出 `SyncTimingService`）、`lyric-line-view.tsx`（endTimeLink 联动规则）、`lyric-word-menu.tsx`（词拆分/合并/增删事务构造）、`useLyricListDrag.ts`（指针几何/自动滚动）、`useTopMenuActions.ts` 的 `onSyncLineTimestamps` 与 `buildRubySegments`、`lyric-line-menu.tsx` 的行合并时间重排；`ttml-processor/index.ts` 直接读取 `globalStore` 取生成配置，建议改为注入。
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

验收条件（2026-08-25 审计通过）：Mock Host 中可以运行插件合同测试，不需要启动 React 应用；至少一个完整功能可在不渲染 React 的情况下通过 application service 执行、产生统一文档事务并撤销；业务层无 React/Jotai/Tauri/DOM 直接依赖。

### 阶段 3 完成记录：分层检查规则

`scripts/check-editor-boundary.mjs`（`pnpm lint:boundaries`，CI 执行）现行规则，后续新增模块须遵守：

- 相对导入按解析后的真实目标校验，不能以 `../../modules/...` 绕过 application/kernel 边界。
- 宿主全局补查小写 `document`、`window`、`localStorage`、`fetch` 等。
- 遍历 `packages/plugin-api/tests/`；`src/platform` 与 `src/plugins`（runtime、adapters、ui、trusted、store 与根目录）有正向依赖白名单。
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

## 阶段 8：批量迁移外围功能

推荐顺序：

1. 外围辅助工具。
2. 元数据、Ruby、分词。
3. 帮助、设置和更新。
4. 文件与格式支持。
5. 网络服务（开放相应接口；提供"离线模式"一键禁用其相关全部功能）、GitHub（内置）等定制功能。Review 另行处理，本阶段跳过。

每迁移一个功能，都要求旧入口删除、插件禁用后功能消失、重新启用后状态恢复。按 2026-08-28 调序，本阶段即"里程碑 4"，其前置条件见"里程碑 4 前置"。

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
- [ ] 审阅功能拆分随迁：页面壳/动画/标题栏动作组留在受信任视图内；report-service、filter-service、operation-log 格式化等纯逻辑按 application service 既有模式拆干净，不强行下沉 WASM。（归阶段 9。）

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

阶段 0–7 已建成全部底层边界，"不要从插件管理页/应用市场开始"的早期警告前提已失效。为让每个迁移出来的插件都能立即通过真实分发管线做接续测试，阶段 8/9/10 的执行顺序重排为（工作项与验收条件不变）：

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
- 安装管线（`store-install.ts` + `store-host.ts`）：fetch 同源 artifact → sha256 校验（crypto.subtle，内容寻址红线客户端强制） → 容器剥离 → kind/channel 交叉校验 → 既有安装闸门。trusted-js channel 目前不走 artifact 路径（见里程碑 4 前置第 3 项）。
- Catalog 生成（`scripts/build-plugin-catalog.ts`，已并入 `pnpm build`）：Vite lib 构建 time-shift trusted-js ES module、fflate 打包 sample-tools zip（固定 mtime，字节级可复现）；产物写入 `public/plugins/store/<sha256>.<ext>` 与 `public/plugins/catalog.json`，均 gitignore。
- 试点迁移（time-shift → trusted-js 工厂插件）：`TrustedJsPluginEntry.loadModule` 为 bundled 工厂模块加载器，与主包同信任根，跳过同源解析与桌面闸门（桌面构建不丢失出厂功能），崩溃记账不变；`factory-plugins.ts` 工厂注册表与商店 artifact 构建共用同一插件源文件；旧 `BuiltinPluginHost` 已删除。shadow 决策（`trusted-js-load-plan.ts`）：catalog 同 id + trusted-js + 平台匹配 + semver 严格更高 + 未 pin → 远程 shadow 出厂版并附 fallback；桌面闸门关闭时计划层直接丢弃远程候选。启动顺序：工厂插件先加载 → catalog 到达后按计划换装；远程加载失败自动回退出厂版。pin 持久化在 `amll-trusted-js-factory-pins-v0`。
- 商店页（`PluginStoreDialog.tsx`，独立 modal，"工具"菜单入口，`tool.openPluginStore` 命令，Content 标记 `data-amll-protected`）：目录列表（三档徽章 + 第一方 + 作者来源）、安装/更新/回退出厂版、JS 插件启停、桌面远程 JS 插件 consent 开关、商店不可用提示。catalog fetch 收敛为共享缓存客户端 `catalog-client.ts`。
- 已知取舍：商店 wasm 条目每次更新走完整能力授权弹窗（无差量授权）；theme 货架 zip 路径已实现但 CI catalog 暂未发布主题条目；设置 → 插件页与商店页并存（前者管 WASM 安装/开发模式，后者管分发与 trusted-js），合并留待批量迁移时整理。

## 里程碑 4 前置：trusted-js SDK 固化与开发者体验（2026-09-13 规划）

动机：当前 trusted-js 插件的宿主 API（`TrustedJsHostApi`）直接暴露 `EditorDocumentAtomAdapter`（返回内部 `TTMLLyric`）、`ExtensionScope` 等宿主内部类型；`builtin.time-shift` 的插件模块从 `$/plugins/trusted/*`、`$/kernel/extensions`、`$/application/time-shift`、`$/types/ttml` 导入。这与阶段 3 "plugin-api 与宿主实现无关"的原则冲突，使商店分发的 trusted-js artifact 与宿主内部结构版本耦合（宿主重构即破坏远程插件），也让 API v1 冻结条件无法对 trusted-js 档求值。里程碑 4 会以这种形态制造十余个插件，因此必须先固化 SDK。下列五项按工程优先级排列：1 → 2 为里程碑 4 的硬前置；3 可与迁移并行；4 独立于 trusted-js 线，可并行；5 贯穿全程，在审阅插件上架前收口。

### 1. 封装 trusted-js API

- [ ] 分包：`packages/plugin-api` 继续只放与运行档无关的协议类型；新增 `packages/plugin-sdk-js`（trusted-js 运行时 SDK），允许 React 类型（仅类型，peer），仍禁止 Jotai/Tauri/内部 TTMLLyric。边界脚本为新包加正向白名单。
- [ ] 定义 `TrustedJsHostV0` 公开接口：`document`（`readSnapshot()` 返回 `PluginDocumentV0` 投影而非 TTMLLyric、`applyEdit(ops: DocumentOpV0[], label)` 走同一 `document-ops`、`revision`、`onChanged` 订阅）；`selection`（选中行/词 id）；`commands`/`menus`/`titleBarActions` 注册（薄封装 ExtensionScope，`pluginId.` 命名空间强制不变）；`ui.showForm`/`ui.notify`；`storage.kv`（复用 `amll-plugin-kv` 命名空间隔离）；`formats.register`（同一 provider registry）；trusted 专属 `views`（mode/trusted view/titlebar group，React 组件入参）。
- [ ] 宿主侧：`trusted-js-host.ts` 由裸 adapter 改为实现 `TrustedJsHostV0`，文档访问经 `PluginDocumentGateway` 投影/合并（与 WASM 回合宿主共用 document-ops 与 revision 冲突逻辑），使两档对文档的语义一致：单事务、来源标记、内部字段原位保留。
- [ ] activation 合同：`activate(ctx: { pluginId, host, signal })` 返回 cleanup；`signal` 在 unload/崩溃禁用时 abort，覆盖"异步 handler 在途取消"的遗留取舍。
- [ ] 合同测试：`runHostContractTests` 增加 trusted-js host 第三个实现（Mock + 真实宿主）；边界脚本新增规则：`src/plugins/builtin/<plugin>/**` 插件模块与 `examples/` 只能导入 `@amll-ttml-tool/plugin-api` 与 `@amll-ttml-tool/plugin-sdk-js`，不得导入 `$/kernel`、`$/application`、`$/states`、`$/plugins/adapters`。
- 验收：SDK 包可在不含宿主源码的独立项目里编译；同一插件源在 Node 中以 Mock trusted host 完成命令 → 表单 → 单事务 → 撤销。

### 2. 内置插件改用 SDK

- [ ] `builtin.time-shift`：移除对宿主内部路径的全部导入，只依赖 SDK；`shiftLyricTimes` 纯算法随插件打包（或由 SDK utils 提供），商店 artifact 不再隐式依赖宿主内部。
- [ ] 划定不迁 SDK 的宿主核心：`core.modes`（fail-safe Edit）、`core.formats`（hostNative TTML）、内置主题。它们保持 builtin 直接注册，但 provider/mode 注册走的 registry 入口须与 SDK 的 `formats.register`/`views.registerMode` 相同，避免两套路径。
- [ ] catalog 构建脚本对 trusted-js 产物断言：无 `$/` 别名残留、外部依赖只允许 SDK 与 React（经 import map 或打包内联，二选一定稿）。
- [ ] 里程碑 4 迁出的每个插件都以 SDK 为唯一依赖，本项作为其模板。
- 验收：边界脚本对插件目录的新规则通过；time-shift 商店 artifact 与工厂版行为一致（现有 Playwright 冒烟脚本复跑）。

### 3. 插件加载器接受 trusted-js 来源安装

现状：trusted-js 只能来自工厂注册表或 catalog 条目；`store-install.ts` 显式拒绝 `channel: trusted-js` 走 artifact 路径；`installPluginPackage` 只接 function/theme 包；开发模式目录加载只接 wasm。

- [ ] 包格式：trusted-js 包复用 zip 容器（根下 manifest.json + `assets/<entry>.js`），manifest 增加 `runtime: "trusted-js"` 判别，新增 `parseTrustedJsPackage` 单一语义闸门（与 function/theme 同模式），容器层仍不做语义校验。
- [ ] 模块执行来源决策（需人工定稿）：安装的 JS 源以 Blob 存 IndexedDB `amll-plugins`，运行时用 `blob:` Object URL import，CSP 放宽为 `script-src 'self' blob:`。说明：`blob:` URL 只能由同源脚本创建，而 trusted-js 本身已是全权代码，放宽不引入新的信任面；如不接受，备选为 Service Worker 提供同源虚拟路径（`/plugins/local/<sha256>.js`），或将 trusted-js 安装限于 catalog 内容寻址 URL + 开发目录。
- [ ] 安装路径：`store-install` 支持 trusted-js channel（sha256 校验 → 容器 → `parseTrustedJsPackage` → consent → 持久化 → 以 `TrustedJsPluginEntry` 交给同一 `load()` 闸门）；设置/商店页新增"导入 JS 插件包"（zip）；开发模式目录加载支持 manifest.json + entry.js，热重载沿用 `DevPluginWatcher`。三条路径共用 consent 弹窗与三档措辞，桌面 consent 闸门同样作用于本地安装。
- [ ] 语义对齐：卸载/禁用/崩溃自动禁用/semver 更高 shadow 与 catalog 条目一致；本地安装包的 sha256 由客户端计算并在来源展示中列出（不是安全依据）；`PluginInstallSource` 沿用 user/dev/store。
- 验收：从 zip 安装一个第三方 trusted-js 插件 → consent → 菜单命令可用 → 禁用后消失 → 重启后恢复 → 卸载后 scope/存储全清理；桌面闸门关闭时被拒并给出开关指引。

### 4. QuickJS guest SDK 适配

现状：仓库尚无 QuickJS 代码。路线沿用再校准结论（方案 A）：QuickJS 编译进 wasm 壳，插件作者写 JS，以 extism-wasm 档运行并享受沙箱，宿主零改动。

- [ ] wasm 壳 `examples/plugins/quickjs-shell`（Rust：extism-pdk + rquickjs，或 C quickjs-ng）：导出 `plugin_activate`/`plugin_execute_command`/`plugin_handle_event`/`plugin_resume_form`/`plugin_convert_format`，读取嵌入的 JS 源并把回合参数交给 JS；`amll_host_call` 暴露为 JS 全局 `host.call(json)` 同步桥；JS 异常映射为 plugin error 码。
- [ ] JS 侧 SDK（TypeScript → 单文件 JS，无 DOM/Node API）：与 trusted-js SDK 同名的高层 API（`document.readSnapshot/applyEdit`、`ui.showForm` 以 outcome 续体形式、`storage.kv`、`ui.notify`），差异只在能力范围与表单续体；类型来自 plugin-api。目标：一份插件业务代码在两档间只换打包入口。
- [ ] 打包脚本 `pnpm plugin:build:quickjs <dir>`：esbuild 打 JS → 嵌入 wasm 壳（自定义 section 或 `include_bytes`） → 产出 wasm + manifest；记录壳体积与回合启动时间基线（须在 10s 回合超时内留足余量）。
- [ ] 合同测试：以真实 wasm fixture 在 Node 中跑 `WasmGuestSession` 全链路（与 sample-tools 同套）。
- [ ] 限制文档化：同步桥、无跨回合 async、无网络、Extism 内存上限、回合限额同 `DEFAULT_WASM_TURN_LIMITS`。
- 验收：用 JS 重写 sample-tools 的 trimWords/wordCount，行为一致并通过同一合同测试。

### 5. 开发文档整理

现状：`PLUGIN.md`（架构）、`docs/plugin-development-guide.md`（以 WASM 为主）、`docs/plugin-agent-guide.md`、`docs/plugin-protocol-v0.md`（自动生成）、`docs/plugin-runtime-poc.md`、ADR 0001–0003。缺 trusted-js、商店/分发、主题包制作、QuickJS 文档；PLUGIN.md 的"阶段顺序"节已过时；信任模型决策目前只存在于本文档。

- [ ] 文档地图：PLUGIN.md 只做入口与架构概览并更新阶段顺序；开发指南按档拆分为 wasm（现有）、trusted-js、quickjs、theme（含 CSS 校验规则与 slot/part 合同）、分发与商店（zip 容器、catalog、sha256、factory/shadow/pin）；新增 ADR 0004 记录 trusted-js 档与信任模型再校准。
- [ ] 自动生成扩展：`gen-plugin-docs.ts` 覆盖 `TrustedJsHostV0` 与 SDK 类型，`plugin:api:check` 继续在 CI 保证一致。
- [ ] 人工/agent 撰写：每档一份"最小插件 → 构建 → 本地安装 → 发布到 catalog"端到端教程；各阶段"已知取舍"迁入文档 FAQ，本文档只留链接；agent guide 更新为新分层与 SDK 边界。
- 验收：新人或 agent 只凭 docs 完成一个 trusted-js 与一个 quickjs 插件并通过合同测试。

## 阶段 9：定制功能插件化（原"移植定制版"，2026-08-28 调整）

- [ ] 将插件事务接入 review operation log（以审阅插件内的 operation log 形态实现，不再依赖定制版宿主）。
- [ ] 为 agents、vocalTags、多语言和 songPart 增加 capability：不作为原生能力提供，而是作为插件接入现有体系，对应修改插件系统的作用范围。
- [ ] 通知中心、设置页扩展和复杂对话框按 trusted-js 插件 contribution 形态承接。
- [ ] 将 GitHub、Review、歌词站和 NCM 功能迁移为外置插件（非必须功能，且涉及版权或数据安全风险，不内置）。
- [ ] 上游宿主 + 全部原定制功能插件通过协议合同测试后，才冻结 API v1。
- [ ] 全部定制功能插件化完成后，以插件基座版本覆盖定制版分支并停止维护该分支；原定制功能经商店分发。

## 阶段 10：插件商店后端（2026-08-27 要求定稿）

两条承重原则：

- 商店的"不分发"不是访问控制：插件代码公开，任何资格用户可见 artifact URL。安全闸门必须在审阅等业务 API 自身的鉴权上；任何业务安全性不得依赖"用户看不到这个插件"。
- trusted-js artifact 必须不可变、内容寻址、仅由 CI 发布、对所有用户字节一致，四个属性共同支撑"同源 = 与主应用等信任"的论证，缺一不可。

- [ ] 身份与资格：复用歌词站账号体系（reviewPermission）；插件在商店侧声明所需资格，清单接口每会话重新校验；资格收回后下一次清单即不返回该插件（对接客户端"资格失效 → scope dispose"）；插件代码不内嵌任何秘密，运行时以用户自身凭据调业务 API。
- [ ] 发布流水线：trusted-js 档只接受 CI 从打 tag 的源码构建发布，记录 commit hash → artifact hash 溯源；版本不可覆盖重传，下架用 kill switch；发布操作走独立强认证（受限发布账号 + 2FA）并留审计日志；artifact 元数据 schema 预留签名字段。
- [ ] 同源交付：trusted-js artifact 从应用自身 origin 提供，CDN 只能藏在应用 origin 之后回源，不得成为独立脚本 origin；内容寻址 URL + immutable 长缓存；清单接口 no-store/秒级缓存，保证 kill switch 下次刷新即生效。
- [ ] 清单与版本协商：入参 platform/appVersion/pluginApiVersion，按兼容矩阵过滤返回；对 platform=tauri 不返回 trusted-js 条目（运营性过滤，非安全依据）；支持灰度发版与按用户锁版本。
- [ ] 运营控制：插件/版本级 kill switch；发布、资格授予/回收、kill 操作全量审计；客户端崩溃自动禁用机制可选上报，除此之外遥测最小化。
- [ ] artifact 一致性红线：禁止服务端按用户个性化生成代码，同版本对所有用户字节一致；个性化一律走数据 API。
- [ ] 分档差异：第三方 trusted-js 可上架，走 consent + 来源展示（2026-08-27 再校准）；签名档为未来桌面强化项。WASM/主题包货架以客户端校验为边界，后端做托管、元数据、账号实名与上传时复验客户端同款体积上限（主题包已迁 IndexedDB，上限重新定档后两端同步）；两个货架发布通道分离。
- [ ] 可用性：商店不可用不影响编辑器，清单请求失败 = 功能缺席，不进入错误循环。
- [ ] 包容器格式（前端部分已在里程碑 2 实现）：本地手写导入用 base64-JSON（保留设置页粘贴导入体验，维持既有紧上限）；商店分发一律 zip（固定布局、加固解包）。两条路径只是容器剥离前端，汇入同一 `parse*Package` 信任边界；格式识别用 magic bytes；手写 JSON 上架由打包脚本一键转 zip；IndexedDB 落盘统一为 manifest JSON + 二进制 Blob，不存 base64。

## MVP 完成标准

MVP 应能安装一个主题插件和一个 WASM 功能插件；功能插件能注册菜单、打开声明式表单、修改歌词并完整撤销；主题能安全替换视觉 token；插件超时或崩溃不会破坏编辑器；Web 和 Tauri 均通过冒烟测试。
