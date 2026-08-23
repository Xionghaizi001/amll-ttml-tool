• 下面这份清单按依赖顺序排列。核心原则是：先建立内核边界和稳定协议，再接 Extism；先迁移一个完整功能闭环，再批量插件化。

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
  - [ ] 禁止新增代码直接写 lyricLinesAtom，通过 lint/import boundary 约束。
  - [ ] 分模块迁移现有直接写入点：编辑器、Ribbon、频谱、工具、导入器、元数据。
    - [x] 工具：TimeShift、SyllableSmoothing、ReplaceWord、RubyEditor。
    - [x] Ribbon：字段编辑、属性切换、新建歌词行、背景歌词同步设置。
    - [x] 元数据：MetadataEditor 的值、键和批量清空操作。
    - [x] 频谱：时间轴边界、单词平移和行时间编辑。
    - [x] 导入器：本地歌词、纯文本、LRCLIB 和音频元数据导入。
  - [x] 为事务、撤销、重做、冲突和字段保留添加测试。

  验收条件：所有用户和插件文档修改都能被统一观察、撤销并标记来源。

  阶段 3：建立公开 Plugin API

  - [ ] 创建独立的 packages/plugin-api，不得依赖 React、Jotai、Tauri 或内部 TTMLLyric。
  - [ ] 固定 UI 与业务的分层边界：业务逻辑只能依赖 kernel、platform 接口和 plugin-api；UI 只能通过 adapter、application service 或 command 调用业务，禁止直接修改 lyricLinesAtom。
  - [ ] 将 Jotai、React、Tauri、DOM 和 Worker 依赖收敛到 adapters/ui/runtime；业务层不得反向导入这些实现。
  - [ ] 为文档、导入导出、分词、时间处理等可复用业务建立 host-agnostic application service；React hook 只负责状态绑定、交互和错误展示。
  - [ ] 选择一个完整功能闭环（建议时间平移）完成 UI → command/application service → EditorDocumentService 的迁移，并删除该功能的旧直写入口。
  - [ ] 为分层增加 import boundary/lint 约束，并在 CI 中检查新增跨层依赖。
  - [ ] 定义 FunctionPluginManifest 和 ThemePluginManifest 判别联合。
  - [ ] 定义 PluginDocumentV0、事件、命令、错误、权限和生命周期协议。
  - [ ] 使用 JSON Schema 校验所有 manifest、宿主调用和插件返回值。
  - [ ] 加入 apiVersion、themeApiVersion 和 capability negotiation。
  - [ ] 首批 capability：lyrics.core、lyrics.ruby、ui.notify、ui.form、storage.kv。
  - [ ] 为定制字段预留 capability 和 extensions，但不允许无约束覆盖内部对象。
  - [ ] 自动生成 SDK 类型和协议文档。

  验收条件：Mock Host 中可以运行插件合同测试，不需要启动 React 应用；至少一个完整功能可在不渲染 React 的情况下通过 application service 执行、产生统一文档事务并撤销；业务层无 React/Jotai/Tauri/DOM 直接依赖。

  阶段 4：命令和 UI Contribution

  - [ ] 扩展现有 keyboard registry，使 command 同时包含 handler、enablement、来源和清理逻辑。
  - [ ] 菜单项只引用 command ID，不直接保存回调。
  - [ ] 建立菜单、工具栏、侧栏、设置页和对话框 contribution registry。
  - [ ] MVP 只开放命令、菜单、通知和声明式表单。
  - [ ] 第三方插件不得注入 React 组件或任意 HTML。
  - [ ] 内置插件可以注册受信任 React view contribution。
  - [ ] 插件卸载时必须自动清理全部 contribution 和事件监听器。

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
