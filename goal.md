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

  阶段 4 安全审计与加固（2026-08-25，Claude + 本机 codex 交叉审计）

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

  - 安装主题包目前整包存于 localStorage（含 base64 资源），受 ~5MB 配额限制；阶段 6 插件管理
    落地时应迁移到 IndexedDB（可复用 `ManagedResource` 与 idb adapter 模式）。
  - v0 已定义但尚未桥接到组件的 token：color.accent/textPrimary/textSecondary/border/danger、
    font.scale、spacing.radius、lyrics.wordText/wordSecondaryText/wordHighlight、
    spectrogram.lineSegment/wordSegment/gapSegment/waveform（频谱段颜色需接入 canvas 调色板
    体系）。CSS 变量均已按约定名编译，后续按需在 base 层加 var() 桥接即可，不动协议。
  - 阶段 6 的插件管理器与权限弹窗 UI 必须 portal 到 body（slot 树之外）并标记
    `data-amll-protected`，即可自动获得与设置对话框相同的防覆盖保证。
  - 主题编辑器 MVP 仅覆盖 4 个高频 token 的声明式输入；完整 token 编辑器与“导出为主题包”
    留待插件管理页一起做。
  - 定制版（阶段 9）新增 slot/part/token 名需扩展 `THEME_*_NAMES_V0` 并 bump
    THEME_TOKEN_VERSION，双方跑同一份合同测试后再冻结 v1。

  阶段 6：WASM 插件宿主

  - [ ] 每个第三方插件运行在独立 Worker 中。
  - [ ] 实现生命周期、RPC、调用 ID、取消、超时和 Worker 重启。
  - [ ] 限制 payload、并发、日志数量和持续执行时间。
  - [ ] 宿主函数逐项校验权限，WASM 不直接访问 DOM、网络和 Tauri。
  - [ ] 为插件提供隔离 KV 存储。
  - [ ] 实现崩溃通知、自动禁用和诊断日志。
  - [ ] 提供开发模式、目录加载、热重载、Mock Host 和示例插件。

  阶段 7：文件与格式插件化

  - [ ] 将平台文件选择能力和歌词格式处理拆开。
  - [ ] 建立 FileProvider 与 LyricFormatPlugin 接口。
  - [ ] 将 TTML、LRC、YRC、QRC 等实现注册为格式插件。
  - [ ] 文件流程统一处理 dirty 确认、项目 ID、文件名、导入事务和导出校验。
  - [ ] Web 使用 File API/IndexedDB，Tauri 使用平台 adapter。
  - [ ] 文件和格式插件不得绕过文档事务服务。

  文件系统耦合较强，应晚于事务、命令和权限系统迁移。

  阶段 8：批量迁移外围功能

  推荐顺序：

  1. 简单编辑工具和辅助工具。
  2. 元数据、Ruby、分词。
  3. 帮助、设置和更新。
  4. 文件与格式支持。
  5. 网络服务、GitHub、Review 等定制功能。

  每迁移一个功能，都要求旧入口删除、插件禁用后功能消失、重新启用后状态恢复。

  阶段 9：移植定制版

  - [ ] 通过独立提交逐批 cherry-pick plugin API、kernel 和 runtime，避免整体合并大分支。
  - [ ] 实现定制版 EditorHostAdapter。
  - [ ] 将插件事务接入 review operation log。
  - [ ] 为 agents、vocalTags、多语言和 songPart 增加 capability。
  - [ ] 对接定制版通知中心、设置页和复杂对话框。
  - [ ] 将 GitHub、Review、歌词站和 NCM 功能迁移为内置插件。
  - [ ] 上游版与定制版共同通过协议合同测试后，才冻结 API v1。

  MVP 完成标准

  MVP 应能安装一个主题插件和一个 WASM 功能插件；功能插件能注册菜单、打开声明式表单、修改歌词并完整撤销；主题能安全替换视觉 token；插件超时或崩溃不会破坏编辑器；Web 和 Tauri 均通过冒烟测试。

  第一批实际提交建议依次为：架构 ADR 与 Extism PoC、编辑器事务层、Plugin API、命令/菜单 registry、首个内置插件、主题系统、WASM 宿主。不要从插件管理页面或应用市场开始，它们依赖的底层边界尚未建立。
