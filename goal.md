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

  - [ ] 扩展现有 keyboard registry，使 command 同时包含 handler、enablement、来源和清理逻辑。
  - [ ] 菜单项只引用 command ID，不直接保存回调。
  - [ ] 建立菜单、工具栏、侧栏、设置页和对话框 contribution registry。
  - [ ] MVP 只开放命令、菜单、通知和声明式表单。
  - [ ] 第三方插件不得注入 React 组件或任意 HTML。
  - [ ] 内置插件可以注册受信任 React view contribution。
  - [ ] 插件卸载时必须自动清理全部 contribution 和事件监听器。
  - [ ] 将 `src/modules/settings/states/custom-background.ts` 的 Jotai、IndexedDB、localStorage
    迁移、fetch 与 Blob URL 生命周期拆到 platform storage/resource adapter；与主题系统的资源生命周期一并设计。

  首个迁移对象建议选择“时间平移”一类工具，能同时验证菜单、表单、文档事务、撤销和通知。

  阶段 5：主题系统

  - [ ] 建立版本化 design token schema。
  - [ ] 为核心组件暴露稳定的 data-slot、data-part 或 CSS Parts。
  - [ ] 使用 @layer amll.base, amll.theme, amll.user 管理覆盖顺序。
  - [ ] 支持亮色、暗色、字体、间距、歌词、频谱和背景等 token。
  - [ ] 使用 CSS parser 校验扩展 CSS，禁止 @import、远程 URL 和越界选择器。
  - [ ] 将主题资源转换为本地 Blob URL。
  - [ ] 权限弹窗、插件管理和恢复入口放在不可被主题覆盖的区域。
  - [ ] 实现安全模式、主题预览、恢复默认和用户 token override。
  - [ ] 主题编辑器只编辑声明式 token，不执行主题代码。

  验收条件：损坏或恶意主题不能隐藏安全 UI，应用重启后可以恢复默认主题。

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
