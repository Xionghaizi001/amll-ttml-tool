# AMLL TTML Tool 插件化路线图

本文只记录未完成的工作、仍约束后续工作的决策与已知取舍。已完成阶段的记录不再保留，完成情况以 git 历史与 commit message 为准；架构与协议现状见 `PLUGIN.md`。当前执行入口是“后续实现顺序”，详细清单按前置依赖展开。

## 进度总览

- 已落地：阶段 0–7 的基础架构与运行能力，里程碑 1–3 的远程加载器、商店薄片与 time-shift 试点，trusted-js SDK、本地安装、工具链与 time-shift 外置、单文件开发体验与热重载。
- 尚未落地：边界检查脚本替换、IndexedDB 合库、可读性检测器删除、管理 UI 统一、工具链/插件远端发布、插件依赖/主题作用域/局部覆盖、多商店提供者、阶段 8/9 完整业务迁移、阶段 10 后端、ADR 并入。
- 测试统一位于根目录 `tests/`（镜像源码路径，包测试在 `tests/plugin-api`、`tests/plugin-sdk-js`），随分支入库。

## 后续实现顺序

| 顺序 | 工作 | 前置与完成边界 |
| --- | --- | --- |
| 1（并行） | 边界检查脚本替换、IndexedDB 合库、可读性检测器删除、管理 UI 统一 | 前三项互不依赖；管理 UI 统一另依赖“架构调整点”第 1 条统一 installation 模型，须在阶段 8 第二个插件落地前完成 |
| 2（并行） | 商店提供者 → 插件依赖 → 主题作用域/局部覆盖 | 提供者依赖本地安装；跨提供者依赖解析依赖聚合目录；依赖协议须先于需要共享的迁移插件，主题/覆盖不阻塞无关迁移 |
| 3 | 阶段 8：批量迁移 | 按辅助工具 → 元数据/Ruby/分词 → 帮助/设置/更新 → 可选格式 → 网络服务迁移；toolbar/sidebar 渲染器随首个消费者落地 |
| 4（贯穿） | 开发文档整理 | 随各项实现同步交付；ADR 并入其他文档后删除 |
| 5 | 阶段 9：定制功能插件化 | SDK、外置模板与插件间关系三项就绪；审阅功能开发可与后端并行 |
| 6 | 阶段 10：后端实化与发布 | 提供者合同先完成；资格过滤、kill switch、审计须在审阅插件上架前就绪 |
| 7 | 最终收口 | 全部定制功能通过合同测试后冻结 API v1，完成插件交付后退役定制版分支 |

## WASM 档退役与表单裁剪

决策：extism-wasm 档没有本项目需要的性能收益（负载是小体量歌词文档，Worker 序列化开销大于计算收益），也没有任何已规划的插件必须使用它；其唯一剩余理由“不可信代码沙箱”在“用户对自己的操作负责”的信任模型下不成立。退役后功能插件只有 `trusted-js` 一个运行档，主题保持 `none`。

### 退役范围

- [x] 运行时：删除 `src/plugins/runtime/`（Extism、Worker、回合宿主、协议、WASI 检测）、`src/plugins/adapters/wasm-plugin-service.ts` 及其端口，`@extism/extism` 依赖随之移除。
- [x] 协议：删除 `HostCallV0`/`HostResponseV0`/`PluginReturnV0`/`PluginCommandOutcomeV0`/`FormatConversionResultV0` 等回合协议类型与 schema、`FunctionPluginPackageV0`（base64 WASM 包）、`PLUGIN_EXPORTS`、`FORM_ROUNDS_PER_INVOCATION_LIMIT_V0`、`EXTISM_WASM_HOST_CAPABILITIES`；`runtime` 枚举只剩 `builtin | trusted-js`。capability 声明保留（用于展示与文档），`HOST_METHOD_CAPABILITY` 运行时校验随 WASM 删除。
- [x] 表单续体：`plugin_resume_form` 多轮协议随 WASM 删除；trusted-js 的 `ui.showForm` 继续返回 Promise。
- [x] 分发：catalog `channel` 去掉 `extism-wasm`；商店安装路由、`sample-tools` 示例、`public/plugins/*.wasm`、`examples/plugins/{echo,rust-pdk-echo,csharp-pdk-echo,sample-tools}`、`scripts/build-plugin-pdk.mjs`、`scripts/build-plugin-sample.mjs` 与对应 `pnpm plugin:build:*` 脚本删除；toolkit 的 Rust Extism 模板删除。
- [x] 持久化：`amll-plugins/packages` store 删除（分支未上线，不写迁移）。
- [x] UI：设置 → 插件页中的 WASM 安装、JSON 导入、能力授权弹窗（`PluginPermissionDialog`）与 `?plugin-runtime=1` 诊断页删除；管理入口按“架构调整点”第 1 条合并为一个。
- [x] 测试：`tests/plugins/runtime/**`、WASM 真实宿主合同测试、`MockPluginHost` 中仅服务 WASM 的部分删除；`runHostContractTests` 只保留 MockTrustedJsHost 与真实 trusted-js 宿主两套。
- [x] 文档：`PLUGIN.md` 第 6.1、11.6 节与三档措辞改为两档；本文“当前安全模型”一节的 WASM 条目删除；开发指南第 5 节删除；验收清单 A 部分删除。
- [x] 第三方格式插件改经 trusted-js `formats.register` 接入，`lyrics.format` capability 只作声明。

### 保留

`PluginDocumentV0`、`DocumentOpV0`、稳定 ID、revision、单事务与撤销语义；manifest 判别联合与 contribution 声明；表单 schema（按下文裁剪）；主题包与 CSS 校验；容器解包与 SHA-256；ExtensionScope 与 owner 命名空间；trusted-js 崩溃 marker 与计数。

- 验收：`pnpm test`、`pnpm build`、`pnpm lint:boundaries` 通过；time-shift 出厂副本与本地安装路径不变；仓库内不再出现 `extism`、`wasi`、`plugin_resume_form`；`rg -n "extism|amll_host_call" src packages` 无输出。

### 表单裁剪

表单对 trusted-js 同样有价值：只需“向用户要几个参数”的插件不必自建对话框、主题接入、i18n 与校验。裁剪只去掉属于宿主 UI 决策的字段。

- [x] 删除：`FormAnimationV0`（`FORM_ANIMATION_PRESETS_V0`、`FORM_ANIMATION_SPEEDS_V0` 及 schema/field/group/note 上的 `animation`）、`layout: row | column`、`indent`、`width: compact`、`control: stepper`、`FormIconV0` 与 `FORM_FLUENT_ICON_NAMES_V0`（表单内所有 `icon` 字段）；`DeclarativeFormHost` 中对应的动画 class、`prefers-reduced-motion` 分支与图标映射一并删除。标题栏动作与菜单的图标白名单不属于表单，另行评估。
- [x] 保留：字段类型（text、textarea、number、select、radio、checkbox/switch）、默认值、required 与范围/长度/pattern 校验、选项列表与禁用项、`group`（保留递归）、`note`、`visibleWhen`、自定义 footer 动作、宿主尺寸；提交前 sanitize 与体积上限不变。
- [x] 主题接入：当前 `DeclarativeFormHost` 只继承 Radix 强调色与明暗，未标记 `data-amll-modal-size`，主题 surfaces 与主题 CSS 均无法命中表单对话框。裁剪时补：对话框加 `data-amll-modal-size="medium"`，表单根加一个 slot（如 `plugin-form`，纳入 `THEME_SLOT_NAMES_V0`），字段容器加 `data-part`；表单仍不属于任何插件作用域。
- 验收：time-shift 表单与 SDK Mock 合同测试通过；主题 surfaces 对表单对话框生效；schema 生成文档不再包含被删字段。

## 当前安全模型的冗余项与降级项

定位：用户对自己的操作负主要责任，程序只保证稳定性与平台内的基本安全性。trusted-js 按应用级代码处理，consent 负责告知与授权，不承诺代码沙箱；只有随应用构建的 factory 模块免 consent，所有远程 trusted-js（含第一方更新）均须用户授权。后续机制按以下职责评审。

### 必须保留的稳定性与平台边界

- manifest、协议、表单、主题 CSS、ZIP 路径和解压大小校验，避免损坏、卡死、资源耗尽与 UI 失控。
- trusted-js 的 consent、来源与风险展示、scope 清理和崩溃恢复；SDK capability 声明只用于文档、兼容性及提示，不能宣称可隔离任意 trusted-js 代码。
- 宿主凭据不进入插件存储、文档投影或公开 API，业务 API 在服务端鉴权。trusted-js 可借宿主能力操作用户数据及以当前登录身份调用 API；不向插件提供凭据原文是接口约束，不是同一 JS 环境内的强隔离承诺。

### 降级为完整性、兼容性、恢复与运营措施

- SHA-256、内容寻址与 artifact 字节一致性用于完整性、缓存、回退和可复现构建，不作为发布者身份认证或代码安全边界。
- 同源脚本、CDN 反向代理、immutable 缓存和 catalog `no-store` 用于部署与更新一致性；同源不等于可信。
- `firstParty` 是来源标识；factory/shadow/pin、`minAppVersion` 与平台过滤分别服务于出厂回退、版本兼容和运营策略，不替代用户授权或服务端鉴权。
- crash marker、自动禁用与主题安全模式只负责恢复和可用性；依赖闭包、批次回滚和失败隔离只负责安装一致性与兼容性，不传递权限。
- 资格过滤、kill switch 与必要操作记录用于运营和事故响应，发布溯源复用现有代码托管与 CI 记录。运营上可以不公开部分代码；代码公开后用户可修改源码自行运行，业务权限始终由服务端控制。

本次复核删除的冗余规划已从后续任务与历史决策中移除，不保留延后待办。新增安全机制须说明它如何防止插件故障或平台越界；仅增加高级攻击者成本的治理机制不列入本路线图。

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

## 里程碑 4 前置：trusted-js SDK 固化与开发者体验

第 1 项（SDK 分包与 `TrustedJsHostV0`）、第 2 项（内置插件改用 SDK）、第 3 项（加载器接受 trusted-js 来源安装）与第 4 项（单文件开发体验与热重载）均已交付，接口与合同要点见 `PLUGIN.md` 第 13 节。余下缺口：

- [ ] 里程碑 4 迁出的每个插件都以 SDK 为唯一依赖，time-shift 作为模板。
- [ ] 平台收口：桌面原生 WebView 的 Blob/共享 React 实测；当前 HTML CSP 原已允许 blob，未把全应用 CSP 收紧为仅 `script-src 'self' blob:`（既有 inline/eval 等需求需独立梳理）。
- [ ] 最小调试能力：开发服务提供 source map、模块构建日志和重载原因；宿主显示当前来源为 `dev`，避免把临时构建误认为已安装发布版本。专用开发面板与真实桌面端验收属后续平台增强项。
- [ ] 安全取舍：trusted-js 继续按“用户对自己的操作负责”处理，保留 API/manifest 校验、来源展示、consent、scope 清理和崩溃恢复等必要机制。开发模式的权限与正式 trusted-js 一致，文案明确其可访问应用数据和登录态。

## 插件工具链与 time-shift 外置

本地独立仓库位于同级 `amll-ttml-tool-plugin-toolkit/`、`amll-ttml-tool-plugin-time-shift/`，均未配置 remote。源码真相源：API/SDK 留宿主；插件实现与插件单元测试归独立插件仓库；宿主保留消费锁定 artifact 的真实宿主合同测试。toolkit 的 create/build/test/pack/serve、SDK tarball 与 Release workflow、`factory-plugins.lock.json` 收集器、本地静态源与 Chrome 夹具均已落地，操作见 `docs/plugin-development-guide.md`。

- [ ] 远端交付（后置）：创建/绑定两个远端仓库，发布 SDK/工具链 Release 附件与 time-shift 静态商店，随后把 lock source 指向正式 HTTPS 地址；等待商店后端完成后再推进。当前本地镜像不等于远端已发布；发布后宿主升版才可做到仅改 lock。
- [ ] 平台补测：桌面 WebView 与跨平台 ZIP 可复现性。阶段 8 新插件直接沿用外置模板；有依赖关系的迁移须等待依赖协议。

v0 版本政策：SDK → 插件 → 宿主 lock 协调发布；宿主锁精确插件版本，升级、回退与离线出厂副本原则不变。验收见 `docs/plugin-acceptance-checklist.md`。

## 边界检查脚本替换

`scripts/check-editor-boundary.mjs` 自带目录遍历、import 解析、tsconfig alias 与 `?worker` 后缀处理、全局标识符扫描和 AST 级菜单规则。规则本身有效（见 `PLUGIN.md` 第 13.1 节），但解析器是自研的，每加一层目录都要改脚本。目标是用现成工具承载同一组规则，脚本缩到 100 行以内或删除。可与阶段 8 并行。

- [ ] 分层 import 规则迁到 dependency-cruiser：用 `.dependency-cruiser.cjs` 表达 application/kernel/platform/plugins/states/modules 之间的允许方向、`src/plugins/**` 与 `src/platform` 的正向白名单、`src/plugins/builtin/<plugin>/**` 与 `examples/` 只允许 plugin-api/SDK/React、SDK 包只允许 plugin-api 与 type-only React、`?worker` 资源只能由 platform/runtime adapter 引入、UI 不得直接导入纯算法模块。tsconfig paths 由其原生解析；`?worker` 后缀用路径正则匹配。
- [ ] 全局标识符规则迁到 biome（当前 `@biomejs/biome` 2.x 支持 `overrides` 按路径覆盖）：对 `src/states/**`、`src/application/**`、`src/kernel/**` 开启 `noRestrictedGlobals`，禁止 `document`、`window`、`localStorage`、`fetch`、`indexedDB`、`URL.createObjectURL` 等；对同一路径用 `noRestrictedImports` 禁止直接导入 `idb` 与 `lyricLinesAtom` 所在模块（需要按具名导入限制时用 `importNames`）。
- [ ] 菜单项不得内联 `onSelect`/`onClick`/`onCheckedChange` 属于 AST 规则，biome 不支持自定义规则：要么保留一个只做这一件事的短脚本，要么在 `ContributionMenuItems` 层用类型约束替代（菜单项类型只暴露 `command` 字段）后删除该规则。二选一，倾向后者。
- [ ] `pnpm lint:boundaries` 改为依次运行 `depcruise` 与 biome，CI 工作流命令名不变；删除自研脚本后同步更新 `PLUGIN.md` 第 13.1 节与 agent guide 第 6 节的命令说明。
- 验收：在现有代码上新旧两套检查结果一致（先并行跑一次，差异逐条解释）；故意制造一条跨层导入、一次 state 层直接 `fetch`、一处内联菜单回调，三者都被新工具拦截；CI 通过。

## IndexedDB 合库

分支未上线，没有迁移负担，这是合库唯一的零成本窗口。当前插件与主题相关的库有五个：`amll-plugins`（store：`trusted-js`）、`amll-plugin-kv`、`amll-theme-packages`、`amll-theme-surfaces`、`amll-custom-background`；另有 `amll-autosave-db` 属上游历史快照，不动。每个库各自维护一份 open/upgrade/terminated 重开逻辑。

- [ ] 建立单一库 `amll-extensions`，object store 为：`trusted-js`（manifest、Blob、sha256、source）、`plugin-kv`（复合键 `[pluginId, key]`）、`theme-packages`、`theme-assets`（surface 图片与全局背景图，键为 slot/surface 名）。`src/platform/storage/plugin-database.ts` 的统一升级入口扩展为整个库的唯一 open 点，五个 storage 类改为接收同一个连接。
- [ ] 自定义背景并入主题 surface：`amll-custom-background` 在概念上就是 app-root slot 的用户 surface 图片，改为 `theme-assets` 中的一条记录，`IndexedDbCustomBackgroundStorage` 与设置页“自定义背景”独立入口删除，由主题设置页的 surface 图片入口承接（见下文可读性检测器条目）。
- [ ] localStorage 键保持不变：`amll-trusted-js-plugin-state-v0`、`amll-trusted-js-factory-pins-v0`、主题选择状态与用户 override 属同步小状态，不进 IndexedDB。
- [ ] 卸载语义随之收口：卸载 trusted-js 插件时在同一事务里删除 `trusted-js` 记录与该 `pluginId` 的 `plugin-kv` 范围；卸载主题时同事务删除 `theme-packages` 与其 `theme-assets`。这是“架构调整点”第 5 条持久化原子性在单库下的直接实现。
- 验收：`rg -n 'openDB\(' src/platform` 只剩 `amll-extensions` 与 `amll-autosave-db` 两处；安装、禁用、卸载、刷新恢复、主题应用与恢复默认的既有测试全部通过；DevTools 中只看到两个应用库。

## 可读性检测器删除

`src/kernel/theme/readability.ts`（267 行，WCAG 最差十分位对比度、局部梯度、亮度标准差与最小遮罩求解）与 `src/platform/theme/BrowserImageSampler.ts`（116 行）只为“用户选图后自动算遮罩”服务。没有现成库能替代图片区域可读性判断，但这个判断本身不值得自研维护。

- [ ] 删除上述两个文件及 `ThemeService`/`token-css.ts` 中对 `relativeLuminance` 以外的引用；`relativeLuminance` 与 `contrastRatio` 两个纯函数（约 20 行）移到 `token-css.ts` 内部，继续用于强调色对比文字与 `isSafeThemeColor`。
- [ ] 选图行为改为固定默认遮罩：surface 图片与全局背景图选定后套一个固定不透明度的遮罩（建议 0.35，暗色模式 0.45），设置页保留现有遮罩/透明度滑杆供用户调整，不再弹“已自动调整”提示。`ThemeUserSurfaceImage.scrim` 字段保留，语义从“计算值”改为“用户值”。
- [ ] `customBackground.tsx` 与 `theme.tsx` 中的分析调用、`analysis.recommendation` 分支与相关文案删除；`tests/kernel/theme` 中针对检测器的用例删除，保留 surface 编译与安全色校验用例。
- [ ] 若日后需要自动判明暗，用 `fast-average-color` 取区域平均亮度决定遮罩深浅，不恢复梯度与方差分析。
- 验收：选择任意图片后立即得到带默认遮罩的预览且可用滑杆调整；`rg -n readability src` 无输出；主题相关测试通过。

## 管理 UI 统一

当前插件与主题的管理入口有三处：设置 → 插件（插件商店管理入口、插件网络离线开关、开发模式目录加载与热重载）、工具 → 插件商店（catalog 货架、JS 插件管理、桌面端远程 JS 开关、导入插件包）、设置 → 主题（主题安装、预览、应用、用户 override）。插件与主题仍由不同服务管理。前置：“架构调整点”第 1 条统一 installation 模型（提供单一列表数据源）。

- [ ] 统一为一个“扩展”入口（设置内一页或独立对话框，二选一后不再并存），三个区块：已安装（trusted-js 与主题混排，按 kind 徽章区分，行内启停/卸载/回退出厂/重新授权/查看来源摘要）、商店（现有 catalog 货架与更新提示）、开发（目录加载、热重载、立即重载，仅支持 File System Access 的环境显示）。
- [ ] 主题的预览/应用/恢复默认与用户 override 编辑器保留在主题设置页，但主题包的安装、更新与卸载移入“扩展”已安装列表；主题页只负责“选哪个、怎么调”。
- [ ] 列表数据源只读 `PluginInstallation` 统一模型，运行态细节（crash 计数、consent 状态、factory shadow）由各 service 以附加字段提供，UI 不再分别订阅功能插件与主题的 service。
- [ ] 合并设置页与工具菜单的插件管理入口；桌面端远程 JS 开关按评估结论删除（consent 文案保留 desktop 措辞）。插件网络离线开关的去留随阶段 8 网络服务迁移决定：宿主网络调用迁入同一端口则保留在“扩展”页，否则删除。
- [ ] 受保护区域不变：新入口的 Content 继续标记 `data-amll-protected`，portal 到 body。
- 验收：一个入口完成安装、启停、更新、回退、卸载、开发加载全流程；`plugins.tsx` 与 `PluginStoreDialog.tsx` 合并后总行数明显低于现有 1157 行；主题包的安装/卸载在“扩展”页完成后主题页立即反映。


## 商店提供者抽象与自托管（阶段 10 前置）

动机：允许用户或团队自托管插件后端，同时把阶段 10 官方后端约束为"提供者合同的一个实现"，避免后端接口与客户端各自生长。可在里程碑 4 前置第 3 项定稿后随时开始，与阶段 8 / 9 并行；须在阶段 10 立项前完成，作为后端的公开契约。

- [ ] 提供者合同 `StoreProviderV0 { id, name, catalogUrl, official }`：提供者只需提供清单（沿用唯一的 `RemotePluginCatalogV0` schema）与 zip artifact 两类静态产物，artifact 相对路径按提供者 catalog 所在目录解析；`catalog-client.ts` 由单一同源地址改为多提供者聚合（逐提供者缓存与失败隔离，一个提供者不可达不影响其他货架）。最小自托管后端 = 任意静态文件托管上的 `catalog.json` + 内容寻址 artifact（toolkit 的 `serve`/`pack` 即产出此布局），因此自托管在阶段 10 动态后端出现之前即可用；阶段 10 的资格 / kill switch 等动态能力以提供者描述中的可选端点扩展合同，静态提供者只是缺少这些端点。
- [ ] 来源与覆盖规则：`firstParty` 仅对官方（同源）提供者生效，其他提供者的该字段强制为 false；非官方提供者不得 shadow 出厂插件 id；跨提供者同 id 且 sha256 相同视为镜像、可互相替代，同 id 字节不同视为冲突，官方优先且非官方条目标记为"冲突不可安装"。
- [ ] 非官方提供者的安装路径：商店把 artifact 下载到本地后，一律经本地安装路径入库，各档统一为 fetch → sha256 校验 → 容器剥离 → 对应 `parse*Package` 闸门 → 授权 / consent → 持久化到 IndexedDB → 以本地来源加载；不复用远程 URL 直接执行。trusted-js 使用本地执行来源；其 consent 使用第三方措辞并标注提供者名，桌面 consent 闸门同样作用。官方同源提供者的 trusted-js 仍可走同源动态 import 与 shadow 路径，但同样须经用户 consent；`firstParty` 不豁免授权。
- [ ] 网络与平台：自托管服务须返回 CORS 头；Tauri 端沿用 WebView fetch、同受 CORS 约束，不为此引入原生 http 插件。
- [ ] 用户侧：商店页（受保护区域）提供添加 / 移除提供者，添加时按档位措辞给出警示并注明"该来源的 JS 插件一律按第三方处理"；提供者列表用户级持久化；移除提供者不卸载其插件，仅将它们标记为"来源已移除、不再更新"。
- [ ] 可用性：任一提供者不可达只在其货架显示"不可用"，不进入错误循环；依赖闭包解析（"插件间关系"第 1 项）跨全部提供者求解。
- 验收：用 toolkit `serve` 在本机起一个静态提供者，添加后其 trusted-js 与主题条目可安装、更新、卸载；同 id 镜像与冲突按规则处理；移除提供者后已装插件仍可用但不再提示更新；官方提供者不可达时自托管货架照常。

## 插件间关系：依赖、主题作用域与局部覆盖

动机：阶段 8 会把原本在宿主内部互相调用的功能拆成多个插件（如元数据、Ruby、分词），阶段 9 的定制功能需要为宿主与其他插件提供语言包与专属视觉，这些都要求插件之间可以声明关系。三项顺序为 1 → 2 → 3：主题作用域与局部覆盖都以"目标插件存在且启用"为前提，复用依赖解析与级联规则。硬前置：里程碑 4 前置第 3 项（安装器接受各档来源），否则商店无法自动安装任意档的依赖。第 1 项须在阶段 8 出现首个跨插件依赖前完成；第 2、3 项可与阶段 8 并行，须在阶段 9 开始前就位。

### 1. 插件依赖

- [ ] 协议：`PluginManifestBase` 增加 `dependencies?: { id, version, optional? }[]`（`version` 为 semver range），function 与 theme 包均可声明；`parseManifest` 校验 id 格式、禁止自依赖、每 manifest ≤16 条。v0 依赖只表达"存在、版本范围与激活顺序"，不提供跨插件调用能力；跨插件命令调用作为后续 capability 另行评审。
- [ ] 解析规则：依赖满足 = 目标已安装且已启用且版本落在范围内；出厂副本视为已安装；依赖图必须无环（成环即拒绝安装）；激活按拓扑顺序进行；解析在安装与每次启用时都执行，不只在安装时。
- [ ] 商店安装：catalog 客户端对被依赖项求闭包（跨全部提供者，见"商店提供者抽象"），在一个确认弹窗中列出全部待安装项并按各自档位如实措辞（trusted-js 走 consent、theme 无需授权），用户一次确认后按拓扑顺序安装；任一项失败即回滚本批次已安装项，不留半状态。
- [ ] 手动安装（JSON / zip 导入、开发目录加载）：依赖缺失或版本不匹配时安装成功但状态置为 `disabled(missingDependency)`，插件管理器逐条列出缺失的 id 与版本范围，catalog 中存在时提供"去商店安装"入口；补齐后不自动启用，由用户显式启用。
- [ ] 级联：禁用或卸载被依赖项时，其依赖者自动置为 `disabled(missingDependency)` 并以通知列出；卸载确认弹窗预先列出受影响插件。状态区分 `disabledByUser` 与 `disabledByDependency`：被依赖项重新启用后，仅后者自动恢复启用，前者保持用户决定。
- [ ] 更新：catalog 更新会破坏现有依赖者版本范围时，商店页阻止一键更新并说明；版本选择取满足全部范围的最高版本。
- [ ] 信任边界不变：依赖不传递任何能力，依赖者不获得被依赖者的权限；依赖关系仅影响激活顺序与启用状态。
- 验收：商店安装一个依赖两级的插件，一次确认后三者全部可用；中途失败全部回滚；手动导入缺依赖的插件被禁用并给出补齐指引；禁用被依赖项后依赖者消失，重新启用后自动恢复；重启后状态一致。

### 2. 主题作用域

- [ ] 协议：`ThemePluginManifest` 增加 `scope?: "global" | { pluginId }`，默认 global；插件作用域主题必须同时声明对目标插件的依赖（复用第 1 项，级联规则随之生效）；"主题包与功能包互斥"规则不变。
- [ ] 作用域锚点由宿主打标而非插件自报：插件贡献的视图根（mode mainView、trusted view、titlebar group）由宿主包裹并标记 `data-amll-plugin-scope="<pluginId>"`；宿主渲染的声明式表单与安全 UI 不属于任何插件作用域，不受作用域主题影响。
- [ ] 作用域 CSS 校验：作用域主题的每个选择器必须以 `[data-amll-plugin-scope="<目标 id>"]` 前缀锚定，其后沿用既有 slot / part 规则；功能插件可通过 `contributes.themeParts` 声明自有 part 名（强制 `pluginId.` 前缀、≤32 个）并在自己的 DOM 上以 `data-part` 标记，校验白名单 = `THEME_PART_NAMES_V0` ∪ 目标插件声明的 part。作用域主题的 token 编译到作用域元素而非 `:root`；强调色与 surfaces 属 `<html>` 级 flag，作用域主题不得设置（校验拒绝）。
- [ ] 多主题激活：`ThemeService` 的激活集由单一主题改为"至多一个 global + 每个 pluginId 至多一个"；应用一个主题时，若其作用域已被占用，则新主题生效、被替换者回到"已安装未激活"（最后应用者胜出）。强提醒不止于 toast：在受保护区域弹出确认对话框，点名两个主题及作用域，并提供"撤销本次应用"回退。启动时若持久化状态中出现同作用域多主题（迁移等原因），按应用时间保留最后一个并同样提醒。
- [ ] 安全机制覆盖全部作用域：安全模式、救援快捷键与恢复默认清空所有作用域主题；崩溃标记协议对作用域主题同样生效；用户 token override 仍为全局且在 `amll.user` 层永远胜出。
- [ ] 目标插件禁用时作用域元素消失、主题自然失效但保持激活态；目标插件卸载时按第 1 项级联为 `disabledByDependency`。
- 验收：一个全局主题与两个针对不同插件的作用域主题同时生效且互不干扰；对同一插件应用第二个作用域主题触发强提醒并可回退；作用域主题无法触及宿主 slot、安全 UI 与表单；安全模式一键清空全部。

### 3. 作用域内的局部覆盖

- [ ] 原则：只开放不影响被覆盖者核心功能的声明式表面。v0 可覆盖种类限定为 `localization`（命令 / 菜单 / 标题栏动作 / 设置表单 / 格式 provider 标题等 contribution 的 LocalizedText，以及插件自有字符串表）与 `icons`（宿主图标白名单内的替换）；命令处理器、文档操作、能力、激活事件、格式转换行为、视图组件与任何 id 一律不可覆盖。
- [ ] 协议：覆盖方 manifest 声明 `overrides?: { pluginId, kind, entry }[]`，`entry` 指向包内资源（如 `strings/<locale>.json`），且必须同时声明对目标插件的依赖（复用第 1 项）；覆盖 payload 沿用 LocalizedText 体积上限（≤2048 字符、≤16 语言）与无 HTML 约束；目标中不存在的 key 忽略并记诊断日志。
- [ ] 字符串表：为使插件代码内的文案也可被覆盖，SDK 增加 `host.i18n.t(key)`，读取插件包内声明的字符串表（`contributes.strings` 指向 `strings/<locale>.json`）；覆盖包提供同形状文件。硬编码在代码中的字符串不在覆盖范围内，迁移插件时应走字符串表。
- [ ] 解析：`ExtensionRegistry` 在读取 LocalizedText 时经过按目标 pluginId + contribution id + 字段 + locale 索引的覆盖层；覆盖项归属覆盖方 scope，scope dispose 即撤销、文案即时回退。语言包类覆盖不需要目标插件同意，但插件管理器在目标插件条目上显示"已被 X 覆盖"及来源。
- [ ] 冲突：多个插件覆盖同一目标同一 key 时，最后启用者胜出，并以与主题作用域相同的强提醒方式告知；插件管理器列出覆盖链。
- 验收：安装一个语言包插件后，目标插件的菜单、表单与代码内文案全部切换且核心功能不变；禁用语言包即回退；两个语言包冲突时触发提醒且顺序可预期；覆盖包无法改变目标插件任何 id、命令或能力。

## 阶段 8：批量迁移外围功能

执行清单（time-shift 外置模板就绪后开始）：

- [ ] 外围辅助工具。
- [ ] 元数据、Ruby、分词。
- [ ] 帮助、设置和更新。
- [ ] 文件与格式支持。
- [ ] 网络服务（先迁移 LRCLIB 等业务消费者，并接入网络端口与离线总开关）；GitHub、歌词站、NCM 与 Review 的外置迁移归阶段 9。
- [ ] sidebar contribution 渲染器与首批消费者：节拍器、大纲。`ContributionRegistry` 已有 `sidebar` view kind 但宿主没有渲染位；渲染器随节拍器一起落地，contribution 字段（标题、图标、顺序、默认展开）由这两个消费者的实际需要决定，不预先扩协议。
- [ ] toolbar contribution 渲染器与首批消费者：交付文件的 i18n 支持模块；审阅功能的自定义 toolbar items 归阶段 9 复用同一渲染器。`registerToolbar` 目前同样没有渲染位；渲染位、分组与数量上限随 i18n 模块落地，标题栏动作位不与之合并。

每迁移一个功能，都要求旧入口删除、插件禁用后功能消失、重新启用后状态恢复。本阶段即“里程碑 4”，其前置条件见“里程碑 4 前置”。迁出的插件沿用“插件工具链与 time-shift 外置”的独立项目模板；存在插件间依赖的功能（如元数据 / Ruby / 分词之间的共享）以“插件间关系”第 1 项的依赖声明表达，不得退回宿主内部直接耦合。

### 迁移范围

本节是阶段 8 的范围基线。它只划定边界，不代表本轮已经完成插件适配、源码复制或外置仓库创建；后续实现必须先满足里程碑 4 前置的 SDK/安装/工具链条件，再按下表逐项迁移。

#### 纳入迁移的功能

下列功能属于业务能力或可替换 provider，目标是按 trusted-js 适配为插件，在同级 `amll-ttml-tool-plugin-<name>/` 独立仓库交付。按消费者需要补充公开端口，业务逻辑归插件；宿主核心的内部重构不作为迁移前置。

| 功能组 | 当前代码线索 | 目标插件边界 |
| --- | --- | --- |
| 时间平移 | `amll-ttml-tool-plugin-time-shift/`（已外置，作为模板） | command、表单和单事务文档编辑已走 SDK；宿主消费锁定 artifact |
| 元数据编辑 | `src/modules/project/modals/MetadataEditor.tsx`、`src/modules/project/logic` | 元数据读取/编辑、文件名推导；通过 document/project API，不持有宿主 atom |
| Ruby/罗马音 | `src/modules/lyric-editor/tools/RubyEditor.tsx`、`src/modules/segmentation/utils/Transliteration` | Ruby 生成、分配与批量应用；与分词的共享通过插件依赖声明表达 |
| 分词与词级编辑辅助 | `src/modules/segmentation`、`src/modules/lyric-editor/tools/{ReplaceWordDialog,SyllableSmoothingDialog}.tsx` | 纯算法与交互编辑器均走 trusted-js；统一使用 document-ops |
| 外围辅助工具 | `src/modules/lyric-drag`、非核心批处理/导入辅助对话框 | 仅迁出可由 contribution、command、声明式表单表达的功能；拖拽宿主手势保留，业务变更通过插件命令提交 |
| 节拍器、大纲 | 定制版 sidebar 面板 | sidebar contribution 的首批消费者；渲染器随之落地，见阶段 8 执行清单 |
| 交付文件 i18n 支持 | 定制版 toolbar 模块 | toolbar contribution 的首批消费者；渲染器随之落地，审阅 toolbar items 在阶段 9 复用 |
| 帮助、设置和更新扩展 | `src/modules/settings` 中可独立关闭的业务页/工具 | 设置壳、插件管理、权限与恢复入口留在宿主；可替换的业务设置页/更新检查器再插件化 |
| 网络服务与定制功能 | `src/modules/lrclib`、GitHub/歌词站/NCM 等阶段 9 功能 | 通过明确的网络 capability 与离线总开关接入；凭据由宿主持有，插件只经宿主端口操作 |
| 可选格式 provider | 阶段 7 已定义的非 TTML provider 及未来第三方格式 | 复用 `core.formats` registry；TTML 不在此项迁出 |

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
- 插件间依赖/主题作用域、商店后端与自托管属于路线图中的前置或并行工作项；在相应协议完成前不创建依赖它们的外置插件。
- 任何无法通过 SDK 表达、需要直接访问 Jotai/Tauri/DOM/内部 `TTMLLyric` 的代码，先留在宿主并拆出端口，不以“复制源码”方式绕过边界。

#### 迁出后的统一收尾条件

每个功能在独立仓库交付前，必须完成：SDK-only 边界检查；宿主旧入口和重复实现删除；禁用/卸载后 contribution、监听器、worker 与存储命名空间全清理；重新启用和重启后状态恢复；工厂副本与商店 artifact 使用同一 sha256；宿主只保留锁定版本与加载适配，不再保留该插件的源码真相。

#### 接口与功能映射

| 功能 | 本轮可用的框架接口 | 业务迁移状态 |
| --- | --- | --- |
| 时间平移 | 既有 SDK commands/menus/form/document-ops | 已 SDK-only 并外置，宿主消费锁定 artifact |
| 元数据编辑 | document 投影/metadata ops + 新增只读 `project.getInfo()` | 接口就绪，现有 MetadataEditor 业务实现尚未改写为独立插件 |
| Ruby、罗马音、分词与词级工具 | 既有 ruby/document-ops + 新增 `selection.onChanged`、dialog view 宿主 | 接口就绪，算法与旧工具入口仍在宿主；依赖声明与完整业务迁移另行验收 |
| 帮助、设置扩展 | `settings-view` 接入设置页动态标签；贡献消失时回退常规页 | 插槽就绪；宿主设置壳、权限与恢复入口保留 |
| 网络服务 | trusted-js `network.request/isOffline`、协议 `network.http`、持久化插件网络开关 | 匿名 HTTP 接口就绪；LRCLIB/GitHub/NCM 尚未替换原调用，认证业务端口待实现 |
| 格式 provider、宿主模式 | 既有 `formats.register` / `views.registerMode` 共用 registry | core.formats/core.modes/内置主题仍保留宿主身份，未复制源码 |
| 节拍器、大纲（sidebar） | `ContributionRegistry` 的 `sidebar` view kind | 只有注册接口，宿主无渲染位；渲染器随首个消费者落地 |
| 交付 i18n、审阅工具条（toolbar） | `registerToolbar` | 只有注册接口，宿主无渲染位；渲染器随首个消费者落地 |

实现约束：新增接口不暴露 Jotai、内部 TTMLLyric 或凭据；选择订阅在 host handle dispose 时清理；dialog 按实际 owner 检查，注册消失后自动关闭。网络请求禁携带宿主授权头/cookie，仅允许 HTTPS 和本机 HTTP 开发地址；请求体上限按 UTF-8 字节计算，响应流限制 8 MiB，超时与卸载中断请求，拒绝重定向。离线开关仅拦截经插件端口发起的新请求，不宣称覆盖尚未迁移的宿主网络调用或 trusted-js 自行调用 fetch。

待补验收：接口适配尚未完成浏览器交互冒烟与 Tauri 真机测试；业务迁移后仍须逐项验证禁用、卸载与重启恢复。

SDK 构建边界、React 共享、本地安装与外置模板已落地；余下远端发布与桌面验收见对应章节。后续逐项迁移上表业务消费者并删除旧入口，通过禁用/重启恢复验收后在独立仓库交付。不得据“接口就绪”勾选阶段 8 全部迁移验收条件。

## 贯穿项：开发文档整理

文档地图：`PLUGIN.md`（架构、信任模型、决策理由与协议入口，唯一架构文档）、`docs/plugin-development-guide.md`（插件作者）、`docs/plugin-agent-guide.md`（维护者）、`docs/plugin-acceptance-checklist.md`（验收）、本文（只写未完成项，不写完成记录）。`docs/plugin-protocol-v0.md` 由 `pnpm plugin:api:build` 生成，不入库。`docs/adr/` 按下列待办合并后删除。

- [ ] 删除 `docs/adr/`，把三份 ADR 中其他文档没有的内容并入后再删：ADR 0001 的“决策”各条已被 `PLUGIN.md` 第 6、11、12 节覆盖，只需把“后果”一节的取舍并入 `PLUGIN.md` 第 12 节；ADR 0002 第 9 条（错误码稳定且可序列化、HTTP 非 2xx 不是 RPC 失败、`network-unavailable` 语义）并入 `PLUGIN.md` 第 7 节，“验证要求”并入 agent guide 第 6 节；ADR 0003 第 1 条（`CommandRegistry` 与 `src/modules/keyboard` 分工、`defaultKeys` 只是默认值）与第 4 条（adapter 清单与“adapter 不定义新合同”）并入 `PLUGIN.md` 第 5 节，第 6 条 fail-closed 规则并入第 11.10 节。并入后更新 `PLUGIN.md` 头部、agent guide 与开发指南中指向 `docs/adr/` 的文字。
- [ ] 自动生成扩展：`gen-plugin-docs.ts` 覆盖 `TrustedJsHostV0` 与 SDK 类型。
- [ ] trusted-js 与主题各一份“最小插件 → 构建 → 本地安装 → 发布到 catalog”端到端教程；主题包制作（CSS 校验规则与 slot/part 合同）、分发与商店（zip 容器、catalog、sha256、factory/shadow/pin）章节补入开发指南。
- 验收：新人或 agent 只凭 docs 完成相应插件并通过合同测试；信任模型与分发文档在审阅插件上架前收口。

## 阶段 9：定制功能插件化

执行边界：功能开发可与阶段 10 并行；审阅插件正式上架必须等待后端资格过滤、kill switch 与审计就绪。API v1 冻结与分支退役放在最终收口。

- [ ] 迁出审阅功能：页面壳、FLIP/WAAPI 动画与标题栏动作组由插件的受信任视图承接，report/filter/operation-log 格式化等纯逻辑归审阅插件，通过公开 SDK 接入宿主。
- [ ] 将插件事务接入 review operation log（以审阅插件内的 operation log 形态实现，不再依赖定制版宿主）。
- [ ] 为 agents、vocalTags、多语言和 songPart 增加 capability：不作为原生能力提供，而是作为插件接入现有体系，对应修改插件系统的作用范围。
- [ ] 通知中心、设置页扩展和复杂对话框按 trusted-js 插件 contribution 形态承接。
- [ ] 将 GitHub、Review、歌词站和 NCM 功能迁移为外置插件（非必须功能，且涉及版权或数据安全风险，不内置）。

## 阶段 10：插件商店后端

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
- [ ] 包容器格式（前端部分已在里程碑 2 实现）：本地手写导入用 base64-JSON（保留设置页粘贴导入体验，维持既有紧上限）；商店分发一律 zip（固定布局、加固解包）。两条路径只是容器剥离前端，汇入同一 `parse*Package` 信任边界；格式识别用 magic bytes；手写 JSON 上架由打包脚本一键转 zip；IndexedDB 落盘统一为 manifest JSON + 二进制 Blob，不存 base64。

### 托管形态与发布流水线

参考过的三种模型：Obsidian 社区插件（[obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)，Git JSON 索引 + 作者自托管 Releases，零服务端但无资格 / kill switch / 审计）、Zed 扩展（[zed-industries/extensions](https://github.com/zed-industries/extensions)，Git 索引 + 官方 CI 构建托管，与本项目发布约定最契合）、Open VSX（[eclipse-openvsx/openvsx](https://github.com/eclipse-openvsx/openvsx)，完整注册中心服务，对本项目规模过重）。最终采用 Zed 式主体加自有服务器动态层。

- 托管：artifact 分发与数据库由自有服务器与域名托管。服务器对客户端的公开面即"商店提供者抽象"中的官方提供者（清单 + zip artifact）；trusted-js 产物经应用 origin 的反向代理路径下发，内容寻址，公开 artifact 使用 immutable 长缓存，受限 artifact 遵循上述下载鉴权与缓存策略，服务器不得成为独立脚本 origin。服务端语言与数据库选型随实现立项时确定，本文档不预设。
- 投稿：以 commit 引用投稿（PR 中登记源码仓库 + commit hash），不接受存档文件。PR 阶段由无凭据 CI（fork 的 `pull_request` 工作流）跑 `parseManifest` / `parse*Package` 闸门、能力清单摘要与 toolkit 合同测试，结果以 bot 评论回帖；运营者依据校验结论审批。审批 = 分支保护 + CODEOWNERS + 必需 reviewer，GitHub review 记录即发布审计日志，不自建。
- CI：GitHub Actions 拉取指定 commit 构建，产出并发布 artifact，记录插件 id、版本、sha256、commit hash 与 workflow run id；投稿代码构建不暴露宿主或业务凭据。
- 构建与上架分离：推送成功的产物入库为"已入库未上架"状态，不进入清单；运营者在真实宿主上测试可用性与功能冲突后，经管理端点上架。构建成功不等于插件可用。
- 服务器接收：校验 sha256 与 CI 产物记录一致，拒绝同插件同版本换字节重传，不可变性由服务器强制而非约定。catalog 条目记录 commit hash 与 run id 供溯源。
- kill switch：仅针对受限插件，由后端管理端点自主控制（插件级 / 版本级），与 CI 推送弱相关；在线且成功刷新控制状态时以分钟级生效为目标，离线或请求失败不视为禁用。禁用只停止运行并保留包、数据与缓存；客户端刷新与控制状态合同遵循上文约定。
- 资格过滤：使用 GitHub OAuth 身份与服务端组织资格校验，由 API 选择返回的清单，未登录或无权限用户看不到受限条目；受限下载执行同样的资格校验。身份、清单过滤、下载鉴权与客户端控制状态须在审阅插件上架前就位，按用户锁版本保留扩展入口。
- GitHub 侧产物保留仅作备份（Actions artifact 最长 90 天且下载需鉴权，不可作分发节点）；如需公开镜像与回源兜底，用 Releases 附件。

## 最终收口：API v1 与定制版分支退役

- [ ] 上游宿主 + 全部原定制功能插件通过协议合同测试后，才冻结 API v1。
- [ ] 全部定制功能插件化完成后，以插件基座版本覆盖定制版分支并停止维护该分支；原定制功能经商店分发。


## 架构调整点（未决）

以下不是已实现设计，而是基于 trusted-js 与主题现状仍需评估的决策点。

### 1 统一 installation 领域模型

当前 trusted-js 与主题各自定义来源、状态、安装记录和摘要字段。可以考虑建立宿主内部统一模型：

```ts
interface PluginInstallation {
  id: string;
  kind: "function" | "theme";
  runtime: "builtin" | "trusted-js" | "none";
  version: string;
  source: PluginSource;
  artifact?: ArtifactIdentity;
  enabled: boolean;
  installedAt?: number;
}
```

该模型只统一目录和管理语义，不应强迫功能插件与主题共用不适合的载荷字段。管理入口的合并计划见“管理 UI 统一”一节，本条是其数据源前置。

### 2 统一生命周期状态机

trusted-js 对外只有三态，主题是 active/preview/safe mode。管理 UI 需要了解两套内部细节。可以定义共同的管理态，例如 `installed → loading → active → failed/disabled/crash-disabled`，再保留各类扩展的内部细节；同时明确“加载失败”和“连续运行失败”是否同属 crash 计数。

### 3 生命周期编排边界

功能插件与主题由独立 service 管理。统一管理 UI 需要共同的安装、恢复、启停和卸载操作；是否抽取编排接口应由 UI 的实际需要决定，并保留功能执行与主题预览、应用、安全模式各自的语义。

### 4 策略与机制分离

当前 factory shadow、desktop gate、same-origin、consent、capability negotiation 分散在 load plan、loader 和 UI 接线里。可以把“候选版本选择”和“是否允许执行”建模为显式 policy result，使 UI 能展示被拒绝的具体原因，runtime 只执行已经批准的 plan。

### 5 持久化原子性

需要统一以下语义：

- 保存 package 失败是否必须使安装失败；
- 更新失败如何恢复旧 package、旧 consent 和旧运行实例；
- package、授权、enabled 状态和 KV 删除是否需要同一事务或可恢复日志；
- localStorage 不可用时，哪些状态允许退化为会话级。

trusted-js 已实现较完整的更新回滚，可作为主题安装流程的参考行为。

### 6 Catalog provider 与 artifact identity

当前 catalog 假设单一同源来源，factory lock 也只记录 source URL/路径。多商店落地前应先稳定：

- provider id 与官方标记；
- artifact identity 是 `(sha256)` 还是 `(provider, id, version, sha256)`；
- 同 id 同摘要镜像和同 id 不同摘要冲突；
- 相对 artifact URL 的解析基准；
- provider 移除后已安装插件的来源状态。

### 7 依赖与组合

当前 manifest 没有依赖图，插件只能通过宿主公开 capability 和 contribution 间接协作。加入依赖前需要先决定版本约束、可选依赖、跨 provider 求解、启停级联、循环检测和 factory 依赖是否允许被第三方版本满足。

### 8 协议版本与迁移

API、theme API、token 和 catalog 当前都是 v0；持久化记录没有统一 schema version/migration 模型。进入 v1 前需要把以下版本分开治理：

- manifest/API 兼容版本；
- package/container 版本；
- catalog 版本；
- trusted-js SDK 版本；
- 本地 installation record schema 版本；
- plugin-owned KV 数据版本（由插件自己迁移）。

### 9 可观测性

trusted-js 主要使用 warn/crash 状态，主题有自己的 safe-mode 记录。可以统一为宿主管理事件：install、load、activate、call、disable、rollback、uninstall，并统一错误码、时间、plugin id、版本和 runtime 字段；日志不能包含歌词正文、表单私密输入或网络凭据。

### 10 文档同步

架构调整完成后同步 `PLUGIN.md`、开发指南与 agent guide；ADR 按“贯穿项：开发文档整理”并入后删除，不再单独维护决策记录。

### 11 安全改造优先级

若下一轮以缩小实际风险为目标，建议按以下顺序处理：

1. 要求所有远程 artifact 必须声明 SHA-256，并让主题与 trusted-js 统一复核 catalog 与包内身份。
2. 取消“未校验字节便直接 import 的裸 trusted-js”路径，或改为 fetch → 摘要校验 → Blob import，使 consent key 与实际执行字节绑定。
3. 统一安装持久化的失败语义，确保 UI 报告“已安装”前 package、授权和 enabled 状态已经可靠落盘。
4. 将 CSP 收紧作为独立工程处理，先盘点现有 inline/eval、Blob、Worker、Tauri IPC 和开发服务器需求，再用生产构建测试锁定策略。
5. 多 provider 上线前定义 provider 身份、强制摘要、冲突和撤销模型；只有生态规模和风险证明需要时再引入发布者签名与透明日志。

这些改动不改变 trusted-js 的根本定位。只要它仍在应用上下文执行，摘要、签名和 CSP 最多加强供应链与准入，不能把它变成沙箱；需要真正隔离时必须引入新的 iframe/WebView 执行域和更窄的消息协议，本路线图不规划该项。

### 评审顺序

若以本文为基础调整架构，建议按以下顺序做决策：

1. 先冻结四个正交维度和统一 installation 身份，不碰 runtime 实现。
2. 定义共同管理状态、错误和持久化成功语义。
3. 根据管理 UI 需要决定生命周期编排边界，并用现有 trusted-js 合同测试与主题测试证明行为不变。
4. 再加入 provider 与 artifact identity，否则依赖解析缺少稳定来源模型。
5. 在 provider 模型稳定后设计依赖图和更新求解。
6. 最后冻结 v1 版本策略、迁移规则和发布合同。

每一步都应保留第 12 节的不变量，并用现有真实宿主合同测试验证 command → form → transaction → undo、启停清理、崩溃恢复和 factory 回退路径。

### 主题遗留

- v0 已定义但尚未桥接到组件的 token：color.accent 之外的 textPrimary/textSecondary/border/danger、font.scale、spacing.radius、lyrics.wordText/wordSecondaryText/wordHighlight、spectrogram.lineSegment/wordSegment/gapSegment/waveform（频谱段颜色需接入 canvas 调色板）。CSS 变量已按约定名编译，按需在 base 层加 var() 桥接即可，不动协议。
- 主题编辑器 MVP 仅覆盖高频 token 的声明式输入；完整 token 编辑器与“导出为主题包”留待后续。
- 原按 localStorage 设计的主题包体积上限可以放宽，新上限与分发容器格式在阶段 10 一并定档（IndexedDB origin 配额与自动保存/历史快照共享，仍需显式上限）。

### 其他已知取舍

- theme 货架 zip 路径已实现但 CI catalog 暂未发布主题条目。
- `document.undo/redo` 与 `selection.changed` 事件类型已定义但暂未派发；`minAppVersion` 客户端未强制（静态薄片由 CI 保证，后端实化时启用）。
- 浏览器文件选择器取消时 Promise 不 resolve（与旧行为一致）；Ctrl+O 的音频路径依赖 `HostOpenedFile.asFile`。
