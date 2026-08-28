• 下面这份清单按依赖顺序排列。核心原则是：先建立内核边界和稳定协议，再接 Extism；先迁移一个完整功能闭环，再批量插件化。

  已实现成果盘点（2026-08-25）

  - 阶段 0：已在 `feat-plugin` 分支固定插件架构、信任边界、MVP/非目标和 experimental v0
    版本策略；ADR 0001–0003 与 `PLUGIN.md` 已成为架构和协议的权威入口。
  - 阶段 1：已完成 Extism JSON PoC、Worker runtime/session 抽象、终止/超时/重复加载/大 payload
    诊断和基准记录，并验证浏览器 Worker、Tauri Windows、Tauri WebKit、Rust PDK 与 C# WASI。
    Extism 依赖被隔离在 `src/plugins/runtime`，业务模块只看到 `PluginRuntime` 接口。
  - 阶段 2：已落地 `EditorDocumentService` 的 snapshot、事务、replace、revision、undo/redo 和事件；
    Jotai 通过单一 adapter 接入。工具、Ribbon、元数据、频谱、导入器和编辑器直写点已迁移，稳定
    行/词 ID、字段保留、冲突拒绝和 import boundary 均有测试覆盖。
  - 阶段 3：公开 `plugin-api`、JSON Schema、capability negotiation、Mock Host 合同测试和分层 lint
    已落地；时间平移已完成完整 application service 闭环。`src/application/lyrics` 与
    `src/application/project` 已继续承接格式、导航、时间线、元数据、分词、罗马音、历史快照和提交编排，
    平台实现收敛到 `src/platform` 或模块 adapter。
  - 对应提交链：`c9280cb`（ADR/依赖）→ `29aa81a`、`9ccef5a`（runtime PoC）→
    `6601c31`、`42ed686`、`c1356f3`（事务层与全量迁移）→ `e194c6f`（公开 Plugin API 与
    首批分层迁移）。`src/application/lyrics` 的继续拆分目前仍在工作区中，尚未提交。

  目标结构

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
    adapters/                   # 上游版和定制版宿主适配
    ui/                         # 插件管理器、菜单、表单

  阶段 0：固定架构决策

  - [x] 从干净的上游 main 创建独立 worktree 和功能分支，避免当前未跟踪的定制目录混入提交。
  - [x] 编写 ADR，明确内核保留编辑、时轴、预览、频谱和音频能力。
  - [x] 明确三类运行方式：builtin、extism-wasm、theme/none。
  - [x] 将 trusted-js 标记为未来能力，MVP 不开放给普通第三方插件。
  - [x] 规定主题包与功能包互斥，需要组合时使用两个插件包。
  - [x] 将插件 API 标记为 experimental/v0，在定制版完成适配前不冻结 v1。
  - [x] 重写 PLUGIN.md，先记录架构和协议，不急于保留现有函数原型。

  验收条件：架构、信任边界、MVP 范围和非目标均已文档化。

  阶段 1：先验证高风险技术

  - [x] 制作最小 Extism 插件，只接收 JSON 并返回 JSON。
  - [x] 在浏览器 Worker、Tauri Windows 和 Tauri WebKit 目标上验证加载。
  - [x] 验证插件终止、超时、重复加载和大 payload。
  - [x] 记录启动时间、包体和序列化耗时；内存基线待目标平台回填。
  - [x] 验证所需语言 PDK，覆盖 Rust 和 C#（WASI）。
  - [x] 确认 Extism 被封装在 PluginRuntime 接口后，不泄漏到业务模块。

  若这个 PoC 无法覆盖目标平台，应在重构大量代码前更换运行时方案。

  阶段 2：建立编辑器事务层

  这是整个工程最先要落地的正式重构。

  - [x] 新增 EditorDocumentService，提供 readSnapshot、transact、replace、undo、redo。
  - [x] 每次修改携带 source、label、pluginId 和 expectedRevision。
  - [x] 一个插件操作只产生一个撤销记录。
  - [x] 加入 revision 冲突检测，禁止异步插件静默覆盖用户新修改。
  - [x] 插件只能看到公开文档投影，宿主内部字段由 adapter 保留。
  - [x] 为行和单词使用稳定 ID，事件中不依赖数组索引。
  - [x] 禁止新增代码直接写 lyricLinesAtom，通过 lint/import boundary 约束。
  - [x] 分模块迁移现有直接写入点：编辑器、Ribbon、频谱、工具、导入器、元数据。
    - [x] 工具：TimeShift、SyllableSmoothing、ReplaceWord、RubyEditor。
    - [x] Ribbon：字段编辑、属性切换、新建歌词行、背景歌词同步设置。
    - [x] 元数据：MetadataEditor 的值、键和批量清空操作。
    - [x] 频谱：时间轴边界、单词平移和行时间编辑。
    - [x] 导入器：本地歌词、纯文本、LRCLIB 和音频元数据导入。
    - [x] 编辑器：行/词编辑视图、同步打轴、右键菜单、拖拽排序、分词对话框、设置页与历史恢复。
  - [x] 为事务、撤销、重做、冲突和字段保留添加测试。

  验收条件：所有用户和插件文档修改都能被统一观察、撤销并标记来源。

  阶段 3：建立公开 Plugin API

  - [x] 创建独立的 packages/plugin-api，不得依赖 React、Jotai、Tauri 或内部 TTMLLyric。
  - [x] 固定 UI 与业务的分层边界：业务逻辑只能依赖 kernel、platform 接口和 plugin-api；UI 只能通过 adapter、application service 或 command 调用业务，禁止直接修改 lyricLinesAtom。
  - [ ] 将 Jotai、React、Tauri、DOM 和 Worker 依赖收敛到 adapters/ui/runtime；业务层不得反向导入这些实现。
    - [x] 正式的 `kernel`、`application` 和 `plugin-api` 层已禁止反向导入并由 lint 检查。
    - [x] `segment-processing.ts` 已收敛为 Jotai 派生状态 adapter，时间线分段算法已迁移到
      `LyricTimelineService`。
    - [ ] 继续拆分 `src/modules` 中混合 UI/业务的遗留模块。
  - [x] 为文档、导入导出、分词、时间处理等可复用业务建立 host-agnostic application service；React hook 只负责状态绑定、交互和错误展示。
    - [x] 时间处理：新增无 React/Jotai/DOM 依赖的 `TimeShiftService`。
    - [x] 纯文本导入：新增 `PlainTextImportService`，负责多行/同行翻译与音译、特殊前缀、分词符和空拍解析。
    - [x] 歌词导出：新增 `LyricExportService`，负责导出时间取整与文件名生成；文件保存仍由 UI/platform 负责。
    - [x] 时间线投影：新增 `LyricTimelineService`，负责生成 word/gap segment，Jotai 仅负责派生状态。
    - [x] TTML、LRCLIB、同步导航、元数据、完整分词流程等业务已按功能闭环迁移。
  - [x] 选择一个完整功能闭环（建议时间平移）完成 UI → command/application service → EditorDocumentService 的迁移，并删除该功能的旧直写入口。
  - [x] 为分层增加 import boundary/lint 约束，并在 CI 中检查新增跨层依赖。
  - [x] 定义 FunctionPluginManifest 和 ThemePluginManifest 判别联合。
  - [x] 定义 PluginDocumentV0、事件、命令、错误、权限和生命周期协议。
  - [x] 使用 JSON Schema 校验所有 manifest、宿主调用和插件返回值。
  - [x] 加入 apiVersion、themeApiVersion 和 capability negotiation。
  - [x] 首批 capability：lyrics.core、lyrics.ruby、ui.notify、ui.form、storage.kv。
  - [x] 为定制字段预留 capability 和 extensions，但不允许无约束覆盖内部对象。
  - [x] 自动生成 SDK 类型和协议文档。

  当前验证：Mock Host 合同套件无需启动 React；时间平移与罗马音分配均可在 Node 测试中产生单一事务
  并完整撤销；历史版本策略、提交校验/网络端口、纯文本导入、歌词导出规范化和时间线分段均可在
  Node/Vitest 中独立测试。全量 102 项测试、TypeScript、仓库级 Biome lint 和
  `scripts/check-editor-boundary.mjs` 均通过；Biome 仅报告 13 个既有样式警告和 1 条既有抑制提示。

  阶段 3 验收记录（2026-08-25，全面审计）

  验收结论：**三项验收条件全部通过**。

  1. Mock Host 插件合同测试无需启动 React —— 通过。`vitest.config.ts` 全局 `environment: "node"`，
     仓库不存在 jsdom/Testing Library 依赖；`packages/plugin-api/tests/contract/mock-host.spec.ts`
     以 `runHostContractTests` 复用协议套件（稳定投影、单事务原子应用与单次撤销、revision 冲突拒绝、
     调用前 schema 校验），`MockPluginHost` 零外部依赖。
  2. 完整功能闭环可脱离 React 执行并统一事务/撤销 —— 通过。`TimeShiftService.spec.ts` 断言
     一次平移后 `undo()` 一次即回到原始快照且 `canUndo()` 变为 false（单事务证明）；
     LyricLineReorder、Romanization、Segmentation、EditorDocumentService 测试均覆盖同一模式。
  3. 业务层无 React/Jotai/Tauri/DOM 直接依赖 —— 通过。逐文件核查 `src/application`（35 文件）、
     `src/kernel` 与 `packages/plugin-api`（23 文件）：零违规。plugin-api 由 tsconfig
     `lib: ["ESNext"]` + `types: []` 编译期强制隔离；Tauri 仅存在于 App/WindowControls/TopMenu/update；
     `?worker` 全部收敛在 `src/platform/audio/BrowserAudioRuntime.ts` 与 `src/plugins/runtime`。
     CI（`build-desktop.yaml`）执行 `lint:boundaries`、`plugin:api:check` 与 `pnpm test`。

  验收时全量复跑：102/102 测试通过、`tsc -b` 通过、`pnpm lint`（boundaries + Biome）通过、
  `plugin:api:check`（类型 + 生成文档一致性）通过。

  审计发现的非阻塞遗留（转入阶段 4 前处理）：

  - 边界脚本缺口（已完成，见下方“进入阶段 4 前收尾”）：application/kernel 允许任意 `.` 相对路径导入（可绕过分层）；DOM 全局名单较窄
    （未查 `document`/`window`/`localStorage`/`fetch` 等小写全局）；`packages/plugin-api/tests/`
    未被遍历；`src/platform`、`src/plugins` 无正向规则。
  - 未纳入 rule E 隔离的纯算法模块（已完成，见下方“进入阶段 4 前收尾”）：`spectrogram/utils/timeline-boundary.ts`、
    `lyric-editor/utils/ruby-generator.ts`、`normalize-line-time.ts`、`lrclib/utils/*`、
    `src/utils/parse-lrc.ts`（游离于分层目录之外）。
  - 仍含业务逻辑的 UI 文件（下一轮拆分优先级）：`sync-keybinding.tsx`（419 行，整套打轴
    判定时间/智能首末词/空拍状态机，建议抽出 `SyncTimingService`）、`lyric-line-view.tsx`
    （endTimeLink 联动规则）、`lyric-word-menu.tsx`（词拆分/合并/增删事务构造）、
    `useLyricListDrag.ts`（454 行指针几何/自动滚动）、`useTopMenuActions.ts` 的
    `onSyncLineTimestamps` 与 `buildRubySegments`、`lyric-line-menu.tsx` 的行合并时间重排。
  - `ttml-processor/index.ts` 仍直接读取 `globalStore`（`getDefaultGeneratorConfig`），属设置
    adapter 定位但建议改为注入。

  阶段 3 剩余遗留模块审计（2026-08-25）

  优先级 P0：完成阶段 3 验收前应优先拆分。

  P0 进展（本轮工作区，2026-08-25）

  - [x] TTML：新增无 React/Jotai/Tauri/DOM 依赖的 `TtmlFormatService`，显式接收生成配置；旧 `ttml-processor` 仅保留 WASM/设置 adapter。
  - [x] 同步导航：新增 `LyricNavigationService`，承载同步单元、Ruby 选择解析、跨行前后导航和当前位置定位；`useCurrentLocation` 只负责 Jotai 绑定。
  - [x] 频谱时间线：新增 `LyricTimelineMutationService`，纯计算与文档端口提交分离；旧模块仅提供兼容提交 facade。
  - [x] LRCLIB：新增 `LrcLibImportService`，负责导入文档准备、背景人声提取/自动分词编排和安全文件名生成；React 组件保留搜索、确认和错误展示。
  - [x] 元数据：新增 `MetadataService`，负责增删改、拖放拆分、去重和清空事务；组件保留焦点、拖放交互和展示。
  - [x] 分词：新增 `SegmentationService` 配置工厂、范围规范化和手动拆分工具；hook 仅负责设置绑定与异步 hyphenator 加载。
  - [x] 本轮新增 application service 的 Node/Vitest 覆盖已加入；全量测试、TypeScript、编辑器边界检查通过。

  优先级 P1：P0 完成后继续收敛平台和业务边界。

  P1 进展（本轮工作区，2026-08-25）

  1. [x] `src/modules/project/autosave/autosave.ts` 与 `modals/HistoryRestore.tsx`
     - 将历史保留策略、项目快照业务与 IndexedDB 实现拆成 application service 和 storage adapter。
  2. [x] `src/modules/project/modals/SubmitToAmll.tsx`
     - TTML 生成编排、提交 payload、校验和请求流程已从大型对话框中拆出；新增 host-agnostic
       `HttpClientPort` 与 Fetch adapter。外部平台协议和多歌词库提交行为不在本轮扩展。
  3. [x] `src/modules/audio/audio-engine.ts`
     - 移除对 `globalStore` 的直接读取，以显式配置或 adapter 注入设置；Worker/AudioContext 仍属于 runtime/platform 实现。
  4. [x] `src/modules/segmentation/utils/Transliteration/roman-debugger.ts` 与
     `project/modals/DistributeRomanization.tsx`
     - 调试报告与文档应用已迁移到 `RomanizationService`；核心算法通过 port 注入，UI 仅处理范围选择、
       日志和对话框生命周期，整次应用保持单一文档事务并可撤销。

  优先级 P2：不阻塞当前 application service 验收，但在插件化前需要整理。

  P2 进展（本轮工作区，2026-08-25）

  - [x] `lyric-word-view.tsx`、`lyric-line-view.tsx`、`AudioSpectrogram.tsx` 已继续按 view、
    interaction adapter/hook 拆分：新增歌词词拖拽交互、行滚动/副行编辑、共享 view-model、频谱游标同步和
    可见瓦片 hooks；三个主文件分别由约 1018/771/625 行收敛到约 762/589/538 行。
  - [x] Worker 构造、AudioContext 和 bundler 资源 URL 已集中到
    `src/platform/audio/BrowserAudioRuntime.ts`，通过 `AudioRuntimePort` 注入 audio engine、波形分析和
    频谱 Worker 客户端。`ffmpeg`、频谱与音频的底层实时算法及原注释保持不变，只收敛宿主装配入口。
  - [x] `drag-reorder.ts`、`segmentation.ts`、`syllable-smoothing.ts` 和项目 `logic/` 的实现未重写；
    UI 调用方已改为经过 `LyricLineReorderService`、`SegmentationService`、`ProjectFileService` 与对应 adapter。
    分层检查新增规则，禁止 UI 再直接导入这些纯模块，并限制 `?worker` 资源只能由 platform/runtime adapter 引入。

  阶段 3 进入阶段 4 前收尾（2026-08-25）

  - [x] 收紧 `scripts/check-editor-boundary.mjs`：相对导入按解析后的真实目标校验，不能再以
    `../../modules/...` 绕过 application/kernel 边界；补查小写 `document`、`window`、
    `localStorage`、`fetch` 等宿主全局；遍历 `packages/plugin-api/tests/`；为 `src/platform`
    与 `src/plugins`（含 runtime、adapters、ui 和根目录）加入正向依赖白名单。脚本内置回归断言覆盖上述缺口。
  - [x] 收口遗漏的纯算法模块：时间线边界与行时间归一化迁入 `LyricTimelineService`；Ruby 生成通过
    `RomanizationService` + adapter 形成单事务入口；LRCLIB converter、括号背景提取和 LRC parser
    仅由 `lrc-import-engine` adapter 暴露，`src/utils/parse-lrc.ts` 已迁入 LRCLIB 模块；rule E 按解析后
    的目标路径阻止 UI 以别名或相对路径直接导入这些算法。
  - [x] 收尾验证：107/107 测试通过、`tsc -b` 通过、`pnpm lint` 通过（仅 13 条既有警告和
    1 条既有提示）、`plugin:api:check` 通过。

  验收条件：Mock Host 中可以运行插件合同测试，不需要启动 React 应用；至少一个完整功能可在不渲染 React 的情况下通过 application service 执行、产生统一文档事务并撤销；业务层无 React/Jotai/Tauri/DOM 直接依赖。

  阶段 4：命令和 UI Contribution

  - [x] 扩展现有 keyboard registry，使 command 同时包含 handler、enablement、来源和清理逻辑。
  - [x] 菜单项只引用 command ID，不直接保存回调。
  - [x] 建立菜单、工具栏、侧栏、设置页和对话框 contribution registry。
  - [x] MVP 只开放命令、菜单、通知和声明式表单。
  - [x] 第三方插件不得注入 React 组件或任意 HTML。
  - [x] 内置插件可以注册受信任 React view contribution。
  - [x] 插件卸载时必须自动清理全部 contribution 和事件监听器。
  - [x] 将 `src/modules/settings/states/custom-background.ts` 的 Jotai、IndexedDB、localStorage
    迁移、fetch 与 Blob URL 生命周期拆到 platform storage/resource adapter；与主题系统的资源生命周期一并设计。

  首个迁移对象建议选择“时间平移”一类工具，能同时验证菜单、表单、文档事务、撤销和通知。

  阶段 4 完成记录（2026-08-25）

<details>

  - `src/kernel/commands` 已成为 command 真相源；keyboard registry 保留原有快捷键 storage key，
    同时桥接 handler、enablement、source、execute 和 disposable。重复注册、禁用执行和清理均有测试。
  - 顶部菜单、导入导出菜单、歌词行/单词右键菜单和编辑区菜单均通过 command menu adapter 只引用
    command ID；边界脚本新增回归规则，禁止普通菜单项重新内联 `onSelect`/`onClick`/`onCheckedChange`。
  - `ExtensionRegistry` 已覆盖 menu、toolbar、sidebar、settings 和 dialog contribution，并以 owner scope
    统一收集 command、contribution 与事件监听器。scope dispose 后三类资源全部自动消失。
  - 第三方 manifest adapter 仅映射 command、menu 和声明式 settings form；MVP 拒绝第三方 toolbar/sidebar
    和 trusted view。公开 form/notification 均只渲染协议允许的纯文本和字段类型，不接受 React/HTML。
    builtin scope 可以注册受信任 view contribution，并有正反合同测试。
  - 首个内置插件 `builtin.time-shift` 已完成 contribution 菜单 → command → 声明式表单 →
    `TimeShiftService` → 单一文档事务 → 通知闭环；旧 `TimeShiftDialog` 和 dialog atom 已删除。
    测试证明一次执行只产生一个 revision/撤销记录，单次 undo 可完整恢复，卸载后命令和菜单消失。
  - 自定义背景已拆为通用 `ManagedResource`、IndexedDB storage、legacy data URL loader、浏览器 Object URL
    adapter、localStorage adapter 和 Jotai binding；资源替换、清空与 App 卸载都会 revoke URL。
    `ManagedResource` 可在阶段 5 复用于主题包资源生命周期，边界脚本禁止 state 层重新访问 idb、fetch、
    localStorage 或 Object URL API。
  - 声明式表单在阶段 4 基础上继续扩展了宿主尺寸、递归 group、row/column 布局、条件显示、数字步进器、
    横向 radio、禁用 option、紧凑字段和缩进等固定组件能力；协议仍拒绝 HTML/CSS/React/回调注入。
    `builtin.time-shift` 已用扩展 schema 重新复现原模态框的 450px 尺寸、±50ms 箭头步进器、横向方向
    单选、动态选区范围、禁用态以及仅在 custom scope 下显示的紧凑行范围输入。
  - 表单标题、标签、提示、选项、按钮和 stepper 支持按 `@fluentui/react-icons` 导出名引用宿主图标；
    `FORM_FLUENT_ICON_NAMES_V0` 与宿主映射保持合同测试一致，未知名称、任意 SVG/URL 和动态组件均被拒绝。
  - 完成时全量验证：120/120 测试通过、`tsc -b` 与 Vite production build 通过、`pnpm lint`
    通过（仅 13 条既有 warning 和 1 条既有提示）、`plugin:api:check` 通过。
</details>


  阶段 4 安全审计与加固（2026-08-25，Claude + 本机 codex 交叉审计）

<details>
  审计结论：阶段 4 的勾选项全部属实（command 真相源、菜单只引用 command ID、contribution registry、
  MVP 限制、卸载清理、自定义背景拆分均有实现和测试）。交叉审计发现并修复了以下隐患：

  - 协议与表单注入面：
    - `parseHostCall` 此前对 `ui.showForm` 只做结构校验，不跑表单语义检查（重复 key、悬空
      `visibleWhen`、禁用默认 option、`min>max` 可进入宿主渲染）；现与 manifest settings 共用
      `validateFormSemantics`。`declarativeFormService.showForm` 同时在宿主侧再验一次（纵深防御）。
    - 表单协议缺少体积上限：localizedText 增加 2048 字符与 16 语言上限（validator 新增
      `maxProperties`）、字段数每层 ≤64、options ≤200、text default/placeholder/maxLength 设上限，
      防止超大 payload 冻结 UI。
    - 表单提交此前完全信任 React 状态：现提交前按 schema 重新 sanitize（类型强转、数字 clamp/有限性、
      选项成员与禁用检查、截断超长文本、丢弃 schema 外的键），可见字段违反约束时提交按钮禁用。
    - 表单请求/完成缺少关联 ID：滞后对话框可能用旧表单的值完成新请求；现 `complete/cancel`
      必须携带 request id，不匹配即忽略。
  - 注册表与命名空间：
    - 插件 scope 此前可注册任意 command/menu/form id 并把菜单指向任意命令（可抢占内置命令 ID 或
      把他人命令暴露到新菜单入口）；现 plugin scope 强制 `pluginId.` 前缀，menu 只能引用自己的命令；
      协议层 `parseManifest` 同步增加 menus[].command 前缀检查。
    - `registerManifestContributions` 此前只信任编译期类型；现入口强制 `parseManifest` 运行时校验，
      theme 包与非法 manifest 直接拒绝。
    - `CommandRegistry.execute` 在 enablement 回调后重新验证注册未被重入替换；`ExtensionRegistry.emit`
      按监听器隔离异常，单个插件抛错不再阻断其后监听器。
    - 菜单 contribution 的 `when` 此前只存储从不求值；现 `ContributionMenuItems` 以
      `parseEnablement/evaluateEnablement` fail-closed 求值，宿主上下文由新增
      `src/plugins/adapters/enablement-context.ts` 提供（mode/hasSelection/documentEmpty/audioLoaded/
      canUndo/canRedo 等）。
  - 资源与存储生命周期：
    - `ManagedResource` 存在竞态：慢速 initialize/迁移完成后可 revoke 用户刚设置的新 URL 并复活旧背景；
      dispose 后在途操作仍会创建无人回收的 Object URL。现引入 generation 计数，过期操作不再改变状态
      （latest-wins），dispose 使在途操作失效。
    - IndexedDB 打开失败此前被永久缓存（整个会话静默退化为不持久化）；现失败不缓存、连接 terminated
      后可重开，读取校验 `blob instanceof Blob`，读写失败改为 console.warn 而非完全静默。
    - `browserKeyValueStorage` 包裹 SecurityError/QuotaExceededError 等同步异常，隐私模式或配额耗尽
      不再使设置 atom 写入抛未处理异常。
  - 未修复但已知的低风险项（留待阶段 6 WASM 宿主）：命令 handler 为异步时 scope dispose 不取消
    在途执行（需要 AbortSignal/调用 ID 机制，属阶段 6 RPC 取消范畴）；IndexedDB 写失败仅告警不重试。
  - 加固后全量验证：132/132 测试通过（新增 12 项覆盖命名空间强制、重入守卫、事件隔离、表单
    sanitize/校验、请求 ID 匹配、ManagedResource 竞态、协议尺寸上限与 ui.showForm 语义校验）、
    `tsc -b` 通过、`pnpm lint` 通过（仅既有 13 warning + 1 提示）、`plugin:api:check` 通过
    （协议文档已重新生成）、Vite production build 通过。

</details>

  阶段 4 扩展（2026-08-26 评估，待实施）：标题栏 contribution、一级页面（模式）contribution 与表单动画

  现状确认：插件系统目前**不提供**标题栏组件或一级页面接口。contribution registry 只覆盖
  menu（menu.file/edit/tool/help、context.lyricLine/lyricWord）、toolbar（builtin-only）、
  settings/dialog 声明式表单和 builtin-only trusted view（sidebar/settings-view/dialog-view）。
  标题栏没有任何 contribution 点（主题系统仅将 title-bar 作为样式 slot）；一级页面由硬编码
  `ToolMode` enum（Edit/Sync/Preview）在 App/RibbonBar/TitleBar/Sidebar/enablement-context
  多处分支实现，插件无法注册第四模式。amll-ttml-tool-test 分支的“审阅”页面正是
  “第四 ToolMode + 权限门控的模式切换项 + 标题栏 ReviewActionGroup/通知中心 + 独立 Ribbon +
  隐藏 Sidebar”的组合，属阶段 9 要以插件承接的定制功能 —— 因此该能力是阶段 9 的前置依赖。

  可行性与安全边界结论：

  - 一级页面（模式）contribution：可行，但必须分信任档。builtin/trusted 插件注册完整 React
    mainView 属低风险工程工作（把 enum 换成 mode registry）；而向第三方 WASM 插件开放一级页面
    等于交出整个主视口的任意渲染面 —— 页面位于 slot 树内却占满视口，可伪造设置对话框等安全 UI，
    绕过阶段 5 靠“主题只能改样式 + portal/data-amll-protected”建立的防遮挡保证，直接违反
    “第三方不得注入 React/任意 HTML”红线。MVP 不向第三方开放一级页面；后续如需支持，只能走
    声明式页面 schema 或 WASM 渲染数据协议，另行评审。
  - 标题栏 contribution：标题栏承载模式切换器与窗口控制，属恢复入口性质区域。第三方最多获得
    声明式动作位（只引用自身 command ID + 宿主图标白名单 + 纯文本 tooltip），固定插槽、数量
    上限、悬停展示插件来源，不得触碰窗口拖拽区、窗口控制和模式切换器（仿冒与遮挡风险）；
    builtin 可注册受信任 action group（对应测试分支 ReviewActionGroup 形态）。
  - 表单动画：采用声明式动画预设，不向表单协议开放 CSS 文本。表单由宿主完全控制渲染并在
    提交前 sanitize 是该协议的核心安全卖点；允许插件 CSS（即便复用主题校验器）会引入对话框内
    视觉仿冒（如把 cancel 按钮画成 primary）、布局破坏与遮挡面，且主题校验器的 slot 锚定模型
    也不适配表单内部结构。图标白名单（FORM_FLUENT_ICON_NAMES_V0）已验证“枚举白名单 + 宿主
    实现”模式可行，动画沿用同一模式。主题 CSS 校验器现禁 @keyframes；若未来需要主题动画，
    应在阶段 5 合同内以受限 @keyframes（名称强制前缀 + 仅 transform/opacity/filter 属性白名单）
    另行扩展，属主题包能力，不进表单协议。

  工作项：

  - [x] 建立 mode/page contribution registry：模式包含 id、LocalizedText 标题、order、
    enablement、mainView，及可选 ribbonView、titleBarActions、hideSidebar；内置
    Edit/Sync/Preview 迁移为首批 builtin mode contribution，App/RibbonBar/TitleBar 改为
    遍历 registry 渲染。
  - [x] fail-safe 保证：内置 Edit 模式不可被移除或隐藏；活动模式对应插件禁用/卸载/崩溃时
    自动回退 Edit；模式切换器与窗口控制不可被任何 contribution 覆盖或遮挡。
  - [x] mainView/ribbonView/titleBarActions 仅接受 builtin trusted scope（与
    registerTrustedView 同一信任闸门），第三方 manifest 声明 mode 直接在 parseManifest 拒绝，
    并有正反合同测试。
  - [x] enablement 上下文 mode 字段与模式切换快捷键 storage key 支持动态模式 id
    （命名空间化），when 表达式对未知模式 fail-closed。
  - [x] 标题栏声明式动作位：新增 titlebar.actions contribution（command ID + 图标白名单 +
    LocalizedText tooltip），plugin scope 强制自身命名空间，固定区域渲染、每插件数量上限、
    悬停显示插件来源；builtin 可注册 trusted action group。
  - [x] 表单动画预设：FormSchemaV0 与字段 presentation 增加 animation 枚举
    （如 fade/slide-up/scale-in + fast/normal/slow 档位），宿主固定实现并尊重
    prefers-reduced-motion，schema 校验拒绝未知预设与超界 duration；协议继续拒绝任何
    CSS/HTML/React 注入。

  阶段 4 扩展完成记录（2026-08-26）

  - 模式（一级页面）registry：`ContributionRegistry` 新增 `mode` contribution
    （modeId/title/order/when/mainView/mainViewKey/ribbonView/titleBarActions/hideSidebar），
    `getModes()` 按 order 排序，modeId 全局唯一；注册与 trusted view 同一信任闸门（owner.trusted），
    plugin scope 注册直接抛错。内置 Edit/Sync/Preview 由永不 dispose 的 `core.modes` builtin scope
    在 `src/plugins/builtin/modes` 注册（Edit/Sync 共享 mainViewKey="edit"，模式切换不重挂载歌词
    编辑器，保持原 AnimatePresence 行为）；App 主视口、RibbonBar、TitleBar 模式切换器全部改为遍历
    registry 渲染，`ToolMode` enum 仅作为内置模式 id 常量保留，`toolModeAtom` 放宽为 string。
  - fail-safe：`FALLBACK_MODE_ID = "edit"`；`resolveActiveModeId` 对未注册的活动模式返回 edit，
    App 以 effect 将 atom 写回；edit 模式禁止携带 `when`（registry 抛错），modeId 唯一性防止
    二次注册顶替；模式切换器包在 `data-amll-protected` 标记内且位于固定 title-bar 插槽，
    contribution 渲染区（TitleBarActions）是独立 flex 插槽，物理上不与拖拽区/窗口控制/切换器重叠。
  - 协议：`parseManifest` 对任何声明 `contributes.modes` 的 manifest 在 schema 校验前给出针对性
    拒绝（正反合同测试覆盖 registry 与 manifest 两个入口）。
  - 动态模式快捷键：新增 `registerModeSwitchCommand`——内置三模式沿用 legacy storage key
    （switchEditMode 等，用户既有配置不失效），动态模式使用 `keybindings:switchMode.<modeId>`
    命名空间 key；命令 handler 由 mode adapter 绑定（含 when fail-closed enablement），
    模式卸载时命令与绑定一并清理。enablement 上下文 `mode` 字段返回 registry 解析后的
    活动模式 id（含回退），对未知/已卸载模式的 `when` 比较自然为 false（新增 enablement 测试）。
  - 标题栏声明式动作位：manifest `contributes.titleBarActions`（command + 白名单图标 + 纯文本
    tooltip + order/when），schema 每 manifest ≤3 条，registry 对 plugin owner 再限 3 条并强制
    自身命名空间（command 与 id）；`TitleBarActions` 组件在固定区域渲染 IconButton，tooltip
    显示"文案 · 插件来源"，命令经 CommandRegistry enablement 门控执行；builtin 可注册
    `titlebar-group` trusted view 与模式级 titleBarActions 动作组（对应 ReviewActionGroup 形态）。
  - 表单动画：`FormAnimationV0`（preset: fade/slide-up/scale-in；speed: fast/normal/slow）加入
    FormSchemaV0、字段 presentation、note 与 group；schema 枚举校验拒绝未知预设/档位/任何
    数值 duration 字段；宿主以固定 CSS keyframes 实现（120/200/320ms），
    `prefers-reduced-motion: reduce` 下全部禁用，协议不接受任何 CSS/HTML/React 注入。
  - 完成时全量验证：212/212 测试通过（新增 10 项：mode registry 信任闸门/唯一性/fail-safe/排序 4、
    titlebar 动作上限与命名空间 2、manifest modes 拒绝与 titleBarActions 校验 2、表单动画 1、
    动态模式 enablement 1），`tsc -b`、`pnpm lint`（boundaries + Biome 基线 13 warning + 1 info）、
    `plugin:api:check`（协议文档已重新生成）、Vite production build 全部通过。
  - 已知取舍：标题栏声明式动作的 `when` 从 contribution/命令状态变化与父级重渲染时重估
    （与菜单打开时求值一致），选择态驱动的表达式可能滞后一帧；动态模式的快捷键设置项描述
    显示 contribution 标题的 default 文本（不走 locale 文件）；模式 contribution 的 mainView
    为受信任 React 组件，向第三方 WASM 开放一级页面仍按上文结论排除在 MVP 之外。

  阶段 5：主题系统

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

  阶段 5 完成记录（2026-08-25）

  - 协议层（packages/plugin-api）：`ThemeTokensV0` 升级为命名 token 合同——color/lyrics/spectrogram
    组仅接受 `THEME_*_TOKEN_NAMES_V0` 白名单键（schema `additionalProperties: false`），新增
    `light`/`dark` 模式覆盖组；token 值经 unsafe-CSS 正则（禁 url/var/expression/@import/协议/转义/
    结构字符）与 per-kind 白名单（颜色、长度、字体族）双重校验。新增 `ThemePackageV0` 判别协议
    （manifest + 内联 tokens + CSS 文本 + base64 资源）与 `parseThemePackage` 单一信任边界入口：
    校验 manifest kind、tokens、逐文件 CSS、manifest.styles 与包内文件双向一致、资源命名/mime
    白名单/体积上限（单资源 ≤2MB base64、≤16 个、CSS 单文件 ≤128KB）。`themePackage` schema 已并入
    SCHEMA_CATALOG，协议文档已重新生成。
  - CSS 校验器（`theme-css.ts`，纯 TS、零依赖、Node 可测）：状态机剥离注释并拒绝反斜杠转义、
    未终结注释/字符串、字符串内结构字符（`{};@\:`，从根上阻断协议 URL 与关键字走私）；文本级
    禁令覆盖 `!important`（保证 amll.user 层永远胜出）、`@media/@supports/@font-face` 之外的全部
    at-rule、`https:/data:/javascript:/file:/blob:`、`expression()/element()/-moz-binding` 与
    `data-amll-protected` 字符串；`url()` 仅允许 `url(asset:<name>)` 且必须命中包内资源；结构层
    解析花括号配平、禁嵌套规则、@media/@supports 递归（深度 ≤4），每个选择器必须以
    `[data-slot="…"]`/`[data-part="…"]`（可带 `[data-amll-appearance="dark|light"]` 前缀）锚定且
    slot/part 名在 `THEME_SLOT_NAMES_V0`/`THEME_PART_NAMES_V0` 白名单内。
  - 内核（`src/kernel/theme`，无 React/DOM，端口注入）：`compileThemeTokensCss` 将 token 编译为
    `--attt-*` CSS 变量（`:root` + `:root[data-amll-appearance=…]` 模式覆盖）；`ThemeService`
    管理注册/导入/移除、应用/预览/取消预览/恢复默认、用户 token override、安全模式与资源 URL
    生命周期（切换/清空/dispose 全部 revoke）。崩溃标记协议：初始化注入前写 applyPending，宿主
    mount 稳定后 confirmStartupStable 清除；下次启动发现残留标记即自动进入安全模式并持久化。
    initialize 幂等（StrictMode 双挂载不会误判崩溃）。安装的主题包整包（含 base64 资源）持久化在
    localStorage JSON，损坏条目跳过并告警。
  - 平台适配（`src/platform/theme`）：`DomThemeStyleAdapter` 将主题 CSS 包进 `@layer amll.theme`、
    用户 override 包进 `@layer amll.user` 注入 `<style>`；`BrowserThemeAssetUrlAdapter` 把 base64
    资源解码为 Blob Object URL；`setDocumentAppearance` 维护 `<html data-amll-appearance>`（由
    ThemeHost 与 isDarkThemeAtom 同步）。`index.css` 顶部声明
    `@layer amll.base, amll.theme, amll.user;` 并在 base 层提供默认 token。
  - 覆盖顺序与安全 UI 保护：未分层的应用 CSS 永远压过全部三层（层叠规则），主题即便通过校验也
    只能影响 slot 作用域内的样式；设置对话框 Content 标记 `data-amll-protected`（校验器整包拒绝
    引用该属性的 CSS）；对话框/Toast 均 portal 到 body、位于 slot 树之外，且 appContent 的
    stacking context（z-index:1）使 slot 内元素在物理上无法绘制到 body 级 portal 之上——恶意主题
    无法遮挡或隐藏设置/恢复入口。键盘救援快捷键 Ctrl+Alt+Shift+F12（capture 阶段监听，CSS 无法
    隐藏）一键恢复默认主题；`?theme-safe-mode=1` URL 参数强制单次安全模式启动。
  - 宿主与 UI：`theme-host.ts` 完成 kernel + 浏览器适配器装配并注册两个内置示例主题
    （Midnight Violet 暗色带渐变背景与 slot CSS、Paper & Ink 亮色带 dark 覆盖组），内置主题走与
    第三方完全相同的 parseThemePackage 校验（有测试锁定）。设置 → 个性化新增“主题”组：主题列表
    （应用/预览/取消预览/移除）、JSON 主题包导入（校验失败展示 issue 路径）、安全模式开关、恢复
    默认按钮，以及仅编辑声明式 token 的用户覆盖编辑器（面板背景/应用背景/选中行背景/字体，
    经 validateThemeTokens 校验后写入 amll.user 层，不执行任何主题代码）。
  - Token 桥接（v0 实际接线）：`--attt-color-panel-background` → Radix `--color-panel`、
    `--attt-app-background` → appContent 背景、`--attt-lyrics-line-selected/hover-background` →
    歌词行/词选中与悬停、`--attt-spectrogram-background/playhead` → 频谱容器与播放头、
    `--attt-font-family/--attt-font-mono-family` → Radix 默认字体族、`--attt-spacing-scale` →
    Radix `--scaling`。slot 合同：app-root、background-layer、title-bar、ribbon-bar、sidebar、
    lyric-editor、preview、audio-controls、spectrogram；part：lyric-line、lyric-word。
  - 完成时全量验证：176/176 测试通过（新增 44 项：CSS 校验器 14、token 校验 5、主题包解析 6、
    ThemeService/token 编译 16、内置主题合同 1 等）、`tsc -b` 通过、`pnpm lint`（boundaries +
    Biome）通过（仅既有 13 warning + 1 info）、`plugin:api:check` 通过（协议文档已重新生成）、
    Vite production build 通过。

  阶段 5 扩展：组件级背景、强调色与可读性检测（2026-08-26）

  - Token 合同扩展：新增 `THEME_SURFACE_NAMES_V0`（titleBar、ribbonBar、dropdownMenu、
    playControls、modalLarge/Medium/Small）与 `surfaces` token 组，每个 surface 为
    `{ kind: solid|gradient|image|none, value, scrim }` 判别对象；solid 必须是安全颜色、
    gradient 必须是安全渐变、image 只能引用包内资源（`asset:<name>`，parseThemePackage 校验
    引用存在）、scrim 必须是安全颜色。模态回退链规则：backgrounds 按 小 → 中 → 大 回退，
    因此 modalMedium/modalSmall 需要 modalLarge（“可以只选最大，不能只选中/小”），校验作用于
    base 与合并 light/dark 后的有效集；`validateThemeTokens` 提供
    `requireModalFallbackChain: false` 供宿主对“主题+用户”组合配置做有效性检查。
  - Flag 门控桥接：`ThemeService` 计算有效配置（主题 tokens ⊕ 用户 tokens（none 可移除主题
    surface）⊕ 用户图片），通过 `ThemeStyleSinkPort.setFlags` 在 `<html>` 上打
    `data-amll-accent` / `data-amll-surface-*` 属性；index.css 中的桥接规则只在属性存在时生效，
    未设置的 token 永远不会重绘组件。强调色 / surfaces 的 light/dark 覆盖要求 base 定义存在
    （flag 与外观无关，否则另一外观下变量悬空）。安全模式与恢复默认会清空全部 flag。
  - 强调色：`color.accent` 一个 token 通过 color-mix 派生完整 Radix accent 量表
    （--accent-1..12、a1..a12、surface/indicator/track/contrast，亮暗两套混合基准），
    `--accent-contrast` 由内核对 hex/rgb 颜色做相对亮度计算得出黑/白。
  - Surface 背景桥：title-bar/ribbon-bar/audio-controls 走 data-slot 选择器（Card 同时桥接
    `--card-background-color`）；下拉菜单（DropdownMenu/ContextMenu/Select Content，portal 于
    slot 树外，属宿主桥接而非主题选择器）；模态按 `data-amll-modal-size` 标注分大/中/小，
    未标注 Dialog.Content 视为中、AlertDialog 视为小，CSS 变量回退链 小→中→大 且全部规则
    `:not([data-amll-protected])` —— 主题/用户永远无法重绘设置对话框等安全 UI。gradient 编译进
    `-image` 变量（background-color 无法渲染渐变），`none` 编译为 `initial`（guaranteed-invalid）
    以精确回退。
  - 用户侧能力：token 覆盖编辑器新增强调色与 7 个 surface 的纯色/渐变输入（与 token 表单一次
    校验保存；用户 token 禁止 image kind）；每个 surface 可另选一张本地图片 ——
    `ThemeService.setUserSurfaceImage` 只接受宿主生成的 `blob:` URL + 安全 scrim（信任边界注释
    明确该入口不得暴露给插件），图片 Blob 持久化在 IndexedDB（amll-theme-surfaces），启动时
    重建 Object URL，恢复默认/救援快捷键后通过订阅对账自动删除持久化条目。UI 上中/小模态输入
    在大模态未配置时禁用；内核在主题切换导致大模态丢失时丢弃中/小 flag 并告警（对话框不会
    变透明）。
  - 可读性检测（`src/kernel/theme/readability.ts`，纯函数、Node 全测）：对图片区域计算
    WCAG 相对亮度，取与文字亮度最接近的最差十分位做对比度（抓局部亮/暗斑），并用局部梯度均值 +
    亮度标准差捕捉“颜色变化极为剧烈、人眼难辨文字”的花哨背景（阈值：对比度 ≥3、梯度 ≤0.05、
    标准差 ≤0.22）；不达标时求解最小遮罩不透明度（暗字白遮罩/亮字黑遮罩，目标对比度 4.5，
    上限 0.85）。`coverCropRegion` 把组件视口矩形映射到 background-size: cover 下的图片区域。
    平台侧 `BrowserImageSampler` 负责解码/降采样/量取 slot 矩形。
  - 检测接入点：① surface 选图 —— 按组件实测尺寸（未挂载的用默认尺寸）取 cover 裁剪分析，
    不通过则自动叠加推荐遮罩并以 toast 说明原因（对比度不足/背景过于花哨）；② 全局自定义背景
    选图 —— 对 title-bar、ribbon-bar、sidebar、lyric-editor、audio-controls 五个 slot 的图下
    区域逐一检测，暗色模式自动抬高既有“遮罩”滑杆、亮色模式自动降低“透明度”滑杆到建议值并
    toast 列出不达标区域，用户可再微调。
  - 完成时全量验证：202/202 测试通过（本轮新增 26 项：可读性分析与 cover 映射 9、协议
    surfaces/模态规则/模式覆盖 5、主题包资源引用 1、ThemeService flags/图片/组合模态规则 11），
    `tsc -b`、`pnpm lint`（boundaries + Biome 基线）、`plugin:api:check`（协议文档已重新生成）、
    Vite production build 全部通过。
  - 已知取舍：强调色量表是 color-mix 近似而非 Radix 官方算法（极浅/极艳强调色下 11/12 步文字
    对比度可能欠佳）；surface 图片可读性用启动时/选择时的组件尺寸近似，窗口大幅缩放后不会重算；
    下拉菜单 surface 会影响设置对话框内的菜单（核心安全控件不是菜单，仍可操作）；主题包 surface
    图片资源同样计入 localStorage 体积上限（迁 IndexedDB 的遗留项不变）。

  阶段 5 遗留与后续阶段注意事项

  - [x] 安装主题包已从 localStorage（~5MB 配额）迁移到 IndexedDB（阶段 6 完成）：ThemeService 新增
    异步 `packageStore` 端口 + `hydrateInstalledThemes()`，首次启动自动把旧 localStorage JSON 迁入
    `amll-theme-packages` 库并删除旧键；持久化的活动主题在异步水合后重新解析生效，崩溃标记覆盖
    待水合主题。无 packageStore 端口时保留旧同步行为（既有测试不变）。迁移完成后原按
    localStorage 设计的体积上限（单资源 ≤2MB base64、CSS ≤128KB 等）可以放宽，新上限与
    分发容器格式在阶段 10 一并定档（IndexedDB origin 配额与自动保存/历史快照共享，仍需显式上限）。
  - v0 已定义但尚未桥接到组件的 token：color.accent/textPrimary/textSecondary/border/danger、
    font.scale、spacing.radius、lyrics.wordText/wordSecondaryText/wordHighlight、
    spectrogram.lineSegment/wordSegment/gapSegment/waveform（频谱段颜色需接入 canvas 调色板
    体系）。CSS 变量均已按约定名编译，后续按需在 base 层加 var() 桥接即可，不动协议。
  - [x] 阶段 6 的插件管理器（设置 → 插件）与权限授权弹窗均 portal 到 body（slot 树之外）并标记
    `data-amll-protected`，与设置对话框享有相同的防主题覆盖保证。
  - 主题编辑器 MVP 仅覆盖 4 个高频 token 的声明式输入；完整 token 编辑器与“导出为主题包”
    仍留待后续（插件管理页已落地，可在其上扩展）。
  - 定制版（阶段 9）新增 slot/part/token 名需扩展 `THEME_*_NAMES_V0` 并 bump
    THEME_TOKEN_VERSION，双方跑同一份合同测试后再冻结 v1。

  阶段 6：WASM 插件宿主

  - [x] 每个第三方插件运行在独立 Worker 中。
  - [x] 实现生命周期、RPC、调用 ID、取消、超时和 Worker 重启。
  - [x] 限制 payload、并发、日志数量和持续执行时间。
  - [x] 宿主函数逐项校验权限，WASM 不直接访问 DOM、网络和 Tauri。
  - [x] 为插件提供隔离 KV 存储。
  - [x] 实现崩溃通知、自动禁用和诊断日志。
  - [x] 提供开发模式、目录加载、热重载、Mock Host 和示例插件。

  阶段 6 完成记录（2026-08-26）

  - 调用约定（协议扩展，`packages/plugin-api`）：受 Extism `runInWorker: false` + 无
    SharedArrayBuffer 约束，宿主函数必须同步，v0 采用**回合制**模型。每次 guest 调用
    （activate/executeCommand/handleEvent/resumeForm）为一个回合，主线程随回合下发文档投影、
    选区与 KV 快照；Worker 内唯一同步宿主桥 `amll_host_call`（`extism:host/user`）解析
    `HostCallV0`→`HostResponseV0`，逐调用做 schema 校验 + capability 检查。新增
    `PluginCommandOutcomeV0`（done/showForm 判别）与 `plugin_resume_form` 导出：WASM 无法挂起
    等待用户输入，`ui.showForm` 改为命令 outcome 续体（每次命令 ≤8 轮）；同步桥内的
    `ui.showForm` 显式拒绝。新增 `FunctionPluginPackageV0` + `parseFunctionPluginPackage`
    单一信任入口（与主题包同模式）、`limit-exceeded` 错误码、共享 `document-ops`
    （MockPluginHost 与 Worker 回合宿主共用同一 op 应用实现）。协议文档已重新生成。
  - 事务与撤销保证：回合内全部 `lyrics.applyEdit` 在回合结束后由主线程经
    `PluginDocumentGateway` 合并为**一个** `EditorDocumentService` 事务（source=plugin、携带
    pluginId/label），以回合起始 revision 冲突检测——用户并发修改会拒绝整批编辑并 toast 说明；
    一次插件操作 = 一条撤销记录。插入行/词的 id 由回合种子确定性分配，Worker 侧与主线程提交
    产生完全相同的 id，guest 在回合内可立即引用自己插入的 id。投影未携带的内部字段
    （obscene/romanWarning/endTimeLink/定制扩展）因按 id 原位 patch 而完整保留（有测试锁定）。
  - 运行时（`src/plugins/runtime`）：`WasmTurnHost`（纯逻辑回合宿主，Node 全测）、
    `WasmGuestSession`（Extism 会话 + 宿主函数绑定，回合外的宿主调用被拒绝）、
    `wasm-host.worker.ts` 独立 Worker、`WasmPluginWorkerClient`（调用 ID、每回合超时→终止
    Worker、cancelAll、下次调用自动重建并重载模块、指标）。回合限额
    （`DEFAULT_WASM_TURN_LIMITS`）：宿主调用 ≤128/回合、调用 payload ≤1MB、通知 ≤16、
    applyEdit 批次 ≤16 / ops ≤10000、存储键 ≤128、单值 ≤32KB、命名空间 ≤1MB；模块 ≤32MB，
    回合超时默认 10s。并发以每插件串行队列约束（一插件一 Worker 一在途回合）。
  - 生命周期编排（`src/plugins/adapters/wasm-plugin-service.ts`，端口注入、Node 全测）：
    install（能力协商 + 持久化 + 激活）、enable/disable、uninstall（scope dispose + Worker 关闭 +
    KV 命名空间清除）、dev reload；激活失败进入 failed；命令失败通知，崩溃/超时/内部错误连续
    3 次自动禁用（持久化 + toast + crash-disabled 状态）；每插件 200 条环形诊断日志。
    `document.changed` 事件按 manifest `activationEvents: ["onDocumentChanged"]` 订阅派发，
    插件自身修改不回灌，队列中未开始的事件回合按最新事件合并（coalesce）。scope dispose 统一
    清理命令、菜单、监听器；Worker cancelAll 拒绝在途回合（覆盖阶段 4 遗留的异步 handler
    取消项）。
  - 权限与存储：授权弹窗在安装前列出插件与逐项能力说明（授权全有或全无，v0）；插件包 +
    授权状态存 IndexedDB `amll-plugins`（加载时重跑 parseManifest，损坏记录丢弃）；隔离 KV 存
    `amll-plugin-kv`（复合键 [pluginId, key]，读写按命名空间隔离，配额在 Worker 侧先行强制）。
    WASM 无 DOM/网络（Extism allowedHosts 为空）/文件系统/Tauri 访问面。
  - 宿主 UI：设置新增“插件”页（列表/状态/能力徽章/启停/卸载/诊断日志/导入 JSON 插件包/一键
    安装示例插件），设置对话框本身 data-amll-protected；权限弹窗独立 portal 到 body 并标记
    data-amll-protected。开发模式（支持 File System Access 的浏览器）：选择目录（manifest.json +
    入口 wasm）加载为会话级 dev 插件，轮询 lastModified 热重载，可手动立即重载；dev 加载与
    文件导入、示例安装共用 `installPluginPackage` 单一解析闸门与授权弹窗。
  - 菜单位置补全（2026-08-27 修复）：此前只有 menu.edit 渲染 `ContributionMenuItems`，插件对
    menu.tool/menu.file/menu.help 与 context.lyricLine/context.lyricWord 的贡献注册成功但不可见。
    现五个位置全部接入（右键菜单走 ContextMenu 变体），分隔线只在存在可见贡献项时渲染。
  - 示例插件与合同测试：`examples/plugins/sample-tools`（Rust + extism-pdk + serde_json，
    `pnpm plugin:build:sample` 构建，产物 fixture 已提交）演示 trimWords（读文档 → 单事务
    编辑 → 通知 → KV）与 wordCount（showForm outcome → resume 统计）。真实宿主栈
    （EditorDocumentService + PluginDocumentGateway）通过与 MockPluginHost 完全相同的
    `runHostContractTests` 合同套件；`WasmGuestSession` 直接以真实 wasm fixture 在 Node 中
    测试全链路（激活、命令、权限拒绝、表单续体、效果队列、配额）。
  - 完成时全量验证：264/264 测试通过（新增 52 项：回合宿主 9、真实 wasm 会话 3、Worker
    客户端 6、文档投影/网关 8、真实宿主合同 4、服务生命周期 7、document-ops 4、插件包/outcome/
    表单结果解析 7、主题包迁移 4）；`tsc -b`、`pnpm lint`（boundaries + Biome 基线 13 warning +
    1 info）、`plugin:api:check`（协议文档已重新生成）、Vite production build（wasm-host.worker
    独立 chunk）全部通过。
  - 已知取舍：applyEdit 的成功响应在回合内是乐观的（以回合本地 revision 计），若提交时发生
    revision 冲突则整批拒绝并通知（插件下次读取会看到真实状态）；跨多个表单轮次的编辑按回合
    分别成交（典型流程编辑集中在最后一轮，仍是单撤销记录）；`document.undo/redo` 与
    `selection.changed` 事件类型暂未派发（协议已定义）；能力授权为整包确认，无逐项开关；
    Tauri 端 File System Access 不可用时开发模式区块自动隐藏。

  阶段 7：文件与格式插件化

  - [x] 将平台文件选择能力和歌词格式处理拆开。
  - [x] 建立 FileProvider 与 LyricFormatPlugin 接口。
  - [x] 将 TTML、LRC、YRC、QRC 等注册为格式 provider（粒度见下方 2026-08-27 澄清）。
  - [x] 文件流程统一处理 dirty 确认、项目 ID、文件名、导入事务和导出校验。
  - [x] Web 使用 File API/IndexedDB，Tauri 使用平台 adapter（范围调整见完成记录）。
  - [x] 文件和格式插件不得绕过文档事务服务。

  格式插件化粒度澄清（2026-08-27）：插件化的单位是"provider 注册"，不是"实现打包"。
  现状为两个整体 wasm-bindgen 包加一个 TS 实现：TTML 由自有 ttml-processor wasm 承担
  （parse/generate/降级 AMLL 结构），ESLRC/QRC/YRC/LYS/ASS 的 parse/stringify 全部来自
  上游 @applemusic-like-lyrics/lyric 单一 wasm 包，LRC 为 TS（lrc-import-engine）。
  不拆分这些整包：由单一 builtin scope（如 core.formats）注册多个格式 provider，每个
  provider 是包内函数的薄 adapter（与 core.modes 一个 scope 注册三个内置模式同一先例）。
  这些 wasm-bindgen 包是主线程内部库，不是 Extism 沙箱插件，也不改造成沙箱插件——
  builtin 档不为受信任代码付 Worker/序列化成本。TTML 是宿主原生序列化格式（保存/
  自动保存/提交管线依赖），注册为不可卸载 provider（与 Edit 模式 fail-safe 同先例）；
  其余格式 provider 可禁用，禁用后对应导入/导出菜单命令随 scope 消失。第三方格式插件
  经 extism-wasm 功能插件以新 capability（如 lyrics.format：文本 ↔ 文档结构）接入，
  注册进同一 provider registry，走同一文件流程与导入事务路径。

  阶段 7 完成记录（2026-08-27）

  - 协议（kernel）：`src/kernel/formats/LyricFormatProvider.ts` 定义 provider 合同
    （formatId/LocalizedText title/extensions/mimeType/importer/exporter）与
    `LyricFormatHandledError`（provider 已自行向用户展示错误时抑制通用 toast）。
    `ContributionRegistry` 新增 `format-provider` contribution：formatId 全局唯一、
    extensions 归一化（小写去点）、至少一个方向、plugin owner 强制命名空间前缀；
    `hostNative`（TTML）仅限 trusted owner、必须双向、全局唯一，扩展名冲突时优先解析；
    getter：getFormatProviders/getFormatProvider/getHostNativeFormatProvider/
    findFormatProviderForExtension。
  - 平台文件端口：`src/kernel/platform/FileDialog.ts` 定义 `FilePickerPort`/
    `TextFileSaverPort`/`HostOpenedFile`；`src/platform/files/BrowserFileDialog.ts`
    以 File API + save-file 实现（Web 与 Tauri WebView 通用）；
    `src/platform/files/TauriStartupFile.ts` 承接 Tauri 启动参数文件
    （`get_open_file_data`），`invoke` 调用移出 App.tsx。范围调整：Tauri 端文件
    选择/保存沿用 WebView 内 File API（现状即如此，仓库无 tauri fs/dialog 插件），
    "Tauri 平台 adapter"落地为启动文件源；如未来需要原生对话框，仅需替换这两个端口实现。
  - 统一文件流程：`src/plugins/adapters/lyric-file-flow.ts`（纯类、端口注入、Node 全测）
    统一 dirty 确认（原 4 处副本收敛为 confirmIfDirty）、项目 ID 匹配、文件名推导、
    单一导入 replace 事务（source=user + expectedRevision）、导出前/后校验（空文档阻止
    导出、空输出报错）与音频元数据合并事务；`lyric-file-flow-host.ts` 装配浏览器端口 +
    editorDocumentAdapter + registry（音频引擎按需动态加载，模块可在 Node 导入）。
    纯业务决策拆入 `src/application/lyrics/LyricFileService.ts`（resolveImportedProjectId/
    resolveImportedFileName/mergeExtractedLyricMetadata/导出 issue 检查）。
    `useFileOpener` 变为流程薄封装（拖拽/剪贴板/音频选择器调用点不变）；
    ImportFromText 与 LRCLIB 导入迁移到 commitImportedLyric（纯文本导入现在也会
    重置项目 ID 并走统一流程）；新建/打开/保存/剪贴板保存/错误页救援保存全部经流程
    （错误页此前硬编码 "lyric.ttml" 的问题一并修复）。
  - 内置 provider：`src/plugins/builtin/formats`（scope `core.formats`，终生存活）注册
    ttml（hostNative，text/xml，错误走既有 TTML 错误对话框）、lrc（TS parse + 上游
    stringify）、eslrc/qrc/yrc/lys（上游 wasm 双向）、ass（仅导出）；重实现全部动态
    import。行为变化：导出 ESLyRiC 现在产出 .eslrc 扩展名（原实现误用 .lrc）。
  - 命令与菜单：`src/plugins/adapters/format-commands.ts` 依据 registry 自动派生
    `core.formats.import/export.<formatId>` 命令（含中英双语标题），provider 消失时
    reconciler 同步销毁命令——"禁用格式 → 菜单命令消失"由 scope dispose 机制保证；
    ImportExportLyric 子菜单改为完全由 registry 驱动（含第三方 provider 自动出现），
    菜单项只引用 command ID，标签用通用 i18n 模板 + provider 本地化名称
    （新增 fromFormatFile/toFormat 与导出错误文案的 zh-CN/en-US 键）。
  - 第三方格式插件（lyrics.format capability）：协议新增 `lyrics.format` capability、
    manifest `contributes.formats`（id 强制插件命名空间前缀、需声明该 capability、
    至少一个方向、扩展名 ^[a-z0-9]{1,16}$、每插件 ≤8）、guest 导出
    `plugin_convert_format`（`ConvertFormatParamsV0`：import 收文本，export 收文档投影）
    与 `FormatConversionResultV0`（imported: NewLineV0[]+metadata / exported: text，
    schema 校验且 kind 必须匹配方向；导入文本上限 1MiB 与运行时回合 payload 上限一致）。
    转换回合是纯回合：`WasmTurnContext.editsAllowed=false`，回合内 lyrics.applyEdit
    被拒——导入结果由宿主文件流程作为一次导入事务提交，格式插件无法绕过文档事务服务。
    `WasmPluginService` 激活时把 manifest formats 注册进同一 provider registry
    （能力未授予则跳过并记诊断日志），导入结果经 `createDocumentFromPluginLines`
    生成稳定 id；转换失败沿用崩溃计数/自动禁用但不重复 toast（文件流程统一报错）；
    provider 与派生命令随插件禁用/卸载消失、重启用恢复。协议文档已重新生成。
  - 附带修复：`src/utils/keybindings.ts` 的全局按键监听改为仅在浏览器宿主安装，
    使宿主注册链（extension-host/keyboard registry）可在 Node 测试中导入。
  - 完成时全量验证：296/296 测试通过（新增 32 项：format registry 合同 6、
    LyricFileService 6、统一文件流程 11、命令 reconciler 2、内置 provider（含真实
    ttml-processor wasm 与上游 wasm 在 Node 中的往返）4、协议 formats/转换结果 2、
    服务端格式插件全链路 1），`tsc -b`、`pnpm lint`（boundaries + Biome 基线
    13 warning + 1 info）、`plugin:api:check`（协议文档已重新生成）、Vite production
    build 全部通过。
  - 已知取舍：浏览器文件选择器取消时 Promise 不 resolve（与旧 input 行为一致，无泄漏）；
    Ctrl+O 的音频路径依赖 `HostOpenedFile.asFile`（Tauri 启动参数等纯文本来源不支持
    音频，与旧行为差异可忽略）；历史恢复（HistoryRestore）按"恢复"语义保留自身
    replace 路径，不经导入流程；wasm 格式插件的示例（Rust sample）与开发文档留待
    阶段 8 批量迁移时一并补充。

  文件系统耦合较强，应晚于事务、命令和权限系统迁移。

  阶段 8：批量迁移外围功能

  推荐顺序：

  1. 简单编辑工具和辅助工具。
  2. 元数据、Ruby、分词。
  3. 帮助、设置和更新。
  4. 文件与格式支持。
  5. 网络服务、GitHub、Review 等定制功能。

  每迁移一个功能，都要求旧入口删除、插件禁用后功能消失、重新启用后状态恢复。

  阶段 9 前置决策（2026-08-26）：审阅功能的受信任插件分发

  背景与结论：审阅功能是测量驱动的命令式 React UI（FLIP 卡片展开、DOMRect/WAAPI 动画、
  标题栏动作组、独立审阅模式），无法在声明式/WASM 档表达，只能以受信任插件承载；其用户
  仅限通过身份验证的上游审阅者，且代码已在公开分支上（无保密价值）。因此采用
  “资格门控的远程分发 + 受信任加载”，收益是发布解耦、包体卫生与权限门控，而非藏代码。
  该决策同时是 trusted-js 档的第一个实例，注意当前 ContributionRegistry 中 plugin owner
  一律 trusted: false，trusted-js 尚未接线，需在此处一并放开（仅对通过本闸门加载的包）。

  信任模型（分发方式 / 信任等级 / 使用资格三维正交）：

  - 信任锚是代码完整性而非登录态：认证只决定是否下载，完整性决定是否执行。
  - Web 端（MVP 范围）：远程分发实现为同源 ES module 动态 import——认证后从资格接口取
    入口清单，import() 自身 origin 下的模块。TLS + 同源 + 服务端鉴权已提供与主应用等同的
    信道完整性（服务器沦陷时主包同样可被篡改，插件不引入新面），因此 MVP 不建签名/撤销/
    包缓存基础设施；CSP 维持 script-src 'self'，禁止 fetch+eval。
  - Tauri 端（MVP 禁止）：桌面信任根是安装二进制，远程 JS 可触达 Tauri IPC，爆炸半径远
    大于浏览器。如未来开放，必须补齐二进制内固定公钥 + 分离签名 + 版本/撤销清单（届时才
    建签名流水线）；在此之前桌面审阅用户使用浏览器版本。
    （2026-08-27 再校准：已取代——桌面改为 consent 门控，见"阶段 9/10 信任模型再校准"。）
  - 一旦载入即为应用全权（可读全部 atom、PAT、调用宿主能力），与 builtin 无隔离差异；
    所有防护均作用于“载入之前”，因此加载闸门必须唯一且可测试。

  工作项：

  - [x] 远程受信任插件加载器（web-only）：同源动态 import → 注册进 trusted 等级 scope
    （owner.trusted: true）；scope dispose 全量清理 contribution 与监听器。资格/认证清单
    接口属"后端实化"里程碑，当前为同源静态清单薄片（2026-08-28 调序决策）。
  - [x] 单一加载入口：`TrustedJsPluginService.load()` 是唯一把远程/捆绑 JS 变成 trusted
    scope 的闸门（同源校验 → apiVersion 协商 → 桌面 consent 闸门 → 诚实 consent →
    崩溃标记护卫的 import/activate），不存在第二条路径。
  - [ ] 平台硬门禁（分层）（2026-08-27 再校准：本项已取代——桌面改为"默认关闭 + 运行时
    consent 闸门"，编译期剔除降级为可选构建选项，见"阶段 9/10 信任模型再校准"）：
    安全边界在编译期——桌面构建经 import.meta.env.TAURI_ENV_PLATFORM
    静态替换 + tree-shaking 物理剔除远程加载模块，CI 对桌面产物断言剔除生效（如加载器内
    标记字符串不得出现在 bundle 中）；加载器入口保留运行时 Tauri 检测抛错作纵深防御。
    服务端按客户端平台标记不向桌面返回插件清单，仅作资格/运营用途（灰度、kill switch）——
    客户端标记可伪造且服务器本身在威胁模型内，不得作为安全依据。
    （2026-08-28：替代形态已实现——桌面 consent 闸门默认关闭，见完成记录。）
  - [x] 加载器只接受自身 origin 的模块 URL，不提供"从任意 URL 加载"能力；清单协议在
    schema 层就无法表达带 scheme/绝对路径/点段的 entry。开发模式经 Vite dev server
    同源提供，无需独立 flag。
  - [x] 故障回退：复用主题系统崩溃标记模式（load 前落 pending 标记、宿主 mount 稳定
    5s 后清除；上一会话异常终止计入崩溃数，连续 3 次自动禁用）；加载时执行 apiVersion
    协商，不匹配直接拒绝。
  - [ ] 审阅功能拆分随迁：页面壳/动画/标题栏动作组留在受信任视图内；report-service、
    filter-service、operation-log 格式化等纯逻辑按 application service 既有模式拆干净，
    不强行下沉 WASM。

  阶段 9/10 信任模型再校准（2026-08-27 定稿）

  背景：本工具用户量不足五位数；内容完整性的真正防线在上游（业务 API 服务端鉴权 +
  人工审阅），凭据滥用的防线在 GitHub PAT scope（阶段 10 第一条承重原则已确立此立场）。
  据此把安全投入按真实威胁模型重新定档：防"高级恶意攻击者"的增量基础设施停止新建；
  防"善意但有 bug 的插件"的健壮性设施（事务层、Worker 隔离、超时/崩溃自动禁用、
  单事务撤销）与已建成的沙箱档全部保留——前者的敌人出现概率随用户量缩放，后者恒为 1。

  决策：

  - 已建成的 WASM 沙箱档原样保留（零边际成本），定位为"无脑安装"档：坏插件最多自己
    崩溃，碰不到账号与系统。该档是低心智负担安装转化的前提，不是多余的防御。
  - trusted-js 档提前并放宽向第三方开放：准入从重资格门控放宽为"诚实 consent +
    来源展示"（作者名/仓库链接，或轻量的社区已知作者名单）；不建签名流水线。
    审阅插件的资格门控保留，但定位是运营/资格控制，不再是该档唯一准入通道。
  - 桌面端 trusted-js 由"MVP 禁止"改为 consent 门控：默认关闭，用户显式同意后启用；
    原"编译期物理剔除"条款作废（可降级保留为构建选项），运行时 Tauri 检测抛错改为
    运行时 consent 闸门。
  - 用户提示语按三档如实定价（浏览器保护的是系统、不是账号，措辞不得混淆两者）：
    1) WASM 插件 / 主题：随便装，坏插件最多自己崩溃，碰不到你的账号和系统；
    2) JS 插件（浏览器）：可在本应用内以你的身份行事（读改数据、使用你的登录），
       但碰不到你的电脑；
    3) JS 插件（桌面）：在 2) 之外还可能危害你的系统——请像"安装一个软件"一样对待。
  - 缓建清单（插件生态数量证明需求后再评审）：第三方 iframe/webview UI 沙箱面、
    QuickJS guest SDK、桌面签名流水线。QuickJS 路线结论备查：与 PDK 共享同一信任档与
    协议，属 SDK 增量而非架构变更（方案 A：插件自带解释器，宿主零改动）。
  - 两条不随规模松动的红线：
    1) 凭据（PAT/登录态）由宿主持有，不进插件可读存储、不进文档投影；trusted-js 的
       consent 文案必须如实包含"该插件可读取你的登录凭据、可以你的身份操作"；
    2) 业务 API 鉴权在服务端、不信任客户端（阶段 10 既有原则，不变）。
  - 风险自知：小社区信任集中且脆弱，一次"插件偷 token"事故的损害不按用户数摊薄；
    上述红线 + 诚实措辞即为此保留的最低纪律。
  - 本节取代的先前条款：阶段 9 前置决策"Tauri 端（MVP 禁止）"与工作项"平台硬门禁
    （编译期剔除）"；阶段 10 分档差异中"trusted-js 货架第一方专属"（调整为：第三方
    trusted-js 可上架，走 consent + 来源展示；签名档仍为未来桌面强化项）。

  工作顺序调整与定制版分支退役（2026-08-28 定稿）

  背景：阶段 0–7 已建成全部底层边界（事务层、命令/contribution registry、WASM 宿主、
  格式 provider、单一安装闸门），"不要从插件管理页/应用市场开始"的早期警告前提已失效。
  为让每个迁移出来的插件都能立即通过真实分发管线做接续测试，把阶段 8/9/10 的执行顺序
  重排如下（各阶段的工作项清单与验收条件不变，只变先后）：

  1. **远程受信任插件加载器先行**（原阶段 9 前置工作项提升为独立里程碑）：单一
     parse/注册闸门、consent 展示（按上文三档措辞）、崩溃标记回退（复用主题系统模式）、
     apiVersion/capability 协商、scope dispose 全清理。Web 先行；桌面 consent 闸门同批
     实现但默认关闭。
  2. **商店薄片**：同源静态清单（CI 构建时生成）+ 内容寻址 zip artifact + 商店页面
     （复用 installPluginPackage / parseThemePackage 既有闸门）。账号资格、发布强认证、
     审计、kill switch、灰度等重后端缓建，但两条不可变红线（内容寻址、不按用户个性化
     生成）自薄片起遵守，后端实化时客户端零改动。
  3. **试点迁移**：以 `builtin.time-shift`（已是声明式闭环）走全链路——随包 factory 版 +
     商店更新 shadow + 卸载回退出厂，验证更新机制。
  4. **批量迁移非核心内置功能**（阶段 8 推荐顺序沿用）与定制功能插件化。
  5. **后端实化**（账号资格、kill switch、审计）安排在审阅插件上架前完成。

  三条设计修正（对先前条款的约束）：

  - 出厂副本原则：非核心内置功能迁移为插件后仍随应用打包（factory 版），商店只是
    **更新与增量安装通道**（Android 系统应用更新模型：清单版本更高时 shadow 出厂版，
    卸载更新回退出厂版）。商店不可用 = 没有更新，功能不缺席；桌面端与离线场景不受
    trusted-js consent 门控影响。第一方随包插件与主包同信任根，免 consent 弹窗。
  - 清单协议只有一份：trusted-js 与 WASM 两档共用同一清单/目录 schema（入参
    platform/appVersion/pluginApiVersion 过滤），避免商店接入第二档时改协议。
  - API v0 未冻结期间，远程分发插件由 CI 与应用版本联动发布，清单协商过滤不兼容版本；
    该字段自静态薄片起进 schema。

  定制版分支退役：插件系统实现完成并投入运行后，**不再维护定制版分支**——原定制功能
  全部以插件形式运行在上游基座上，上游基座 + 插件是唯一分发形态。由此：

  - 阶段 9 更名为"定制功能插件化"，删除以双宿主长期并存为前提的工作项
    （"实现定制版 EditorHostAdapter"作废；"cherry-pick 至定制版分支"改为一次性
    过渡手段，最终以插件基座覆盖定制版分支的既有条款即为终态）。
  - API v1 冻结条件由"上游版与定制版共同通过协议合同测试"改为：**上游宿主 + 全部
    原定制功能插件（含审阅、GitHub、歌词站、NCM）通过协议合同测试**。
  - 本节取代阶段 9 中相应条目，下方清单已按此更新。

  远程受信任插件加载器完成记录（2026-08-28，调序里程碑 1）

  - 协议（packages/plugin-api）：新增 `RemotePluginCatalogV0` 远程清单协议——trusted-js、
    extism-wasm 与 theme 三档共用同一 schema（修正三落地），entry 字段在 schema 层只能
    表达相对路径（禁 scheme/绝对路径/`//`/反斜杠），parser 再拒点段与重复插件 id；含
    apiVersion、sha256（内容寻址预留）、platforms（运营过滤，非安全依据）、minAppVersion
    与 firstParty 字段。`parseRemotePluginCatalog` 为单一解析入口，schema 已并入
    SCHEMA_CATALOG，协议文档已重新生成。
  - 内核（ContributionRegistry）：`ContributionOwner` 的 trusted-js plugin owner 现可
    `trusted: true`（仅由加载闸门授予）——可注册 mode、trusted view、toolbar/sidebar，
    同时保留 plugin 供来源展示与命名空间强制（命令/菜单仍限 `pluginId.` 前缀）；
    extism-wasm owner 恒为 trusted: false，第三方 WASM 的 MVP 限制不变。
  - 加载器（src/plugins/trusted/trusted-js-service.ts，纯逻辑、端口注入、Node 全测）：
    load() 顺序执行 already-loaded/apiVersion/同源解析/桌面闸门/崩溃门/consent 检查后才
    import；activate(context) 收 { pluginId, entry, scope, host }，可返回 cleanup；
    unload = cleanup + scope.dispose。崩溃标记（主题系统模式）：import 前落 pending，
    宿主 mount 稳定（5s 计时，与 ThemeHost 相同）后清除并归零崩溃数；上一会话遗留的
    pending 计为一次崩溃，连续 3 次自动禁用（resetFailures 可解）。consent 每插件一次
    并持久化，拒绝不持久化；firstParty（CI 随应用发布）免 consent。桌面
    （TAURI_ENV_PLATFORM）默认拒绝所有 trusted-js 加载，须显式打开
    `amll-trusted-js-desktop-enabled` 运行时闸门。
  - 宿主装配（trusted-js-host.ts）：`import(/* @vite-ignore */ url)` 同源动态导入；
    loader 状态存 localStorage（读写全部异常护栏，配额失效仅降级崩溃记账、不降级信任
    检查）；host API 暴露 editorDocumentAdapter/选区/声明式表单/通知——trusted-js 插件
    经文档事务服务修改歌词，保持单事务单撤销与来源标记。启动时 fetch 同源
    `plugins/catalog.json`（no-store）：缺失/不可达/校验失败一律静默或告警后跳过，
    商店不可用不影响编辑器。
  - Consent UI（TrustedJsConsentDialog）：portal 到 body + data-amll-protected（与
    WASM 权限弹窗同级防主题覆盖），措辞按三档如实定价——浏览器档明说"以你的身份行事、
    读取登录凭据"，桌面档追加"可能危害你的系统"；展示作者与主页（来源展示要求）。
  - 测试与验证：新增 25 项 Node 测试（清单协议 6、加载器闸门 12、registry trusted-js
    owner 3、Mock Host 合同套件 4——见下条）；`tsc -b`、`pnpm lint`（boundaries +
    Biome 基线 13 warning + 1 info）、`plugin:api:check`（协议文档已重新生成）、
    Vite production build 全部通过。
  - ⚠️ 重要发现：本轮开始时工作区**不含任何测试文件**（0 个 spec/test），且
    `packages/plugin-api/tests` 缺失导致 `pnpm lint` 在干净检出上直接崩溃——goal.md
    各阶段"N/N 测试通过"记录对应的测试套件不在当前分支提交中（推测遗留在另一工作区
    未提交）。本轮已重建 `tests/contract/mock-host.spec.ts`（复用仓库内现成的
    `runHostContractTests` + `MockPluginHost`）使 lint 恢复可用；其余各阶段测试套件
    需要从原工作区找回或按记录重建，列为独立待办。
  - 已知取舍：桌面闸门目前无设置页开关（只有 localStorage 键，UI 随商店页补）；
    桌面闸门同样拦截 firstParty 远程条目（保守取向，桌面第一方随包插件应走编译内置而非
    远程加载）；清单的 minAppVersion/sha256 暂未在客户端强制（静态薄片阶段由 CI 保证，
    后端实化时启用校验）；同版本 shadow/出厂回退属里程碑 3（试点迁移）范围。

  阶段 9：定制功能插件化（原"移植定制版"，2026-08-28 按上文调整）

  - [ ] 将插件事务接入 review operation log（以审阅插件内的 operation log 形态实现，
    不再依赖定制版宿主）。
  - [ ] 为 agents、vocalTags、多语言和 songPart 增加 capability。（不作为原生能力提供，而是作为插件接入现有体系，对应修改插件系统的作用范围）
  - [ ] 通知中心、设置页扩展和复杂对话框按 trusted-js 插件 contribution 形态承接
    （原"对接定制版通知中心"）。
  - [ ] 将 GitHub、Review、歌词站和 NCM 功能迁移为外置插件（非必须功能，且涉及版权或数据安全风险，不内置）。
  - [ ] 上游宿主 + 全部原定制功能插件通过协议合同测试后，才冻结 API v1。
  - [ ] 全部定制功能插件化完成后，以插件基座版本覆盖定制版分支并停止维护该分支；
    原定制功能经商店分发。

  阶段 10：插件商店后端（2026-08-27 要求定稿）

  两条承重原则：

  - 商店的“不分发”不是访问控制：插件代码公开（GPL/公开分支），任何资格用户可见 artifact
    URL。安全闸门必须在审阅等业务 API 自身的鉴权上——即使有人手动加载插件代码，无资格账号
    调用后端必须被拒。任何业务安全性不得依赖“用户看不到这个插件”。
  - trusted-js artifact 必须不可变、内容寻址、仅由 CI 发布、对所有用户字节一致——四个属性
    共同支撑“同源 = 与主应用等信任”的论证，缺一不可。

  - [ ] 身份与资格：复用歌词站账号体系（reviewPermission）；插件在商店侧声明所需资格，
    清单接口每会话重新校验；资格收回后下一次清单即不返回该插件（对接客户端“资格失效 →
    scope dispose”）；插件代码不内嵌任何秘密，运行时以用户自身凭据调业务 API。
  - [ ] 发布流水线：trusted-js 档只接受 CI 从打 tag 的源码构建发布，记录 commit hash →
    artifact hash 溯源；版本不可覆盖重传，下架用 kill switch；发布操作走独立强认证（受限
    发布账号 + 2FA）并留审计日志；artifact 元数据 schema 预留签名字段（未来桌面签名档免迁移）。
  - [ ] 同源交付：trusted-js artifact 从应用自身 origin（同域路径或应用域名反代）提供，
    CDN 只能藏在应用 origin 之后回源，不得成为独立脚本 origin（否则 CSP script-src 'self'
    被迫放开）；内容寻址 URL + immutable 长缓存；清单接口 no-store/秒级缓存，保证 kill
    switch 下次刷新即生效。
  - [ ] 清单与版本协商：入参 platform/appVersion/pluginApiVersion，按兼容矩阵过滤返回
    （入口 URL、版本、所需 capability）；对 platform=tauri 不返回 trusted-js 条目（运营性
    过滤，非安全依据）；支持灰度发版与按用户锁版本。
  - [ ] 运营控制：插件/版本级 kill switch；发布、资格授予/回收、kill 操作全量审计；客户端
    崩溃自动禁用机制可选上报，除此之外遥测最小化。
  - [ ] artifact 一致性红线：禁止服务端按用户个性化生成代码，同版本对所有用户字节一致
    （缓存有效、审计可用 hash 回答、杜绝把用户 token 烘进代码下发）；个性化一律走数据 API。
  - [ ] 分档差异：trusted-js 货架第一方专属（桌面签名档建成前无第三方进入受信任层的通道）
    （2026-08-27 再校准：放宽——第三方 trusted-js 可上架，走 consent + 来源展示，见
    "阶段 9/10 信任模型再校准"）；
    WASM/主题包货架以客户端校验（parseThemePackage、WASM 沙箱）为边界，后端做托管、元数据、
    账号实名与上传时复验客户端同款体积上限（主题包已迁 IndexedDB，上限重新定档后两端同步）；
    两个货架发布通道分离。
  - [ ] 可用性：商店不可用不影响编辑器——清单请求失败 = 功能缺席，不进入错误循环；插件
    对应用永远是可选增强。
  - [ ] 包容器格式（2026-08-27 定稿）：按用途而非体积双路径——本地手写导入用 base64-JSON
    （保留设置页粘贴导入体验，维持既有紧上限，从构造上封死大包进 JSON 路径与 base64 内存
    问题）；商店分发一律 zip（固定布局：根下 manifest.json + assets/，加固解包：entry 名单
    由 manifest 派生、解压前校验展开体积上限、拒绝重复 entry 与路径分隔符，建议 fflate 类
    审计过的库）。两条路径只是容器剥离前端，各自产出 manifest + Uint8Array 资源后汇入同一个
    parseThemePackage 信任边界，语义校验永远只有一份；格式识别用 magic bytes（PK\x03\x04 vs
    `{`），不用扩展名或用户选择；手写 JSON 上架由打包脚本一键转 zip，商店后端只面对单一
    artifact 格式；IndexedDB 落盘统一为 manifest JSON + 二进制 Blob，不存 base64。

  MVP 完成标准

  MVP 应能安装一个主题插件和一个 WASM 功能插件；功能插件能注册菜单、打开声明式表单、修改歌词并完整撤销；主题能安全替换视觉 token；插件超时或崩溃不会破坏编辑器；Web 和 Tauri 均通过冒烟测试。

  第一批实际提交建议依次为：架构 ADR 与 Extism PoC、编辑器事务层、Plugin API、命令/菜单 registry、首个内置插件、主题系统、WASM 宿主。不要从插件管理页面或应用市场开始，它们依赖的底层边界尚未建立。
