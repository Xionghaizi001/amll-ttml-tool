# AMLL TTML Tool 插件化路线图

更新：2026-11-14。本文记录当前交付状态、剩余工作和完成条件，不再保留历史阶段流水账或各内置插件的业务说明。宿主能力以源码为准，插件功能、命令、版本和发布记录由插件自身仓库维护。

状态分为“已实现”“待联调/验收”“未实现”；配置远端、存在 workflow、类型中声明了接口，都不能单独作为正式交付完成的证据。本次依据当前工作区核对，未提交的测试只代表本地验证，不代表 CI 已通过。

## 1. 当前进度

| 范围 | 当前状态 | 尚未完成的边界 |
| --- | --- | --- |
| 插件基座 | 文档事务、命令/贡献 registry、scope 清理、trusted-js 加载、主题系统与公开 API/SDK 已实现 | 仍是 experimental v0，未冻结 API v1 |
| 安装与恢复 | 本地 ZIP、包校验、consent、IndexedDB 持久化、统一 installation 管理、禁用/卸载、更新补偿与出厂回退已实现 | 保留故障回归；不宣称跨 localStorage/IndexedDB 原子性 |
| 依赖与多商店 | 版本/启用检查、闭包求解、拓扑激活、环检测、批量确认/失败回滚、来源记录、镜像/冲突规则已实现 | 依赖不授予权限；账号资格和远程控制状态尚未接通 |
| 商店公共目录 | 默认官方源已指向外部 beta catalog；相对 artifact URL、持久化目录、ETag/304、手动刷新、失败保留缓存已实现 | 真实服务和桌面 CORS 联调不等于本地 mock 测试；受限下载尚未接入 |
| 开发体验 | 独立 toolkit、单文件 ESM、共享 React/Radix、开发目录监听、source map 与热重载失败恢复已实现 | 开发目录不携带字符串表/覆盖资源，相关资源用正式 ZIP 验证 |
| 业务外置 | 当前 factory lock 包含 11 个锁定插件，宿主消费 ZIP artifact | lock source 仍全部为本地 vendor；其余业务迁移及逐项启停验收继续推进 |
| 插件 UI | 表单、对话框、侧栏、设置视图、模式、标题栏操作、词编辑器与行/词附加标记已接通 | 通用 Ribbon contribution 渲染、声明式 settings 表单消费仍有缺口 |
| 主题与覆盖 | token/CSS/资源校验、全局/插件作用域、预览/应用/恢复、trusted-js 文案/图标覆盖已实现 | 主题包 overrides 尚未注册到运行时；token 消费与制作工具仍需补齐 |
| 文档 | 开发指南和 Agent 指南已按当前 SDK 全量重写，包含全部 50 个 host 方法与 9 种文档操作的示例/索引 | SDK 参考自动生成、资源制作细节和端到端新人验收仍待完善 |
| 外部仓库与 CI | 插件源码总仓库、独立 toolkit 已配置 GitHub remote；按插件发布和 toolkit 三平台 workflow 已配置 | 本次未核实远端运行、Release 或正式商店发布结果 |
| MCP、定制业务、API v1 | 保留后续实施计划 | 不作为当前已经开放的能力 |

### 公开能力基线

当前 `TrustedJsHostV0` 提供 document、selection、project、commands、menus、titleBarActions、ui、views、editor、audio、bpm、segmentation、romanization、formats、storage.kv、network、i18n，以及仅指定提供方可调用的凭据桥。具体签名和示例见 [开发指南](docs/plugin-development-guide.md)，此处不复制方法清单或插件专有命令。

必须保留的实现区别：

- trusted-js 加载器直接调用 activate；manifest 的 activationEvents 尚不驱动延迟激活，声明贡献不能替代实际 handler/view/provider 注册。
- `registerToolbar` 是内部 ExtensionScope 接口，不是当前公开 host 方法；toolbar.edit/toolbar.sync 的协议位置不能证明 Ribbon 已渲染贡献。自定义模式的 ribbonView 已可用，与通用 Ribbon 插槽不同。
- sidebar.panel 只有菜单位置定义，没有菜单渲染入口；React 侧栏使用 views.registerView。
- selection.onChanged 已接通，不再将“选区变化不可订阅”列为缺口；协议中的独立 document.undo/redo 事件仍不能当作已开放订阅接口。
- 分词算法与配置仍由宿主经 segmentation 端口提供；外置 UI 不等于算法 provider 已外置。
- SDK 没有任意选区写入、音频播放/跳转、通用文件系统、主题管理或 MCP 端口。

## 2. 下一步执行顺序

| 顺序 | 工作 | 完成条件 |
| --- | --- | --- |
| 1 | 远程完整性收口与公共商店联调 | 官方兼容路径也校验执行字节；真实 beta catalog → 下载 → consent → 安装/恢复跑通，失败不破坏现有编辑与安装 |
| 2 | 阶段 8：剩余业务与 UI 贡献 | 首个真实消费者带动 Ribbon 渲染/公开合同；共享算法按需要外置，旧入口删除且启停恢复通过 |
| 可与 2 并行 | 阶段 10：账号与受限分发 | 认证、资格、受限下载、控制状态、兼容性与离线恢复完成联调；不重复建设外部后端 |
| 3 | 阶段 9：定制功能外置 | 审阅及剩余网络/定制功能经公开端口交付；正式分发前完成所依赖的商店资格和控制状态验收 |
| 按端口就绪推进 | MCP | 先桌面只读薄片，再事务写入和插件工具；不阻塞不依赖 MCP 的业务迁移 |
| 4 | 发布与平台验收 | 核实 SDK/toolkit/插件 Release 和商店产物、三平台 CI、原生 WebView/桌面生产包与出厂回退 |
| 5 | API v1、分支退役 | 版本与数据迁移规则确定，全部目标功能合同及平台验收通过，再冻结 API 并停止定制分支维护 |

每项实现同步必要的合同、测试和文档。不将统一状态机、完整运营后台或全应用 CSP 改造设为业务迁移的共同前置。

## 3. 稳定性与远程完整性收口

已有基线：文档操作按稳定 ID 原子提交、revision 冲突保护、一次撤销；安装/更新/卸载等待持久化并在失败时补偿；授权、启停、运行实例与 KV 的恢复有对应回归。跨介质补偿可能失败，必须报告，不返回虚假成功。

- [ ] 所有远程 artifact 强制 SHA-256。第三方 provider 已要求摘要，官方路径仍允许缺失，不能因默认源已配置而标记完成。
- [ ] 收口官方裸 trusted-js 路径：移除直接 import，或采用 fetch → 摘要校验 → Blob import，使 consent 绑定实际执行字节。当前加载器仍保留直接 import 分支。
- [ ] 明确官方外部 beta 源与旧同源裸模块路径的兼容边界。目录 artifact URL 已按提供者地址解析，但裸模块仍受应用同源加载闸门约束，不能假设任何远程 ESM 都可安装。
- [ ] 覆盖缺失/错误摘要、目录与包身份不一致、下载中断、旧缓存/新目录、授权后字节改变、更新失败和回退等剩余合同。
- [ ] 逐项验证新增业务禁用后撤回 contribution、监听器和在途操作；需要刷新才能完全生效的出厂功能保持明确提示，不把刷新提示当作全部生命周期已即时清理。

现有持久化和浏览器验收记录继续作为历史基线，见 [验收清单](docs/plugin-acceptance-checklist.md) 和 [浏览器验收入口](tests/plugins/browser/README.md)。新增行为仍需回归；旧记录不能证明当前生产构建或其他平台已通过。

## 4. 阶段 8：剩余迁移与扩展点

已锁定交付的插件列表以 [factory-plugins.lock.json](factory-plugins.lock.json) 为准，不在路线图维护第二份功能清单。当前新增行/词附加标记可由外部检查类工具消费；这证明宿主显示端口已接通，不代表该工具已加入 factory 或已正式发布。

- [ ] 交付文件 i18n 模块：作为通用 Ribbon contribution 首个消费者，明确渲染位、分组、数量上限、命名空间、启用条件和释放语义，同时补公开 SDK 与真实宿主测试。
- [ ] 自定义 Tool bar：审阅所需 items 复用上述能力；不与现有标题栏动作或模式 ribbonView 混为同一合同。
- [ ] 共享分词算法按消费者需要外置：保留现有 segmentation 端口行为，明确配置所有权和 provider/dependencies，不直接复制宿主内部状态。
- [ ] 余下网络业务迁移：公共 NetworkService 已抽出，公开插件 network 仍是匿名文本请求端口。二进制、进度等内部传输能力不能直接列为公开 SDK 能力。
- [ ] 可独立关闭的帮助、设置业务页和更新扩展按需求迁移；设置壳、插件管理、权限和恢复入口继续由宿主持有。
- [ ] 后续格式复用 formats.register 与宿主文件流，维持文件选择、未保存确认、文件名推导、默认作者及项目身份的统一处理。

### 统一完成条件

迁出的业务使用公开 API/SDK，旧实现和重复入口删除；禁用/卸载撤回 UI 和活动资源，重新启用/重启恢复规定状态；有依赖时声明版本和可用性关系，跨插件业务调用另有公开合同。禁用保留包和 KV，卸载删除相应持久化数据，不能把二者混为“全部清空”。

宿主消费已测试的锁定 artifact，与发布包字节/摘要一致；业务源码和单元测试留在插件仓库。当前主要源码组织为总仓库的独立插件目录，不再要求每项新功能另建一个同级 Git 仓库。

### 明确保留在宿主

- 编辑模式与 fail-safe、主编辑器、行/词渲染、选择、撤销、历史恢复、拖拽及剪贴板骨架。
- 原生 TTML provider、TTML/ASS 导出与文件打开/保存、项目身份和自动保存流程。
- 音频时钟、硬件延迟校准、频谱/时间轴、音频/FFmpeg worker、键盘与窗口设施。
- 主题基础合同、受保护 UI、插件加载/安装/恢复、平台存储与 Tauri/Web 适配。

## 5. 阶段 10：商店客户端对接

后端由外部项目实现，本项目只做客户端合同、接入和验收，不建设账号系统、资格判定、投稿审核、托管部署或运营后台。

### 已接入的公共目录薄片

- 默认官方 catalog 为 `https://api.beta.amllhub.bikonoo.com/api/v1/store/catalog.json`，不再以“尚未配置商店地址”作为待办。
- 普通读取使用本地快照，用户显式刷新才访问提供者；请求不带凭据、拒绝重定向，目录超时 15 秒、读取上限 4 MiB。
- 目录和 ETag 持久化，304 复用已有缓存；没有缓存的 304 视为失败。刷新失败保留已有目录，默认官方地址变化会丢弃旧官方缓存并保留自定义来源。
- artifact 相对路径按 provider catalog 地址解析；安装前重查来源/版本/摘要，通过现有容器、依赖、consent 和持久化链路安装。
- 现有下载为匿名请求，超时 30 秒、读取上限 48 MiB；这不是受限下载鉴权实现。

证据入口：[catalog-client.ts](src/plugins/store/catalog-client.ts)、[store-providers.ts](src/plugins/store/store-providers.ts)、[store-host.ts](src/plugins/store/store-host.ts)。

### 剩余接入与验收

- [ ] 公共链路实机联调：真实 catalog、ETag/304、相对下载地址、ZIP 安装、离线缓存、故障恢复与桌面 CORS；当前单元测试不能替代服务端联调。
- [ ] 认证与受限下载：登录/退出、会话失效、资格查询、受限 artifact。区分未登录、明确拒绝与查询失败；凭据由宿主接入层管理，不进入插件 KV 或文档投影。
- [ ] 兼容性：核对外部 platform/appVersion/pluginApiVersion 合同，补客户端 minAppVersion 强制检查；清单隐藏不能代替下载鉴权。
- [ ] 控制状态：仅对服务端明确返回、且适用于当前账号的受限插件执行停止/dispose；清单缺项不视为撤销，不远程禁用普通公开插件。停止保留安装包、缓存和插件数据。
- [ ] 状态持久化与恢复：确认过的禁用状态不能因断网自动解除；超时/不可达只是未知状态，不新增禁用。切换账号与恢复联网后重新验证，崩溃自动禁用保持独立。
- [ ] 端到端合同：覆盖登录/退出、资格失效、kill switch、未知状态、账号切换、下载/安装失败、回滚及出厂回退。商店不可用不能影响编辑器和离线出厂基线。
- [ ] 正式来源政策：从 beta 到正式分发地址时验证缓存迁移、CORS、local HTTP 开发例外和摘要一致性；离线期间不承诺即时接收撤销决定。

## 6. 阶段 9：定制功能插件化

可与商店接入并行开发；依赖受限分发的功能正式交付前必须完成相应资格、下载与控制状态联调。现有凭据桥已经落地，不再把“所有认证基础设施尚未实现”列为前置，但它不代表余下业务已迁出。

- [ ] 审阅模式：页面壳、FLIP/WAAPI 动画、标题栏组和专用工具栏由受信任视图承接；report/filter/operation-log 等业务逻辑归插件。
- [ ] 插件文档事务接入审阅 operation log，不依赖旧定制宿主；明确来源、事务粒度与撤销语义。
- [ ] agents、vocalTags、多语言、songPart 通过插件扩展合同表达；不直接提升为原生全局业务字段，不将声明 capability 当作能力实现。
- [ ] 通知中心、业务设置页与复杂对话框按已有 view/contribution 能力承接，缺少的公开端口由真实消费者带动。
- [ ] 剩余提交、歌词站与 NCM 等网络业务外置，复用宿主凭据和离线策略，不暴露任意带凭据的 URL 代理。
- [ ] 对需要真实账号的流程补人工及桌面验收；mock 身份和传输测试不代表真实账号操作已验证。

## 7. MCP：未实现，按薄片推进

目标是让外部 MCP client 读取明确共享的编辑上下文、调用已授权的歌词工具。首期应用作为 server；不建设模型聊天、通用代理、server 市场或应用作为 client 的体系。

采用宿主薄适配层管理项目绑定、会话授权、传输与事务；业务插件按需贡献工具。当前 SDK 不提供本机监听或 MCP 注册，不能把 commands.execute 自动暴露为 MCP。

- [ ] 桌面本机只读薄片：默认关闭，用户选定项目/共享范围，限制行范围和响应大小；选一个实际 client 验证发现、读取和撤销。开启时说明数据可能流向 client 配置的外部模型。
- [ ] 传输与路由：先评估 Tauri loopback Streamable HTTP，使用会话凭据并校验 Host/Origin，正确处理非浏览器 client；明确多窗口/实例的目标，关闭共享或退出即撤销。不以 localhost 代替认证。
- [ ] 事务写入：默认只读，会话明确授权后要求项目标识和 expectedRevision，复用 document-ops、一次撤销及破坏性导入确认。项目切换、确认等待和取消后在提交前再次检查。
- [ ] 插件工具合同：稳定命名、输入/输出 Schema、读写性质、参数/结果校验、scope dispose 与工具列表更新。UI 命令和 MCP handler 共用业务函数，不把只会弹窗的命令直接用作无人值守工具。
- [ ] 调用语义：输入/输出、并发和时间上限，取消及断线重试去重；提交前取消不写入，已经提交不宣称自动回滚。日志只记录必要来源和结果，不记录歌词正文或凭据。
- [ ] 验收：未授权、错误项目、旧 revision、超限、取消、重试、插件升级/停用及多窗口；同步 API/SDK/mock 和平台生产包测试。

首期不开放安装/卸载、授权修改、任意命令、JS/shell、通用文件系统、跨插件 KV 或凭据读取。网络业务仅逐项开放具名操作；歌词、工具说明和结果都是数据，不能扩展授权。纯 Web、本机 stdio 薄桥、公网/远程多用户均按真实需求另评估；不承诺首期支持。

## 8. 工具链、发布与平台

当前仓库组织：

- 宿主保留 `packages/plugin-api`、`packages/plugin-sdk-js`、真实宿主合同测试及 factory lock。
- `amll-ttml-tool-plugins/plugins/<name>/` 汇总主要插件，各目录独立 package、版本、lockfile、vendor 和测试/构建流程；不要求统一发布。
- `amll-ttml-tool-plugin-toolkit` 为独立工具链，KRL 等独立项目不因总仓库存在而被视为已合并。
- 已核实总仓库 remote 为 `Xionghaizi001/amll-ttml-tool-plugins`，toolkit remote 为 `Xionghaizi001/amll-ttml-tool-plugin-toolkit`。删除旧的“均未配置 remote”待办。
- 总仓库 workflow 已按改动目录选择插件，按插件标签发布 ZIP/catalog；toolkit workflow 已配置 Windows/Linux/macOS。工作流配置不等于远端执行或 Release 已通过。

剩余工作：

- [ ] 核实 SDK、toolkit 与实际插件的远端 workflow/Release 结果，记录 commit/tag/run URL；不再重复要求创建已经配置的远端。
- [ ] 选择并验收正式 artifact 分发路径。当前 11 项 factory source 全部仍在 `vendor/plugin-store/`；切换 HTTPS source 前验证下载、摘要、离线构建策略和出厂回退，不直接把 Release catalog 当作静态商店入口。
- [ ] 复核 vendor API/SDK 与目标宿主兼容。v0 tarball 使用相同包版本不保证接口相同；按新接口消费者同步，而不是沿用旧日期的“全部同步”结论。
- [ ] ZIP 三平台可复现验收：相同输入字节和锁定依赖下验证 Unicode 排序、mtime、语言/时区、ZIP 字节及 catalog SHA-256，记录三个 job 的结果。
- [ ] Windows 桌面生产包及 macOS/Linux 原生 WebView：Blob、共享 React/Radix、文件选择、IndexedDB、主题 CSS 作用域、安装/卸载与恢复。已有 Windows 开发验收不能替代生产包和其他平台。
- [ ] 主题制作链路补齐包内 assets 收集；协议支持 assets，但当前 toolkit pack 不等于自动收集完整主题资源。

## 9. 持续维护与按需评估

### 文档

[PLUGIN.md](PLUGIN.md) 负责架构；[开发指南](docs/plugin-development-guide.md) 负责作者接口与示例；[Agent 指南](docs/plugin-agent-guide.md) 负责能力判断和维护流程；[验收清单](docs/plugin-acceptance-checklist.md) 负责验收；本文仅记录当前进度与剩余目标。协议参考由 `scripts/gen-plugin-docs.ts` 生成，不手改。

- [x] 重写开发指南与 Agent 指南，移除内置插件业务/迁移说明，覆盖当前 host 方法和文档操作。
- [ ] 扩展生成器覆盖 TrustedJsHostV0/SDK；当前仍以 JSON Schema 生成协议参考，手写方法目录不是生成器已经完成。
- [ ] 补齐图标/资源与 ZIP 布局、主题 CSS/asset 制作细节，核对旧文档指向重写指南的锚点；不要将已重写的入门/API 章节重新列为从零编写。
- [ ] 用独立环境按 docs 完成 trusted-js 与 theme 的创建、构建、ZIP 安装、catalog 分发；记录真实完成结果。清理过时验收日期和重复说明，保留必要的可追溯证据。

### 有消费者才实施的项目

- [ ] 菜单位置可配置：替换当前固定入口映射前明确用户配置和第三方贡献的排序/冲突规则，不先扩大所有菜单能力。
- [ ] 管理状态/策略整理：根据真实 UI 问题决定是否统一错误和编排接口，保留 trusted-js 生命周期与主题预览/应用的差异。
- [ ] 诊断事件：按需要覆盖 install/load/activate/call/disable/rollback/uninstall，保留错误码、来源、版本和时间，不收集正文或凭据。
- [ ] 主题 token 消费：逐项核对基础 CSS/歌词/频谱 canvas 是否使用已编译变量；优先补实际消费者，不把“token 可解析”当作视觉效果完成。完整 token 编辑器和导出主题包另按需求推进。
- [ ] 主题 overrides 与声明式 settings：前者当前没有 ThemeService scope 接线，后者没有对应表单渲染；目标升级后的覆盖重过滤也需完善。
- [ ] 存储/容器上限与外部商店合同对齐，保留显式大小限制；IndexedDB 共用配额不等于可以无上限安装。
- [ ] 全应用 CSP 独立评估：盘点 inline/eval、Blob、Worker、Tauri IPC 和开发服务后用生产构建验收，不作为全部业务迁移的前置。
- [ ] 文件选择取消等平台遗留行为在真实 Web/Tauri 流程核实并收口，不把历史问题描述自动当作当前已复现结论。

离线开关当前只约束经对应网络端口发起的调用，不宣称能够拦截 trusted-js 自行 fetch 或所有尚未迁移的宿主请求。最终范围随网络业务迁移明确。历史安装记录缺少来源时显示未记录，不推造提供者身份。

## 10. 最终收口与不变量

- [ ] 分别定义 manifest/API、package/container、catalog、SDK、本地 installation schema 与插件 KV 的版本/迁移规则；插件自有 KV 由插件迁移。
- [ ] 上游宿主加全部目标定制功能通过合同与必要的平台验收后冻结 API v1；若 MCP 纳入 v1，也需完成其合同，不能只保留接口占位。
- [ ] 全部目标功能通过插件交付后，以插件基座版本替代旧定制分支并停止维护；未完成前不提前退役。

贯穿所有阶段的边界：trusted-js 是用户授权的应用级代码，capability、同源、SHA-256 和 CSP 不构成恶意代码沙箱。摘要用于完整性、缓存和可复现性，不证明发布者身份；第一方远程更新也需 consent。凭据不进入公开投影或插件存储，业务权限由服务端校验；依赖关系不传递权限。安装/授权/恢复 UI 保持受保护，失败不能破坏离线编辑与出厂回退。

不规划新的 iframe/WebView 隔离域，不把签名透明日志、完整运营治理或单纯增加高级攻击成本的机制列为当前迁移前置。

## 11. 本次核对与验证范围

2026-11-14 核对了当前宿主源码、factory lock、SDK/指南、两个外部仓库的 remote/workflow，以及商店相关测试。运行：

```sh
pnpm exec vitest run tests/plugins/store/catalog-client.test.ts tests/plugins/store/store-providers.test.ts
```

结果：2 个测试文件、12 项测试通过，覆盖公共目录地址/相对 artifact 解析及提供者缓存、ETag/304、地址切换等行为。其中 catalog-client 测试和部分 provider 用例来自当前未提交工作区，不能据此标记远端 CI 已通过。

本次未运行全量测试、生产构建、浏览器/原生 WebView 或真实商店/账号操作，也未查询远端 CI/Release。上述项维持待联调/待验收状态，不因路线图更新而自动完成。
