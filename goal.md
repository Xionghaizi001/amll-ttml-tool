# AMLL TTML Tool 插件化路线图

本文记录剩余工作、仍约束后续工作的决策与已知取舍；仅保留必要的进度基线，不维护已完成任务清单。完成情况以源码、git 历史与各独立仓库 README 为准；架构与协议现状见 `PLUGIN.md`。2026-11-09 更新后，当前执行入口为“后续实现顺序”；阶段编号保留历史含义，不代表执行先后。

## 进度总览

- 已落地：阶段 0–7 的基础架构与运行能力，里程碑 1–3 的远程加载器、商店薄片与 time-shift 试点，trusted-js SDK、本地安装、工具链与 time-shift 外置、单文件开发体验与热重载、IndexedDB 合库与可编辑默认图片遮罩、完整边界负例与 CI、统一 installation 目录及设置内插件管理器。 插件依赖已完成：跨提供者闭包求解、版本与启用检查、可选依赖排序、环检测、拓扑激活、一次确认的批量商店安装、失败回滚，以及手动安装后的缺失依赖禁用状态。
- 多商店前端已落地：提供者身份、相对 catalog URL、镜像/冲突规则、第三方强制摘要、安装来源记录与来源移除后的状态展示。
- 商店后端已由其他项目实现，不再纳入本项目推进范围；阶段 10 仅保留客户端对接、控制状态与联调验收，不代表客户端已完成接入。
- 阶段 8 已迁出并以锁定 factory artifact 交付（见 `factory-plugins.lock.json`）：time-shift、同步行时间戳、纯文本导入、formats（LRC/ESLRC/QRC/YRC/LYS）、节拍器、大纲、元数据、Ruby、分词（自动/高级分词）、词级工具。已知取舍：部分内置插件禁用后需刷新页面才完全生效，插件管理器在禁用出厂插件时提示刷新；`lyric-drag`、TTML/ASS 导出、剪贴板、保存/导入的文件名推导与默认作者元数据保留在宿主。
- 已验收：局部覆盖的当前交付范围、第三方格式接入；主题包 overrides 与 settings 声明式表单渲染仍随实际消费者补齐（见 PLUGIN.md“局部覆盖协议”）。
- 剩余工作：阶段 8 的 Ribbon bar contribution 渲染器、交付文件 i18n 与网络服务迁移，分词算法等按消费者推进的外置范围，阶段 9 定制功能迁移，阶段 10 商店客户端对接，以及远程完整性收口、工具链/插件远端发布和平台验收。
- 测试统一位于根目录 `tests/`（镜像源码路径，包测试在 `tests/plugin-api`、`tests/plugin-sdk-js`），随分支入库。

## 后续实现顺序

| 顺序 | 工作 | 前置与完成边界 |
| --- | --- | --- |
| 1 | 远程完整性收口 | 补齐官方远程 artifact 摘要与裸 trusted-js 加载校验，并完成失败/恢复合同测试，见“稳定性收口” |
| 2 | 阶段 8：剩余业务迁移 | Ribbon bar 渲染器随交付文件 i18n 落地，再迁移 LRCLIB 等网络服务；分词算法等其余范围按消费者需要推进，每项通过禁用/恢复验收；第三方格式接入已完成 |
| 3（可与 2 并行） | 阶段 10：商店客户端对接 | 对接外部已实现的商店，验收登录态、受限下载、兼容性及客户端控制状态；本项目不再建设后端 |
| 4 | 阶段 9：定制功能外置 | 按实际消费者补齐主题包 overrides、settings 表单渲染与公开业务端口；复用阶段 8 Ribbon bar 渲染器，审阅插件正式分发前完成客户端资格/控制状态联调 |
| 4a（相应端口就绪后） | MCP：对外自动化接口 | 先验收桌面本机只读薄片，再开放事务编辑和插件工具；不阻塞业务迁移或商店接入，若纳入 API v1 则在冻结前完成合同验收 |
| 5 | 远端发布与平台验收 | 对接正式分发源，绑定远端仓库并发布 SDK/工具链与插件，更新 factory lock 的 HTTPS source；执行三平台 ZIP CI，补测 macOS/Linux WebView 与桌面生产包，验证来源政策、CORS 与出厂回退 |
| 6 | API v1 与分支退役 | 完成版本/数据迁移规则与全部定制功能合同测试后冻结 API v1；全部插件完成交付后退役定制版分支 |
| 贯穿 | 开发文档与合同测试 | 每项实现同步架构、开发指南、agent guide 与验收清单；ADR 已归并删除，不再列为待办；上线后删除所有开发记录 |

执行时按各节未勾选条目拆分任务；“接口就绪”“技术原型可运行”和“正式发布通过”分别验收。架构候选项由实际消费者驱动，不把统一状态机、全应用 CSP 或完整管理面板设为全部业务迁移的前置。

## 里程碑 4 前置：trusted-js SDK 固化与开发者体验

第 1 项（SDK 分包与 `TrustedJsHostV0`）、第 2 项（内置插件改用 SDK）、第 3 项（加载器接受 trusted-js 来源安装）与第 4 项（单文件开发体验与热重载）均已交付，接口与合同要点见 `PLUGIN.md` 第 13 节。余下缺口：

- 迁移约束（随阶段 8 逐项验收，不阻塞本节收口）：里程碑 4 迁出的每个插件都以公开 SDK/API 为唯一宿主依赖，time-shift 作为模板；工具链、测试依赖及宿主共享 React 不属于宿主内部依赖。后续业务迁移按阶段 8 清单推进。
- 平台基线：macOS/Linux 与桌面生产包验证留在正式平台验收，不视为已通过。当前 HTML CSP 允许 blob；全应用 CSP 收紧仍独立立项。

## 稳定性收口

这些是现有链路的补齐项，不重新设计已落地的 installation、多提供者或依赖图。浏览器交互与安装持久化失败语义已验收，Windows 开发模式 Blob/共享 React 已实测，其他桌面平台及生产包仍待验收；远程完整性缺口在正式发布前收口。

- 持久化验收基线：主题安装/卸载等待提交，trusted-js 安装/更新/卸载失败补偿包、授权、启停状态与旧运行实例，正式包激活及批次失败恢复 KV 快照；KV 和 localStorage 错误不再静默吞掉。回归覆盖提交等待、配额/状态写入失败、卸载失败、缺依赖禁用状态失败及回滚再次失败；真实 Chromium 已验证 IndexedDB 事务回滚和包/KV 快照恢复。跨 localStorage/IndexedDB 采用补偿，不宣称跨介质原子性；持续存储故障使补偿失败时明确报告，不返回成功。
- [ ] 所有远程 artifact 强制 SHA-256：第三方 provider 已强制摘要并核对包身份，余下官方兼容路径须补齐，不重复实现第三方规则。
- [ ] 收口官方同源裸 trusted-js 路径：取消直接 import，或改为 fetch → 摘要校验 → Blob import，使 consent key 绑定实际执行字节；第三方已经只能走包安装路径。
- [ ] 将余下远程完整性失败与恢复场景加入现有合同测试；复用已通过的 command → form → transaction → undo、启停清理、崩溃恢复、factory 回退与安装持久化失败回归。

## 阶段 8：批量迁移外围功能

执行清单（已迁出项见“进度总览”，按以下顺序逐项验收）：

- [x] 分词收尾：已删除宿主遗留的 `AdvancedSegmentation` 组件、对话框 atom 与 `advancedSegmentDialog` 文案；分词算法与配置目前仍经 `host.segmentation` 由宿主提供，算法外置时再接 provider/dependencies。
- [x] 罗马音与词级工具：已迁至 `builtin.word-tools`（逐字音译分配/检查、拆分/替换单词、平滑时间轴），`builtin.segmentation` 声明依赖；新增 `host.romanization.registerPredictor` 与 `PluginWordV0.romanWarning`。
- [x] 第三方格式接入与相应验收（复用 `core.formats` registry）。
- [ ] Ribbon bar contribution 渲染器与首批消费者：交付文件的 i18n 支持模块；
- [ ] 自定义 Tool bar：审阅功能的自定义 Tool bar items 作为单独待办。`registerToolbar` 目前只有注册接口，尚无 Ribbon bar 渲染位；渲染位、分组与数量上限随 i18n 模块落地，标题栏动作位不与之合并。
- [ ] 网络服务：公共传输基础设施已抽出（匿名端口复用，支持取消/超时、二进制、上传、下载进度与有限预算）；下一步迁移 LRCLIB 等业务消费者并接入网络端口与离线总开关，逐项完成禁用/恢复验收。GitHub、歌词站、NCM 与 Review 的外置迁移归阶段 9。

每迁移一个功能，都要求旧入口删除、插件禁用后功能消失、重新启用后状态恢复。本阶段即“里程碑 4”，其前置条件见“里程碑 4 前置”。迁出的插件沿用“插件工具链与 time-shift 外置”的独立项目模板；存在插件间依赖的功能（如元数据 / Ruby / 分词之间的共享）使用已实现的 manifest dependencies 声明存在与版本关系；共享业务调用另经公开端口表达，不得退回宿主内部直接耦合。

### 迁移范围

本节只列尚未迁出的范围；已迁出项见“进度总览”。后续按消费者补端口、迁移到独立仓库并完成对应验收。

#### 纳入迁移的功能

下列功能属于业务能力或可替换 provider，目标是按 trusted-js 适配为插件，在同级 `amll-ttml-tool-plugin-<name>/` 独立仓库交付。按消费者需要补充公开端口，业务逻辑归插件；宿主核心的内部重构不作为迁移前置。

| 功能组 | 当前代码线索 | 目标插件边界 |
| --- | --- | --- |
| 分词算法 | `src/modules/segmentation/utils/segmentation.ts`（经 `host.segmentation` 提供） | 外置时接 provider/dependencies，`builtin.ruby`/`builtin.segmentation`/`builtin.word-tools` 共享经端口表达 |
| 交付文件 i18n 支持 | 定制版 Ribbon bar 模块 | Ribbon bar contribution 的首批消费者；渲染器随之落地，审阅 Ribbon bar items 在阶段 9 复用 |
| 帮助、设置和更新扩展 | `src/modules/settings` 中可独立关闭的业务页/工具 | 设置壳、插件管理、权限与恢复入口留在宿主；可替换的业务设置页/更新检查器再插件化 |
| 网络服务与定制功能 | `src/modules/lrclib`、GitHub/歌词站/NCM 等阶段 9 功能 | 通过明确的网络 capability 与离线总开关接入；凭据由宿主持有，插件只经宿主端口操作 |
| 第三方格式 provider | 未来第三方格式 | 复用 `core.formats` registry；TTML 与 ASS 导出不在此项迁出 |

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
- 插件依赖协议与多提供者已就绪；主题包覆盖等剩余消费者接入与商店客户端联调按各自前置推进，仅阻塞实际依赖它们的功能。
- 任何无法通过 SDK 表达、需要直接访问 Jotai/Tauri/DOM/内部 `TTMLLyric` 的代码，先留在宿主并拆出端口，不以“复制源码”方式绕过边界。

#### 迁出后的统一收尾条件

每个功能在独立仓库交付前，必须完成：SDK-only 边界检查；宿主旧入口和重复实现删除；禁用/卸载后 contribution、监听器、worker 与存储命名空间全清理；重新启用和重启后状态恢复；工厂副本与商店 artifact 使用同一 sha256；宿主只保留锁定版本与加载适配，不再保留该插件的源码真相。

#### 接口与功能映射

| 功能 | 当前可用的框架接口 | 业务迁移状态 |
| --- | --- | --- |
| 分词算法 | `host.segmentation` | 算法仍在宿主，待外置 |
| 帮助、设置扩展 | `settings-view` 接入设置页动态标签；贡献消失时回退常规页 | 插槽就绪；宿主设置壳、权限与恢复入口保留 |
| 导入类工具 | `project.importDocument`：未保存确认 + 打开文件同款提交（项目 ID、默认作者、文件名、清空选区） | LRCLIB 迁移复用同一端口 |
| 网络服务 | trusted-js `network.request/isOffline`、协议 `network.http`、持久化插件网络开关 | 匿名 HTTP 接口就绪；LRCLIB/GitHub/NCM 尚未替换原调用，认证业务端口待实现 |
| 第三方格式 provider | 既有 `formats.register` 共用 registry | 第三方接入与相应验收已完成；后续格式继续复用 registry，TTML 与 ASS 导出仍在宿主 |
| 交付 i18n、审阅功能区（Ribbon bar） | `registerToolbar` | 只有注册接口，宿主尚无 Ribbon bar 渲染位；渲染器随首个消费者落地 |

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

## 阶段 10：插件商店客户端对接

商店后端已由其他项目实现。本项目复用现有多提供者、catalog、ZIP 安装与依赖求解能力，仅负责客户端接入与验收；账号系统、资格判定、托管部署、投稿审核、服务端发布流水线与运营后台不再列为本项目任务。具体接入合同以外部商店实际提供的接口为准，不能把后端已有功能视为客户端已验收。

执行顺序：① 核对认证、清单、受限下载与控制状态合同 → ② 接入宿主登录态与下载流程 → ③ 控制状态持久化与运行生命周期联调 → ④ 正式来源、兼容性与故障验收。

- [ ] 认证与受限下载：对接商店登录/退出、会话失效、资格状态与受限 artifact 下载；区分未登录、明确无权限与查询失败，登录成功不等于获得受限插件权限。凭据由宿主接入层管理，不进入插件存储或公开 SDK；业务 API 仍独立鉴权。
- [ ] 清单与版本兼容：按外部接口传递 platform/appVersion/pluginApiVersion，接入兼容结果并补齐客户端 minAppVersion 检查；不依赖清单隐藏代替下载鉴权。
- [ ] 客户端控制状态：清单缺项不视为 kill 或资格撤销；明确区分禁用、资格失效与状态未知。仅对收到服务端明确结果且适用于当前账号的受限插件停止运行并 dispose scope，不删除已安装包、插件数据或缓存；不远程禁用普通公开插件。已确认的禁用状态需持久化，断网不自动解除；切换账号与恢复联网后重新校验。
- [ ] 可用性与恢复：网络波动、超时、服务不可达或离线只记为状态未知，保留最近一次确认状态，不新增禁用或清理。商店不可用不影响编辑器与出厂功能，目录刷新、安装或更新失败不进入错误循环。离线期间无法获知新的禁用决定，不承诺离线即时撤销；崩溃自动禁用独立于商店控制状态。
- [ ] 正式来源与缓存验收：复用现有来源政策、consent、摘要与包身份校验，完成“稳定性收口”；验证正式分发地址、桌面 CORS、会话切换后的清单刷新，以及受限下载和本地缓存的状态一致性。同版本 artifact 字节一致，摘要仅证明完整性，不证明发布者身份或代码可信。
- [ ] 容器与联调测试：复用 package parser、ZIP 导入和 IndexedDB 存储，核对外部接口的体积上限及错误语义；覆盖登录/退出、资格失效、kill switch、未知状态、恢复联网、账号切换、安装失败与出厂回退。底层 JSON 兼容路径不等于恢复粘贴导入 UI。

## 阶段 9：定制功能插件化

执行边界：功能开发可与阶段 10 并行；审阅插件正式分发前须完成与外部商店的客户端资格、受限下载及控制状态联调。API v1 冻结与分支退役放在最终收口。

- [ ] 迁出审阅功能：页面壳、FLIP/WAAPI 动画与标题栏动作组由插件的受信任视图承接，report/filter/operation-log 格式化等纯逻辑归审阅插件，通过公开 SDK 接入宿主。
- [ ] 将插件事务接入 review operation log（以审阅插件内的 operation log 形态实现，不再依赖定制版宿主）。
- [ ] 为 agents、vocalTags、多语言和 songPart 增加 capability：不作为原生能力提供，而是作为插件接入现有体系，对应修改插件系统的作用范围。
- [ ] 通知中心、设置页扩展和复杂对话框按 trusted-js 插件 contribution 形态承接。
- [ ] 将 GitHub、Review、歌词站和 NCM 功能迁移为外置插件（非必须功能，且涉及版权或数据安全风险，不内置）。

## 插件工具链与 time-shift 外置

本地独立仓库位于同级 `amll-ttml-tool-plugin-toolkit/` 与各 `amll-ttml-tool-plugin-<name>/`（出厂插件见 `factory-plugins.lock.json`），均未配置 remote。toolkit `vendor/` 的 API/SDK tarball 已于 2026-10-21 与宿主同步；宿主 SDK 变更后须重新同步并更新各插件仓库的 vendor 副本（time-shift 仍为旧副本，下次升版时同步）。源码真相源：API/SDK 留宿主；插件实现与插件单元测试归独立插件仓库；宿主保留消费锁定 artifact 的真实宿主合同测试。toolkit 的 create/build/test/pack/serve、SDK tarball 与 Release workflow、`factory-plugins.lock.json` 收集器、本地静态源与 Chrome 夹具均已落地，操作见 `docs/plugin-development-guide.md`。

- [ ] 远端交付（后置）：创建/绑定各插件与工具链的远端仓库，发布 SDK/工具链 Release 附件与 time-shift 静态商店，随后把 lock source 指向正式 HTTPS 地址；对接外部商店的正式分发地址与现有发布接口后推进。当前本地镜像不等于远端已发布；发布后宿主升版才可做到仅改 lock。
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
- 原按 localStorage 设计的主题包体积上限可以放宽，客户端新上限在阶段 10 对接时与外部商店的 ZIP 容器限制核对（IndexedDB origin 配额与自动保存/历史快照共享，仍需显式上限）。

### 其他已知取舍

- theme 货架 zip 路径已实现但 CI catalog 暂未发布主题条目。
- `document.undo/redo` 与 `selection.changed` 事件类型已定义但暂未派发；`minAppVersion` 客户端未强制（静态薄片由 CI 保证，阶段 10 客户端对接时补齐）。
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
  builtin/                    # 尚未外置的宿主内置插件
  adapters/                   # 宿主适配
  trusted/                    # trusted-js 加载闸门、工厂注册表、shadow 决策
  store/                      # 容器格式、安装管线、catalog 客户端
  ui/                         # 插件管理器、菜单、表单
tests/                        # 全部测试，镜像 src/ 与 packages/ 路径

仓库外（工具链与 time-shift 独立项目已落地）：
amll-ttml-tool-plugin-toolkit/     # 插件工具链：脚手架、zip 打包、合同测试 CLI、本地静态 catalog 服务
amll-ttml-tool-plugin-<name>/      # 外置插件，各自独立仓库，CI 产出 zip artifact 仅发布到自有商店源；出厂副本由宿主构建时从商店源按锁定版本拉取
```
