# AMLL TTML Tool 插件化路线图

本文记录剩余工作、仍约束后续工作的决策与已知取舍；仅保留必要的进度基线，不维护已完成任务清单。完成情况以源码、git 历史与各独立仓库 README 为准；架构与协议现状见 `PLUGIN.md`。2026-10-21 核对后，当前执行入口为“后续实现顺序”；阶段编号保留历史含义，不代表执行先后。

## 进度总览

- 已落地：阶段 0–7 的基础架构与运行能力，里程碑 1–3 的远程加载器、商店薄片与 time-shift 试点，trusted-js SDK、本地安装、工具链与 time-shift 外置、单文件开发体验与热重载、IndexedDB 合库与可编辑默认图片遮罩、完整边界负例与 CI、统一 installation 目录及设置内插件管理器。 插件依赖已完成：跨提供者闭包求解、版本与启用检查、可选依赖排序、环检测、拓扑激活、一次确认的批量商店安装、失败回滚，以及手动安装后的缺失依赖禁用状态。
- 多商店前端已落地：提供者身份、相对 catalog URL、镜像/冲突规则、第三方强制摘要、安装来源记录与来源移除后的状态展示。
- 商店后端已有独立技术原型（`../amll-ttml-tool-plugin-store/`）：Fastify/SQLite、本地管理员、ZIP 校验上传、不可变版本、待验收/上架/下架、公开清单与下载、运营记录。尚不具备正式 GitHub 身份、组织资格、受限下载、kill switch 与可信 CI 发布链路，不能视为阶段 10 完成。
- 阶段 8 已开始：外围辅助工具（同步行时间戳、纯文本导入、LRC/ESLRC/QRC/YRC/LYS 导入导出）已外置为独立仓库并以 factory artifact 交付，宿主旧入口已删除，2026-10-22 实机禁用/恢复验收通过。
- 尚未落地：阶段 8/9 其余业务迁移、商店生产能力与宿主控制状态联调、工具链/插件远端发布；平台实测与文档补齐贯穿实施。
- 测试统一位于根目录 `tests/`（镜像源码路径，包测试在 `tests/plugin-api`、`tests/plugin-sdk-js`），随分支入库。

## 后续实现顺序

| 顺序 | 工作 | 前置与完成边界 |
| --- | --- | --- |
| 1 | 开发与安装链路补验收 | 三平台 ZIP CI、macOS/Linux WebView 与桌面生产包实测（Windows 开发模式 Blob/共享 React 已验证）；正式发布前的远程完整性缺口见“稳定性收口” |
| 2 | 作用域内局部覆盖 | 当前交付范围已验收；主题包 overrides 与 settings 表单渲染随消费者落地，见该节边界 |
| 3 | 阶段 8：逐个外置业务消费者 | 辅助工具 → 元数据/Ruby/分词 → 帮助/设置/更新 → 可选格式 → 网络服务；sidebar 随节拍器/大纲、toolbar 随交付 i18n 落地；每项删除旧入口并通过禁用/恢复验收 |
| 4（可与 2/3 并行） | 阶段 10：生产合同与后端补齐 | 先确定认证/受限下载/客户端控制合同，再接 GitHub 身份与资格、kill switch、CI 溯源、同源部署和兼容策略；复用公开分发原型与多提供者 |
| 5 | 阶段 9：定制功能外置 | 依赖主题/覆盖与相应公开业务端口；复用阶段 8 渲染器，审阅开发可与后端并行，正式上架须等待资格、控制状态和运营记录验收 |
| 5a（阶段 8 端口就绪后） | MCP：对外自动化接口 | 先验收桌面本机只读薄片，再开放事务编辑和插件工具；不阻塞业务迁移或商店上线，若纳入 API v1 则在冻结前完成合同验收 |
| 6 | 正式发布与平台验收 | 生产商店就绪后绑定远端仓库，发布 SDK/工具链与插件，更新 factory lock 的 HTTPS source；验证正式来源政策、CORS、出厂回退与真实桌面端 |
| 7 | API v1 与分支退役 | 完成版本/数据迁移规则与全部定制功能合同测试后冻结 API v1；全部插件完成交付后退役定制版分支 |
| 贯穿 | 开发文档与合同测试 | 每项实现同步架构、开发指南、agent guide 与验收清单；ADR 已归并删除，不再列为待办；上线后删除所有开发记录 |

执行时按各节未勾选条目拆分任务；“接口就绪”“技术原型可运行”和“正式发布通过”分别验收。架构候选项由实际消费者驱动，不把统一状态机、全应用 CSP 或完整管理面板设为全部业务迁移的前置。

## 里程碑 4 前置：trusted-js SDK 固化与开发者体验

第 1 项（SDK 分包与 `TrustedJsHostV0`）、第 2 项（内置插件改用 SDK）、第 3 项（加载器接受 trusted-js 来源安装）与第 4 项（单文件开发体验与热重载）均已交付，接口与合同要点见 `PLUGIN.md` 第 13 节。余下缺口：

- 迁移约束（随阶段 8 逐项验收，不阻塞本节收口）：里程碑 4 迁出的每个插件都以公开 SDK/API 为唯一宿主依赖，time-shift 作为模板；工具链、测试依赖及宿主共享 React 不属于宿主内部依赖。目前不额外迁出业务插件。
- 平台基线：macOS/Linux 与桌面生产包验证留在正式平台验收，不视为已通过。当前 HTML CSP 允许 blob；全应用 CSP 收紧仍独立立项。

## 稳定性收口

这些是现有链路的补齐项，不重新设计已落地的 installation、多提供者或依赖图。浏览器交互与安装持久化失败语义已验收，Windows 开发模式 Blob/共享 React 已实测，其他桌面平台及生产包仍待验收；远程完整性缺口在正式发布前收口。

- 持久化验收基线：主题安装/卸载等待提交，trusted-js 安装/更新/卸载失败补偿包、授权、启停状态与旧运行实例，正式包激活及批次失败恢复 KV 快照；KV 和 localStorage 错误不再静默吞掉。回归覆盖提交等待、配额/状态写入失败、卸载失败、缺依赖禁用状态失败及回滚再次失败；真实 Chromium 已验证 IndexedDB 事务回滚和包/KV 快照恢复。跨 localStorage/IndexedDB 采用补偿，不宣称跨介质原子性；持续存储故障使补偿失败时明确报告，不返回成功。
- [ ] 所有远程 artifact 强制 SHA-256：第三方 provider 已强制摘要并核对包身份，余下官方兼容路径须补齐，不重复实现第三方规则。
- [ ] 收口官方同源裸 trusted-js 路径：取消直接 import，或改为 fetch → 摘要校验 → Blob import，使 consent key 绑定实际执行字节；第三方已经只能走包安装路径。
- [ ] 将余下远程完整性失败与恢复场景加入现有合同测试；复用已通过的 command → form → transaction → undo、启停清理、崩溃恢复、factory 回退与安装持久化失败回归。

## 插件间关系：主题作用域与局部覆盖

动机：阶段 8 会把原本在宿主内部互相调用的功能拆成多个插件（如元数据、Ruby、分词），阶段 9 的定制功能需要为宿主与其他插件提供语言包与专属视觉，这些都要求插件之间可以声明关系。两项顺序为 1 → 2：主题作用域与局部覆盖都以"目标插件存在且启用"为前提，复用已完成的依赖解析与级联规则。安装来源支持与依赖求解这两项前置已完成。主题作用域与局部覆盖可与阶段 8 并行，须在阶段 9 开始前就位。

### 1. 主题作用域（已就绪）

协议、宿主视图锚点、目标 part 校验、多作用域激活与恢复、受保护冲突确认/撤销和全量救援已落地。目标禁用保持主题选择；缺失/版本不兼容显示 `disabledByDependency` 并停止注入。合同与开发方法见 `PLUGIN.md` §6.2、`docs/plugin-development-guide.md` 的“插件作用域主题”；局部覆盖验收见下一节。

2026-10-18 验证：新增两个集中合同测试；真实 Chromium 生产编译夹具验证一个全局与两个插件作用域、宿主/表单/受保护区域隔离、标题栏宿主锚点、用户 override 优先、冲突对话框撤销、视图 dispose 与救援清空。临时主题、入口和构建产物已移除，不纳入 factory/catalog。旧 WebView 的 CSS `@scope` 支持仍随平台验收检查。

### 2. 作用域内的局部覆盖

- [x] 原则：只开放不影响被覆盖者核心功能的声明式表面。v0 可覆盖种类限定为 `localization`（命令 / 菜单 / 标题栏动作 / 设置表单 / 格式 provider 标题等 contribution 的 LocalizedText，以及插件自有字符串表）与 `icons`（宿主图标白名单内的替换）；命令处理器、文档操作、能力、激活事件、格式转换行为、视图组件与任何 id 一律不可覆盖。
- [x] 协议：覆盖方 manifest 声明 `overrides?: { pluginId, kind, entry }[]`，`entry` 指向包内资源（如 `strings/<locale>.json`），且必须同时声明对目标插件的依赖（复用第 1 项）；覆盖 payload 沿用 LocalizedText 体积上限（≤2048 字符、≤16 语言）与无 HTML 约束；目标中不存在的 key 忽略并记诊断日志。
- [x] 字符串表：为使插件代码内的文案也可被覆盖，SDK 增加 `host.i18n.t(key)`，读取插件包内声明的字符串表（`contributes.strings` 指向 `strings/<locale>.json`）；覆盖包提供同形状文件。硬编码在代码中的字符串不在覆盖范围内，迁移插件时应走字符串表。
- [x] 解析：`ExtensionRegistry` 在读取 LocalizedText 时经过按目标 pluginId + contribution id + 字段 + locale 索引的覆盖层；覆盖项归属覆盖方 scope，scope dispose 即撤销、文案即时回退。语言包类覆盖不需要目标插件同意，但插件管理器在目标插件条目上显示"已被 X 覆盖"及来源。
- [x] 冲突：多个插件覆盖同一目标同一 key 时，最后启用者胜出，并以与主题作用域相同的强提醒方式告知；插件管理器列出覆盖链。
- [x] 当前交付验收：2026-10-20，真实 Chromium 生产编译宿主验证 JSON 包安装、菜单、通过 `host.i18n.t` 构建的表单与代码内通知切换，原处理器和表单提交行为保持；禁用/卸载即时回退；两个语言包触发受保护冲突提醒，保留/停用胜者、管理器来源与覆盖链、重新启用后的顺序反转及刷新恢复均通过；id、handler、能力、激活事件和未知 key 被过滤并记诊断。全量合同测试 411 项通过，详见 [验收记录](docs/local-overrides-acceptance.md)。临时插件与源码入口已清理，未加入 factory/catalog；构建与截图仅留在忽略的 release/。

边界：主题包 overrides、`settings` 声明式表单渲染与 `/settings/...` 运行时消费随对应消费者落地，不计为本次已通过；`ui.showForm` 不接受 `/settings/...` 地址覆盖，表单文案由插件在打开时读取字符串表。目标升级后的重新过滤仍需重新启用覆盖方。macOS/Linux WebView 与 Tauri 桌面生产包保留到正式平台验收。

## 阶段 8：批量迁移外围功能

执行清单（time-shift 外置模板已就绪，按以下顺序逐项验收）：

- [x] 外围辅助工具：`amll-ttml-tool-plugin-sync-line-timestamps`、`amll-ttml-tool-plugin-plain-text-import`、`amll-ttml-tool-plugin-formats`（2026-10-22，格式 provider，formatId 带插件命名空间）已交付锁定 artifact，宿主命令/对话框/解析器/文案已删除，新增 `project.importDocument` 端口；mock 与真实宿主合同测试及 2026-10-22 实机禁用/恢复验收通过。已知取舍：部分内置插件禁用后需刷新页面才完全生效，插件管理器在禁用出厂插件时提示刷新。纯文本导入已改用共享 Radix 的 `dialog-view`（`size: "full"`）还原原版布局；TTML、ASS 导出与剪贴板仍在宿主，LRCLIB 归网络服务项。`lyric-drag` 为宿主手势与行重排核心，保留在宿主。
- [ ] sidebar contribution 渲染器与首批消费者：节拍器、大纲。渲染器已落地（2026-10-22）：`sidebar` trusted view 以 contribution id 为标签页 id，编辑模式 ribbon“视图”区按 title 生成开关，贡献消失时隐藏、重新注册后恢复；余下为节拍器、大纲迁出及其禁用/恢复验收，图标、顺序、默认展开等字段由这两个消费者的实际需要决定，不预先扩协议。
- [ ] 元数据、Ruby、分词。
- [ ] 帮助、设置和更新。
- [ ] 文件与格式支持：现有非 TTML 格式已随外围辅助工具迁入 `builtin.formats`；本项余下为第三方格式接入与相应验收。
- [ ] toolbar contribution 渲染器与首批消费者：交付文件的 i18n 支持模块；审阅功能的自定义 toolbar items 归阶段 9 复用同一渲染器。`registerToolbar` 目前同样没有渲染位；渲染位、分组与数量上限随 i18n 模块落地，标题栏动作位不与之合并。
- [ ] 网络服务（先迁移 LRCLIB 等业务消费者，并接入网络端口与离线总开关）；GitHub、歌词站、NCM 与 Review 的外置迁移归阶段 9。

每迁移一个功能，都要求旧入口删除、插件禁用后功能消失、重新启用后状态恢复。本阶段即“里程碑 4”，其前置条件见“里程碑 4 前置”。迁出的插件沿用“插件工具链与 time-shift 外置”的独立项目模板；存在插件间依赖的功能（如元数据 / Ruby / 分词之间的共享）使用已实现的 manifest dependencies 声明存在与版本关系；共享业务调用另经公开端口表达，不得退回宿主内部直接耦合。

### 迁移范围

本节是阶段 8 的范围基线，不代表业务已经迁出。SDK/安装/工具链基础已就绪；后续按消费者补端口、迁移到独立仓库并完成对应验收。

#### 纳入迁移的功能

下列功能属于业务能力或可替换 provider，目标是按 trusted-js 适配为插件，在同级 `amll-ttml-tool-plugin-<name>/` 独立仓库交付。按消费者需要补充公开端口，业务逻辑归插件；宿主核心的内部重构不作为迁移前置。

| 功能组 | 当前代码线索 | 目标插件边界 |
| --- | --- | --- |
| 时间平移 | `amll-ttml-tool-plugin-time-shift/`（已外置，作为模板） | command、表单和单事务文档编辑已走 SDK；宿主消费锁定 artifact |
| 元数据编辑 | `src/modules/project/modals/MetadataEditor.tsx`、`src/modules/project/logic` | 元数据读取/编辑、文件名推导；通过 document/project API，不持有宿主 atom |
| Ruby/罗马音 | `src/modules/lyric-editor/tools/RubyEditor.tsx`、`src/modules/segmentation/utils/Transliteration` | Ruby 生成、分配与批量应用；与分词的共享通过插件依赖声明表达 |
| 分词与词级编辑辅助 | `src/modules/segmentation`、`src/modules/lyric-editor/tools/{ReplaceWordDialog,SyllableSmoothingDialog}.tsx` | 纯算法与交互编辑器均走 trusted-js；统一使用 document-ops |
| 外围辅助工具 | 同步行时间戳、纯文本导入、非 TTML 格式 provider（已外置）；`src/modules/lyric-drag` 保留 | 仅迁出可由 contribution、command、声明式表单表达的功能；拖拽宿主手势保留，业务变更通过插件命令提交 |
| 节拍器、大纲 | 定制版 sidebar 面板 | sidebar contribution 的首批消费者；渲染器随之落地，见阶段 8 执行清单 |
| 交付文件 i18n 支持 | 定制版 toolbar 模块 | toolbar contribution 的首批消费者；渲染器随之落地，审阅 toolbar items 在阶段 9 复用 |
| 帮助、设置和更新扩展 | `src/modules/settings` 中可独立关闭的业务页/工具 | 设置壳、插件管理、权限与恢复入口留在宿主；可替换的业务设置页/更新检查器再插件化 |
| 网络服务与定制功能 | `src/modules/lrclib`、GitHub/歌词站/NCM 等阶段 9 功能 | 通过明确的网络 capability 与离线总开关接入；凭据由宿主持有，插件只经宿主端口操作 |
| 可选格式 provider | LRC/ESLRC/QRC/YRC/LYS 已迁入 `builtin.formats`；未来第三方格式 | 复用 `core.formats` registry；TTML 与 ASS 导出不在此项迁出 |

#### 明确保留在宿主的功能

以下能力是应用稳定性、恢复入口、信任边界或宿主原生实现的一部分，保留在宿主，不以插件禁用为其生命周期条件：

- `core.modes`（包括 fail-safe Edit）、编辑器主视图与行/词渲染、选择/撤销/历史恢复等宿主交互骨架。
- `core.formats` 中的 `hostNative` TTML provider；阶段 7 已登记的 provider registry 入口保留，但 TTML 仍由宿主原生实现。
- 内置主题、主题 token/surface、受保护的权限/插件管理/恢复 UI，以及主题安全校验。
- 音频播放、频谱/时间轴渲染、FFmpeg/音频 worker、键盘与窗口控制等实时宿主设施。
- 文件选择/保存端口、项目打开与自动保存、IndexedDB/平台存储、Tauri/Web 宿主适配和应用启动编排。
- 插件加载器、安装器、catalog/store、consent、崩溃自动禁用、能力授权和 SDK/合同测试基础设施。

#### 暂缓或跳过迁移

- Review 独立模式及其页面壳、FLIP/WAAPI 动画、标题栏动作组留到阶段 9；report/filter/operation-log 纯逻辑随审阅插件迁出。
- 插件依赖协议与多提供者已就绪；主题作用域/局部覆盖、生产商店与自托管按各自前置推进，仅阻塞实际依赖它们的功能。
- 任何无法通过 SDK 表达、需要直接访问 Jotai/Tauri/DOM/内部 `TTMLLyric` 的代码，先留在宿主并拆出端口，不以“复制源码”方式绕过边界。

#### 迁出后的统一收尾条件

每个功能在独立仓库交付前，必须完成：SDK-only 边界检查；宿主旧入口和重复实现删除；禁用/卸载后 contribution、监听器、worker 与存储命名空间全清理；重新启用和重启后状态恢复；工厂副本与商店 artifact 使用同一 sha256；宿主只保留锁定版本与加载适配，不再保留该插件的源码真相。

#### 接口与功能映射

| 功能 | 当前可用的框架接口 | 业务迁移状态 |
| --- | --- | --- |
| 时间平移 | 既有 SDK commands/menus/form/document-ops | 已 SDK-only 并外置，宿主消费锁定 artifact |
| 元数据编辑 | document 投影/metadata ops + 新增只读 `project.getInfo()` | 接口就绪，现有 MetadataEditor 业务实现尚未改写为独立插件 |
| Ruby、罗马音、分词与词级工具 | 既有 ruby/document-ops + 新增 `selection.onChanged`、dialog view 宿主 | 接口就绪，算法与旧工具入口仍在宿主；依赖声明与完整业务迁移另行验收 |
| 帮助、设置扩展 | `settings-view` 接入设置页动态标签；贡献消失时回退常规页 | 插槽就绪；宿主设置壳、权限与恢复入口保留 |
| 导入类工具 | `project.importDocument`：未保存确认 + 打开文件同款提交（项目 ID、默认作者、文件名、清空选区） | 纯文本导入已使用；LRCLIB 迁移复用同一端口 |
| 网络服务 | trusted-js `network.request/isOffline`、协议 `network.http`、持久化插件网络开关 | 匿名 HTTP 接口就绪；LRCLIB/GitHub/NCM 尚未替换原调用，认证业务端口待实现 |
| 格式 provider、宿主模式 | 既有 `formats.register` / `views.registerMode` 共用 registry | LRC/ESLRC/QRC/YRC/LYS 已由 `builtin.formats` 提供；TTML 与 ASS 导出、core.modes、内置主题仍在宿主 |
| 节拍器、大纲（sidebar） | `ContributionRegistry` 的 `sidebar` view kind | 渲染器已就绪（侧边栏标签页 + ribbon 视图开关）；节拍器、大纲尚未迁出 |
| 交付 i18n、审阅工具条（toolbar） | `registerToolbar` | 只有注册接口，宿主无渲染位；渲染器随首个消费者落地 |

实现约束：新增接口不暴露 Jotai、内部 TTMLLyric 或凭据；选择订阅在 host handle dispose 时清理；dialog 按实际 owner 检查，注册消失后自动关闭。网络请求禁携带宿主授权头/cookie，仅允许 HTTPS 和本机 HTTP 开发地址；请求体上限按 UTF-8 字节计算，响应流限制 8 MiB，超时与卸载中断请求，拒绝重定向。离线开关仅拦截经插件端口发起的新请求，不宣称覆盖尚未迁移的宿主网络调用或 trusted-js 自行调用 fetch。

浏览器交互已于 2026-10-18 随提交 `82e406f0`（`plugin: browser validation`）验收完成：对话框/动态设置贡献、选择订阅、网络离线、表单事务/撤销、安装启停/刷新恢复、dev 来源与卸载；复现步骤和边界见 `tests/plugins/browser/README.md`。管理入口按“首选项 → 常规 → 管理插件”验收。真实 TTML 已经文件选择流程导入并验证元数据事务、歌词/注音完整性及一次撤销精确恢复，源文件未修改。浏览器交互不再列为本轮待办；剩余平台验收为 Tauri 真实 WebView 的 Blob 加载与共享 React。后续业务迁移引入新行为时，仍须逐项回归。

SDK 构建边界、React 共享、本地安装与外置模板已落地；余下远端发布与桌面验收见对应章节。后续逐项迁移上表业务消费者并删除旧入口，通过禁用/重启恢复验收后在独立仓库交付。不得据“接口就绪”勾选阶段 8 全部迁移验收条件。

## MCP：开放范围与宿主 / 插件接入（阶段 8 之后）

定位：让外部 MCP client 读取编辑上下文、调用明确授权的歌词工具。此节为评估结论与待实现计划，不表示现有 SDK 已支持 MCP。首期让应用作为 MCP server；应用作为 MCP client 调用外部 server 属于另一需求，暂不建设模型聊天、server 市场或通用代理。排期依赖阶段 8 的相应公开业务端口，不要求全部业务迁移完成。

### 开放范围

只开放稳定的业务投影与操作，不把整个 SDK、命令注册表或宿主内部状态直接映射成 MCP。现有 `PluginDocumentV0`、`DocumentOpV0`、`project.getInfo()`、`selection.get()` 和 `document.applyEdit(..., { expectedRevision })` 可复用；MCP 的会话授权、工具 schema、项目绑定与传输仍需新增。

| 能力 | 建议开放范围 | 边界与顺序 |
| --- | --- | --- |
| 编辑上下文读取 | 当前项目标识、文档 revision、选区、歌词与元数据投影，以 resources / 只读 tools 提供 | 首期；用户明确选定共享项目，按行范围读取并限制响应大小，不默认共享其他项目、历史快照或本地路径 |
| 文档修改 | 现有 document-ops 支持的文本、时间、元数据、Ruby 等批量编辑 | 第二步；必须携带项目标识与 expectedRevision，复用校验、单事务和一次撤销；冲突返回后重新读取，不自动覆盖用户编辑 |
| 业务工具 | 时间平移、分词、罗马音、校验等已迁出功能的明确参数化入口 | 按插件逐项 opt-in；复用其业务实现，只有弹窗交互的命令不能直接作为无人值守工具 |
| 导入 / 导出 | 指定格式的文本解析、序列化；替换当前文档单独授权 | 后续按消费者开放；复用格式 provider 与宿主文件流程，导入保留未保存确认，不因 MCP 调用绕过确认或任意读写磁盘 |
| 网络业务 | 搜索 / 获取歌词等具名业务操作 | 随网络插件逐项评估；复用离线策略与服务端鉴权，不提供任意 URL 代理，不返回宿主凭据 |
| 管理与平台权限 | 插件安装/卸载、授权变更、任意命令执行、JS/shell、通用文件系统、跨插件 KV、凭据读取 | 首期不开放；有具体消费者再单独评审，不提供通用逃生口 |

首期不做 prompts 模板库；工具描述、歌词、元数据及插件返回内容均作为数据，不作为增加授权的依据。MCP 的只读/破坏性等 annotations 仅作提示，实际范围由宿主在调用时校验。插件现有 capability 是兼容与告知机制，不自动等于外部 client 的访问授权。

### 接入方式评估

| 方式 | 评估 | 结论 |
| --- | --- | --- |
| 宿主内置 MCP 适配层 | 可统一绑定当前项目、管理会话、授权、事务与连接生命周期；需要新增桌面传输桥接 | 推荐作为基座，默认关闭；协议层保持薄，仅转调公开业务端口 |
| 单独 trusted-js 插件承包 MCP server | 便于独立分发，但 WebView 插件不能仅靠现有 SDK 监听本机端口或提供 stdio；仍需宿主桥接，禁用后还涉及连接与在途调用清理 | 不作为首期架构，避免为一个插件新增通用本地服务/进程权限 |
| 宿主基座 + 插件贡献工具 | 宿主负责协议与授权，业务插件复用自身算法；启停和命名空间沿用 scope | 推荐的扩展方式；首个真实消费者落地时再增加最小公开注册合同，不自动导出所有 commands |

传输建议：先做 Tauri 桌面本机 Streamable HTTP，监听 loopback，使用会话凭据并校验 Host / Origin，非浏览器 client 无 Origin 的合法情况单独处理；不以“来自 localhost”代替认证。明确多窗口/多实例的目标项目，用户关闭共享或应用退出即撤销会话。纯 Web 版不能直接监听本机端口，首期不承诺同等支持；若目标 client 仅支持 stdio，再增加连接已运行宿主的薄桥接进程，不维护第二套编辑器状态。公网监听、远程托管与远程多用户授权不纳入首期。

插件接入建议：新增独立的 MCP tool contribution / 注册端口（具体命名待实现），声明插件命名空间内的稳定工具名、说明、输入/输出 JSON Schema、读写性质与所需业务能力，注册返回 scope 管理的 dispose。当前 `commands.register` 的 `handler(args?: JsonValue): unknown` 不足以充当这一合同；优先抽出插件内部共用的业务函数，UI 命令和 MCP handler 分别调用。宿主校验参数与可序列化结果、启用状态、client 授权和项目绑定；插件禁用/升级后撤销工具并通知工具列表变化，旧请求不得在失效后提交修改。trusted-js 仍是应用级代码，此合同不构成恶意插件沙箱。

### 实施与验收

- [ ] 只读薄片：桌面开关、会话授权/撤销、当前项目绑定、上下文读取与大小限制；选一个实际 MCP client 验证发现和调用。共享歌词可能流向 client 所配置的外部模型，开启共享时明确展示数据范围。
- [ ] 写入薄片：先复用 document-ops，不新增旁路写入；默认只读，用户可对会话明确授权写入，整篇替换等操作保留宿主确认。项目切换、确认等待期间的 revision 变化、连接断开和插件停用均须在提交前复核；记录 client、tool、插件来源与结果，不记录歌词正文或凭据。
- [ ] 调用语义：限制请求大小、并发与执行时间；支持取消，提交前取消不得写入，已提交事务不宣称回滚。写工具重试须可识别同一操作并查询结果，不能在断线后盲目重放；避免重复平移等非幂等修改。
- [ ] 插件试点：以 time-shift 验证同一业务实现经 UI 与 MCP 调用、单次撤销、参数校验、授权拒绝、工具列表更新、禁用后拒绝调用；注册端口落地时同步 API/SDK、Mock、工具链 vendor 与插件 artifact。
- [ ] 合同与平台验收：覆盖未授权/越权、错误项目、过期 revision、超限输入输出、断线重试、取消、插件卸载/升级和多窗口路由；再验证 Windows/macOS/Linux 生产包的监听、连接关闭与凭据不泄漏。测试落在根目录 `tests/`，插件算法测试仍归独立仓库。
- [ ] 随实现同步 `PLUGIN.md`、插件开发指南与 agent guide，区分 MCP 协议版本、宿主插件 API 版本和工具 schema 版本；未验收的网络业务、远程服务与 Web 支持不列为已开放能力。

## 阶段 10：插件商店后端

当前实现基线见 `../amll-ttml-tool-plugin-store/README.md`：已有公开分发与本地管理原型，技术栈为 Node.js/TypeScript、Fastify、SQLite/Drizzle。下面列出生产化缺口及必须保持的合同，现有上传、不可变版本、上下架和运营记录应复用。

执行顺序：① 补提供者认证、受限下载与控制状态合同（公开提供者合同已落地）→ ② GitHub OAuth、组织资格及受限分发 → ③ 宿主控制状态持久化与 kill switch 联调 → ④ 可信 CI 投稿/构建/入库链路 → ⑤ 同源部署、缓存、兼容性与故障验收。生产发布与审阅上架随后进行。

两条承重原则：

- 商店的“不分发”包含出于资格或运营需求而不公开部分代码的安排；这是分发策略，不是业务访问控制。代码一旦公开，用户可修改源码自行运行插件；审阅等业务 API 必须自行鉴权，业务安全性不得依赖“用户看不到或不能运行这个插件”。
- trusted-js artifact 保持不可变、内容寻址、CI 构建发布与同版本字节一致，以保证更新一致性、缓存、回退和可复现构建；这些措施及同源交付均不证明发布者身份或代码可信。

- [ ] 身份与资格：自托管服务器接入 GitHub OAuth，首次登录创建本地账号，以 GitHub 稳定用户 ID 关联身份，为组织内其他项目提供账号对接基础；OAuth 负责身份认证，服务端校验组织成员身份并按插件所需资格授权，登录成功不等于获得受限插件权限。清单 API 按当前会话与资格返回可见条目，未登录或无相应资格的用户只获得不含受限插件的清单；不再以歌词站账号 SDK 为商店身份前置。插件不内嵌秘密，业务 API 仍独立执行服务端鉴权。
- [ ] 受限下载：受限 artifact 的每次下载均由服务端依据上述会话与资格鉴权，不能只隐藏清单条目而暴露公开下载 URL；组织资格查询失败与明确无权限必须区分，无法确认资格时不新增受限下载授权，也不向客户端伪报资格撤销。GitHub OAuth 凭据由服务端保管，不提供给插件。
- [ ] 发布流水线：trusted-js 档只接受 CI 从 PR 中登记的 commit 引用构建发布，见下文“托管形态与发布流水线”；记录 commit hash → artifact hash 溯源；版本不可覆盖重传；普通下架停止清单分发，受限插件另支持 kill switch，二者不得混为一谈；发布记录复用代码托管平台的 review 与 CI 记录。
- [ ] 同源交付：trusted-js artifact 从应用自身 origin 提供，CDN 只能藏在应用 origin 之后回源，不得成为独立脚本 origin；内容寻址 URL 保持不变，公开 artifact 使用 immutable 长缓存，受限 artifact 禁止未经鉴权的公共缓存命中，客户端缓存与服务端下载资格分开处理；按身份返回的清单使用 private, no-store，明确受限插件控制状态在下一次成功刷新后应用。
- [ ] 清单与版本协商：入参 platform/appVersion/pluginApiVersion，按兼容矩阵过滤返回；支持灰度发版与按用户锁版本。
- [ ] 运营控制：kill switch 仅作用于受限插件，支持插件级 / 版本级控制，不用于远程禁用普通公开插件；发布记录复用代码托管与 CI，资格变更及 kill 操作保留必要的运营记录；客户端崩溃自动禁用机制独立于服务端 kill switch，可选上报，除此之外遥测最小化。
- [ ] 客户端控制状态：清单缺项本身不视为 kill 或资格撤销，提供者的可选控制合同须明确区分禁用、资格失效与状态未知。收到服务端明确且适用于当前账号的禁用 / 资格失效结果后停止对应受限插件运行并 dispose scope，但不因此删除已安装包、插件数据或缓存；已确认的禁用状态需持久化，不能因后续断网自动解除。网络波动、超时、服务不可达或离线只记为状态未知，保留最近一次确认状态，不新增禁用或清理；恢复联网后重新校验。
- [ ] artifact 一致性约束：禁止服务端按用户个性化生成代码，同版本对所有用户字节一致；个性化一律走数据 API。
- [ ] 分档差异：第三方 trusted-js 可上架，走 consent + 来源展示。主题包货架以客户端校验为边界，后端做托管、元数据、账号实名与上传时复验客户端同款体积上限（主题包已迁 IndexedDB，上限重新定档后两端同步）；两个货架发布通道分离。
- [ ] 可用性：商店不可用不影响编辑器与出厂功能；清单请求失败只影响本次目录刷新、安装或更新，不等同资格失效，不禁用已有插件或清除数据与缓存，不进入错误循环。受限插件遵循最近一次明确控制状态；离线期间无法获知新的禁用决定，不承诺离线即时撤销，业务 API 权限仍由服务端控制。
- [ ] 容器发布验收：复用已实现的 ZIP 上传/分发、共享 package parser 与 IndexedDB 存储，核对客户端和服务器体积上限及错误语义；用户导入入口采用 ZIP，底层 JSON 兼容路径不等于仍需恢复粘贴导入 UI。

### 托管形态与发布流水线

参考过的三种模型：Obsidian 社区插件（[obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)，Git JSON 索引 + 作者自托管 Releases，零服务端但无资格 / kill switch / 审计）、Zed 扩展（[zed-industries/extensions](https://github.com/zed-industries/extensions)，Git 索引 + 官方 CI 构建托管，与本项目发布约定最契合）、Open VSX（[eclipse-openvsx/openvsx](https://github.com/eclipse-openvsx/openvsx)，完整注册中心服务，对本项目规模过重）。最终采用 Zed 式主体加自有服务器动态层。

- 托管：artifact 分发与数据库由自有服务器与域名托管。服务器对客户端的公开面即"商店提供者抽象"中的官方提供者（清单 + zip artifact）；trusted-js 产物经应用 origin 的反向代理路径下发，内容寻址，公开 artifact 使用 immutable 长缓存，受限 artifact 遵循上述下载鉴权与缓存策略，服务器不得成为独立脚本 origin。沿用原型的 Fastify/SQLite 技术栈，生产容量与部署验证另行验收。
- 投稿：以 commit 引用投稿（PR 中登记源码仓库 + commit hash），不接受存档文件。PR 阶段由无凭据 CI（fork 的 `pull_request` 工作流）跑 `parseManifest` / `parse*Package` 闸门、能力清单摘要与 toolkit 合同测试，结果以 bot 评论回帖；运营者依据校验结论审批。审批 = 分支保护 + CODEOWNERS + 必需 reviewer，GitHub review 记录即发布审计日志，不自建。
- CI：GitHub Actions 拉取指定 commit 构建，产出并发布 artifact，记录插件 id、版本、sha256、commit hash 与 workflow run id；投稿代码构建不暴露宿主或业务凭据。
- 构建与上架分离：推送成功的产物入库为"已入库未上架"状态，不进入清单；运营者在真实宿主上测试可用性与功能冲突后，经管理端点上架。构建成功不等于插件可用。
- 服务器接收：校验 sha256 与 CI 产物记录一致，拒绝同插件同版本换字节重传，不可变性由服务器强制而非约定。catalog 条目记录 commit hash 与 run id 供溯源。
- kill switch：仅针对受限插件，由后端管理端点自主控制（插件级 / 版本级），与 CI 推送弱相关；在线且成功刷新控制状态时以分钟级生效为目标，离线或请求失败不视为禁用。禁用只停止运行并保留包、数据与缓存；客户端刷新与控制状态合同遵循上文约定。
- 资格过滤：使用 GitHub OAuth 身份与服务端组织资格校验，由 API 选择返回的清单，未登录或无权限用户看不到受限条目；受限下载执行同样的资格校验。身份、清单过滤、下载鉴权与客户端控制状态须在审阅插件上架前就位，按用户锁版本保留扩展入口。
- GitHub 侧产物保留仅作备份（Actions artifact 最长 90 天且下载需鉴权，不可作分发节点）；如需公开镜像与回源兜底，用 Releases 附件。

## 阶段 9：定制功能插件化

执行边界：功能开发可与阶段 10 并行；审阅插件正式上架必须等待后端资格过滤、kill switch 与审计就绪。API v1 冻结与分支退役放在最终收口。

- [ ] 迁出审阅功能：页面壳、FLIP/WAAPI 动画与标题栏动作组由插件的受信任视图承接，report/filter/operation-log 格式化等纯逻辑归审阅插件，通过公开 SDK 接入宿主。
- [ ] 将插件事务接入 review operation log（以审阅插件内的 operation log 形态实现，不再依赖定制版宿主）。
- [ ] 为 agents、vocalTags、多语言和 songPart 增加 capability：不作为原生能力提供，而是作为插件接入现有体系，对应修改插件系统的作用范围。
- [ ] 通知中心、设置页扩展和复杂对话框按 trusted-js 插件 contribution 形态承接。
- [ ] 将 GitHub、Review、歌词站和 NCM 功能迁移为外置插件（非必须功能，且涉及版权或数据安全风险，不内置）。

## 插件工具链与 time-shift 外置

本地独立仓库位于同级 `amll-ttml-tool-plugin-toolkit/`、`amll-ttml-tool-plugin-time-shift/`、`amll-ttml-tool-plugin-sync-line-timestamps/`、`amll-ttml-tool-plugin-plain-text-import/`、`amll-ttml-tool-plugin-formats/`，均未配置 remote。toolkit `vendor/` 的 API/SDK tarball 已于 2026-10-21 与宿主同步；宿主 SDK 变更后须重新同步并更新各插件仓库的 vendor 副本（time-shift 仍为旧副本，下次升版时同步）。源码真相源：API/SDK 留宿主；插件实现与插件单元测试归独立插件仓库；宿主保留消费锁定 artifact 的真实宿主合同测试。toolkit 的 create/build/test/pack/serve、SDK tarball 与 Release workflow、`factory-plugins.lock.json` 收集器、本地静态源与 Chrome 夹具均已落地，操作见 `docs/plugin-development-guide.md`。

- [ ] 远端交付（后置）：创建/绑定各插件与工具链的远端仓库，发布 SDK/工具链 Release 附件与 time-shift 静态商店，随后把 lock source 指向正式 HTTPS 地址；等待商店后端完成后再推进。当前本地镜像不等于远端已发布；发布后宿主升版才可做到仅改 lock。
- [ ] ZIP 跨平台验收：绑定远端仓库后执行已配置的 Windows/Linux/macOS CI，确认三个 job 均通过同一固定摘要基线，记录 run URL；尚无远端执行结果。
- [ ] 桌面平台补测：Windows 开发模式 Blob/共享 React 已通过；继续验证 macOS/Linux 原生 WebView 与桌面生产包，不以工具链打包测试替代宿主运行验收。

ZIP 本地验收基线（2026-10-21）：Windows、Node 24.12.0、pnpm 10.28.2，toolkit `pnpm test` 12/12 通过（含字符串表资源打包与产物守卫），包含四组语言/时区独立进程、Unicode 条目排序、mtime 变化及 trusted-js/theme 固定摘要与 catalog 一致性。可复现性限定相同输入字节与锁定依赖；测试及基线维护方式见 toolkit README。

阶段 8 新插件直接沿用外置模板；依赖声明与求解已可使用，跨插件业务调用仍须补公开端口，依赖声明本身不提供模块共享。

v0 版本政策：SDK → 插件 → 宿主 lock 协调发布；宿主锁精确插件版本，升级、回退与离线出厂副本原则不变。ZIP 验收见 toolkit README，现有宿主交互验收见 `tests/plugins/browser/README.md`。

## 商店发布前验收

- [ ] 正式发布前复核 localhost 来源政策、桌面 WebView 跨来源/CORS 实机验收；原型允许范围不是上线政策。

## 贯穿项：开发文档整理

文档地图：`PLUGIN.md`（架构、信任模型、决策理由与协议入口，唯一架构文档）、`docs/plugin-development-guide.md`（插件作者）、`docs/plugin-agent-guide.md`（维护者）、`docs/plugin-acceptance-checklist.md`（验收）、本文（剩余工作与必要进度基线）。`docs/plugin-protocol-v0.md` 由 `pnpm plugin:api:build` 生成，不入库。架构决策已合并到上述文档，不再维护独立 ADR 目录。

- [ ] 自动生成扩展：`gen-plugin-docs.ts` 覆盖 `TrustedJsHostV0` 与 SDK 类型。
- [ ] trusted-js 与主题各一份“最小插件 → 构建 → 本地安装 → 发布到 catalog”端到端教程；主题包制作（CSS 校验规则与 slot/part 合同）、分发与商店（zip 容器、catalog、sha256、factory/shadow/pin）章节补入开发指南。
- 验收：新人或 agent 只凭 docs 完成相应插件并通过合同测试；信任模型与分发文档在审阅插件上架前收口。

## 按消费者需要评估的架构项

以下是待决策项，不是要求全部实施的迁移前置。任何调整都保持 `PLUGIN.md` 第 12 节的不变量。

### 菜单位置

- [ ] 开放菜单位置自定义：当前出厂插件入口沿用迁出前位置，由宿主 `PINNED_FACTORY_COMMANDS` 固定列表在原槽位渲染并从通用插件菜单区排除；需排期以用户可配置的菜单位置替代该列表，第三方插件仍只进入通用插件区。

### 管理状态、生命周期与策略

- [ ] 根据统一管理 UI 的实际问题决定是否抽取共同管理状态、错误与编排接口；保留 trusted-js 执行与主题预览/应用/安全模式的差异，明确加载失败与连续运行失败的计数规则。
- [ ] 评估把 factory shadow、desktop gate、same-origin、consent、capability negotiation 整理为显式 policy result，便于 UI 展示拒绝原因；runtime 只执行批准的 plan。
- [ ] 按诊断需要统一 install/load/activate/call/disable/rollback/uninstall 事件，包含错误码、时间、plugin id、版本和 runtime；不记录歌词正文、私密输入或凭据。

### API v1 前的版本与数据迁移

- [ ] 分别治理 manifest/API、package/container、catalog、trusted-js SDK、本地 installation schema 与插件自有 KV 的版本；插件 KV 由插件自行迁移。
- [ ] 明确旧安装记录缺少来源元数据时的兼容行为；新商店安装已保存 provider、摘要与安装时间，不追造旧记录的未知来源。
- [ ] 架构调整随实现同步 `PLUGIN.md`、开发指南与 agent guide；ADR 已归并，不再单独维护。

### 独立平台增强

- [ ] 全应用 CSP 收紧独立立项：先盘点 inline/eval、Blob、Worker、Tauri IPC 和开发服务器需求，再用生产构建验证策略。

摘要、同源与 CSP 不把 trusted-js 变成沙箱；本路线图不规划新的 iframe/WebView 隔离执行域。发布者签名与透明日志不作为当前剩余工作的前置。

### 主题遗留

- v0 已定义但尚未桥接到组件的 token：color.accent 之外的 textPrimary/textSecondary/border/danger、font.scale、spacing.radius、lyrics.wordText/wordSecondaryText/wordHighlight、spectrogram.lineSegment/wordSegment/gapSegment/waveform（频谱段颜色需接入 canvas 调色板）。CSS 变量已按约定名编译，按需在 base 层加 var() 桥接即可，不动协议。
- 主题编辑器 MVP 仅覆盖高频 token 的声明式输入；完整 token 编辑器与“导出为主题包”留待后续。
- 原按 localStorage 设计的主题包体积上限可以放宽，新上限与分发容器格式在阶段 10 一并定档（IndexedDB origin 配额与自动保存/历史快照共享，仍需显式上限）。

### 其他已知取舍

- theme 货架 zip 路径已实现但 CI catalog 暂未发布主题条目。
- `document.undo/redo` 与 `selection.changed` 事件类型已定义但暂未派发；`minAppVersion` 客户端未强制（静态薄片由 CI 保证，后端实化时启用）。
- 浏览器文件选择器取消时 Promise 不 resolve（与旧行为一致）；Ctrl+O 的音频路径依赖 `HostOpenedFile.asFile`。

- 插件网络离线开关的最终去留随阶段 8 网络服务迁移决定：宿主网络调用迁入同一端口则保留，否则删除。
- 历史主题安装记录可能没有来源元数据，按“来源未记录”兼容；新商店安装的提供者、摘要与安装时间已落盘。

## 最终收口：API v1 与定制版分支退役

- [ ] 上游宿主 + 全部原定制功能插件通过协议合同测试后，才冻结 API v1。
- [ ] 全部定制功能插件化完成后，以插件基座版本覆盖定制版分支并停止维护该分支；原定制功能经商店分发。

## 当前的用户心智模型及稳定性验收要求

定位：用户对自己的操作负主要责任，程序只保证稳定性。trusted-js 按应用级代码处理，consent 负责告知与授权，不承诺代码沙箱；只有随应用构建的 factory 模块免 consent，所有远程 trusted-js（含第一方更新）均须用户授权。后续机制按以下职责评审。

- manifest、协议、表单、主题 CSS、ZIP 路径和解压大小校验，避免损坏、卡死、资源耗尽与 UI 失控。
- trusted-js 的 consent、来源与风险展示、scope 清理和崩溃恢复；SDK capability 声明只用于文档、兼容性及提示，不能宣称可隔离任意 trusted-js 代码。
- 宿主凭据不进入插件存储、文档投影或公开 API，业务 API 在服务端鉴权。trusted-js 可借宿主能力操作用户数据及以当前登录身份调用 API；不向插件提供凭据原文是接口约束，不是同一 JS 环境内的强隔离承诺。

- SHA-256、内容寻址与 artifact 字节一致性用于完整性、缓存、回退和可复现构建，不作为发布者身份认证或代码安全边界。
- 同源脚本、CDN 反向代理、immutable 缓存和 catalog `no-store` 用于部署与更新一致性；同源不等于可信。
- `firstParty` 是来源标识；factory/shadow/pin、`minAppVersion` 与平台过滤分别服务于出厂回退、版本兼容和运营策略，不替代用户授权或服务端鉴权。
- crash marker、自动禁用与主题安全模式只负责恢复和可用性；依赖闭包、批次回滚和失败隔离只负责安装一致性与兼容性，不传递权限。
- 资格过滤、kill switch 与必要操作记录用于运营和事故响应，发布溯源复用现有代码托管与 CI 记录。运营上可以不公开部分代码；代码公开后用户可修改源码自行运行，业务权限始终由服务端控制。

新增安全机制须说明它如何防止插件故障或平台越界；仅增加高级攻击者成本的治理机制不列入本路线图。

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
  builtin/                    # 官方 TypeScript/React 插件
  adapters/                   # 宿主适配
  trusted/                    # trusted-js 加载闸门、工厂注册表、shadow 决策
  store/                      # 容器格式、安装管线、catalog 客户端
  ui/                         # 插件管理器、菜单、表单
tests/                        # 全部测试，镜像 src/ 与 packages/ 路径

仓库外（工具链与 time-shift 独立项目已落地）：
amll-ttml-tool-plugin-toolkit/     # 插件工具链：脚手架、zip 打包、合同测试 CLI、本地静态 catalog 服务
amll-ttml-tool-plugin-<name>/      # 外置插件，各自独立仓库，CI 产出 zip artifact 仅发布到自有商店源；出厂副本由宿主构建时从商店源按锁定版本拉取
```
