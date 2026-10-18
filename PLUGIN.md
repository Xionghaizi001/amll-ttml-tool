# AMLL TTML Tool 插件系统架构

状态：当前实现快照，唯一的架构参考  
协议状态：experimental v0

本文描述插件系统已经存在的代码、边界、决策理由和运行路径，是架构、信任模型与协议入口的唯一权威说明。插件作者阅读 `docs/plugin-development-guide.md`；维护者阅读 `docs/plugin-agent-guide.md`；验收步骤见 `docs/plugin-acceptance-checklist.md`；未完成事项与架构调整点只记在 `goal.md`。v0 允许破坏性变更，在全部原定制功能插件通过合同测试前不冻结 v1。

内核永久保留产品的实时核心能力：歌词文档模型与事务、时间轴与打轴交互、AMLL 预览渲染、频谱与波形、音频解码与播放。插件开发合同要求通过公开宿主端口访问文档和 UI，不得直接依赖 React 内部状态、Jotai、Tauri、内部 `TTMLLyric`、音频 PCM 或频谱数据。这是兼容性与源码依赖约束，不是对任意 trusted-js 的运行时隔离。

## 1. 权威来源与阅读规则

发生冲突时，按以下顺序判断当前行为：

1. `packages/plugin-api/src/types.ts`：公开 TypeScript 合同。
2. `packages/plugin-api/src/schema/schemas.ts`：跨边界数据的运行时结构校验。
3. `packages/plugin-api/src/parsers.ts`、`capabilities.ts`：跨字段约束与 capability 声明。
4. `packages/plugin-sdk-js/src/host.ts`：trusted-js 宿主能力面。
5. `src/plugins/**`、`src/kernel/**`、`src/platform/**`：宿主实际行为。
6. 本文、开发手册和 `goal.md`：架构决策、使用说明和后续规划。

`docs/plugin-protocol-v0.md` 由 `pnpm plugin:api:build` 生成，不入库。本文中的决策说明与当前实现同步；协议字段仍以源代码、Schema、parser 和合同测试为准。

本文使用以下标记：

- **已实现**：主代码路径已经接通。
- **部分实现**：合同或某个运行档已实现，但其他运行档、平台或 UI 尚未统一。
- **规划**：只存在于路线图或设计说明中。

## 2. 系统一句话模型

插件系统把一个外部或随应用交付的 **artifact**，经过容器剥离、语义校验、按运行档授权和持久化，变成一个可启停的 **installation**；运行时为它创建带所有者的 **extension scope**。公开宿主端口提供文档修改、contribution 注册和主题数据接口，卸载 scope 即撤销经它管理的宿主注册。

```mermaid
flowchart LR
    A[插件源码] --> B[toolkit build / pack]
    B --> C[ZIP / JSON artifact]
    C --> D{来源}
    D -->|本地导入| E[容器剥离]
    D -->|商店 catalog| F[下载 + 可选摘要校验]
    D -->|开发目录| E
    D -->|factory lock| G[构建期收集]
    F --> E
    G --> H[内置模块 / 同一商店 artifact]
    E --> I[按类型 parse 闸门]
    I --> J{插件档位}
    H --> J
    J -->|trusted-js| L[TrustedJsPluginService]
    J -->|theme| M[ThemeService]
    L --> N
    N --> O[命令 / 菜单 / 表单 / 标题栏 / 格式 / 视图 / 模式]
    L --> P
    M --> Q[token / 受限 CSS / 本地资源]
    P --> R[Kernel 与平台端口]
    O --> R
    Q --> R
```

## 3. 四个正交维度

当前代码里“插件类型”“执行方式”“来源”和“交付方式”容易被混为一谈。调整架构时应把它们视为四个独立维度。

| 维度 | 当前取值 | 决定什么 |
| --- | --- | --- |
| 插件类型 `kind` | `function`、`theme` | 包的语义；功能包与主题包互斥 |
| 执行方式 `runtime` | `builtin`、`trusted-js`、主题专用 `none` | 代码是否执行、宿主接口与生命周期 |
| 安装来源 `source` | `user`、`dev`、`store`，主题为 `builtin/installed`，trusted-js 另有 factory 概念 | 持久化、展示、更新与回退策略 |
| 交付方式 | factory bundle、catalog artifact、catalog 裸模块、本地 ZIP/JSON、开发目录 | artifact 如何到达语义解析闸门 |

这四个维度目前没有一个统一的 `PluginInstallation` 模型。功能插件与主题服务各自保存相近但不同的记录，因此“插件列表中的一行”实际上是 UI 对两类服务状态的聚合视图。

## 4. 核心领域对象

| 对象 | 当前含义 | 主要实现位置 |
| --- | --- | --- |
| `PluginManifest` | 插件身份、版本、类型、运行档、能力请求和静态 contribution 声明 | `packages/plugin-api/src/types.ts` |
| Package | 已解包且可语义校验的载荷；分别为 trusted-js 代码或主题数据 | `TrustedJsPluginPackageV0`、`ThemePackageV0` |
| Artifact | 传输单元，当前支持固定布局 ZIP 和 JSON | `src/plugins/store/package-container.ts` |
| `RemotePluginCatalogEntryV0` | 商店货架条目，描述 artifact 身份、通道、摘要和平台 | `packages/plugin-api/src/remote-catalog.ts` |
| Installation | 某个插件在本机的 manifest、载荷、来源、授权和启用状态 | 目前由功能插件与主题各自的 service/storage 表达 |
| Runtime instance | 一次已加载执行实例及其临时资源 | `PluginInstance`、`LoadedInstance` |
| `ExtensionScope` | 某个 owner 注册到宿主的全部命令、贡献点和事件监听的生命周期容器 | `src/kernel/extensions/ContributionRegistry.ts` |
| Contribution | 插件向宿主声明或动态注册的扩展项 | command、menu、settings、titlebar action、format、trusted view、mode 等 |
| Host port | 插件可调用的宿主能力，不暴露宿主内部对象 | `TrustedJsHostV0` |
| Plugin document | 内部 `TTMLLyric` 的稳定 ID 投影 | `PluginDocumentV0` 与 `PluginDocumentGateway` |
| Runtime state | active/disabled/crash 等运行态和诊断 | trusted-js 维护 |
| Plugin KV | 按 plugin id 分命名空间的 JSON 值存储 | `IndexedDbPluginKvStorage` |
| Factory copy | 随应用交付、离线可用，可被更高版本更新遮蔽的 trusted-js 副本 | `factory-plugins.lock.json`、`factory-plugins.ts` |

### 4.1 身份关系

当前稳定身份是 `manifest.id`，使用反向域名格式。以下对象都以它为连接键：

- catalog 条目与包内 manifest；
- 持久化 package 和 KV 命名空间；
- runtime instance；
- extension owner；
- command、view、format 等 contribution 的命名空间；
- crash、consent、禁用和 factory pin 状态。

当前模型默认同一 `pluginId` 同时只有一个活动版本。factory、已安装版本和远程候选不是并存实例，而是先解析出一个加载计划，再由选中版本占用该 id。

### 插件依赖 v0

公开类型、JSON Schema、manifest 语义校验、安装闭包、版本求解、拓扑激活与运行时依赖检查均已实现；级联启停状态仍由统一管理器继续细化。

function（含 builtin/trusted-js）与 theme 共用 `PluginManifestBase.dependencies?: PluginDependencyV0[]`：

```json
{
  "dependencies": [
    { "id": "dev.amll.metadata", "version": "^1.2.0" },
    { "id": "dev.amll.ruby", "version": ">=1.0.0 <2.0.0", "optional": true }
  ]
}
```

- 字段省略或 `[]` 均表示无依赖；最多 16 条，必需和可选合计。每条只能含 `id`、`version`、`optional`；前两项必填，`optional` 必须为布尔值，省略按 `false` 解释，不改写输入。
- `id` 与插件自身 id 使用相同的小写反域名格式；禁止自依赖和重复 id（包括必需/可选重复）。跨插件环检测属于后续图解析，单 manifest 校验不访问安装状态或网络。
- `version` 为 1–256 字符的非空 node-semver 7 range，使用默认严格模式（`loose: false`）；支持精确版本、`^`、`~`、比较器组合、通配符、连字符区间与 `||`。空白字符串、tag、URL 与非法 range 拒绝；合法但无可满足版本的范围由后续求解报告。匹配沿用默认 `includePrerelease: false`，预发布版本须由对应版本元组的预发布比较器显式纳入；build metadata 不影响版本优先级。
- Schema 负责结构、id 格式与数量/长度；`parseManifest` / `parseManifestSchema` 额外校验 range、自依赖和重复 id。trusted-js 与 theme 包解析器复用同一校验，不能仅凭 JSON Schema 判断语义有效。`plugin-api` 显式依赖纯 JavaScript 的 `semver` 包并列入边界白名单，统一 range 语法，仍不依赖宿主或浏览器 API。

后续运行时须遵循的协议语义：必需依赖要求目标已安装（含 factory）、已启用且版本匹配；可选依赖缺失、禁用或版本不匹配时不阻止依赖者，也不触发自动安装、启用或升级。可选目标可用时参与激活排序；依赖图由必需边与可用的可选边组成，须无环。可选目标失效不触发依赖禁用级联。数组排列不决定激活顺序；安装和每次启用均须重新解析。

依赖只表达存在、版本范围与激活顺序，不提供跨插件模块导入、命令调用或共享对象，不传递 capability、consent 或权限。跨插件调用需要另行定义 capability；主题与功能包互斥规则不变。旧宿主可能拒绝此新增字段，v0 插件发布须与宿主/API 工具链协调升级。

## 5. 分层与依赖边界

```mermaid
flowchart TB
    UI[src/plugins/ui + modules/settings + plugin-store]
    ADAPTER[src/plugins/adapters]
    SERVICE[trusted-js / theme services]
    RUNTIME[src/plugins/runtime]
    KERNEL[src/kernel]
    PLATFORM[src/platform]
    API[packages/plugin-api]
    SDK[packages/plugin-sdk-js]

    UI --> ADAPTER
    ADAPTER --> SERVICE
    SERVICE --> RUNTIME
    SERVICE --> KERNEL
    ADAPTER --> PLATFORM
    RUNTIME --> API
    SERVICE --> API
    SDK --> API
    KERNEL --> API
```

各层职责如下：

| 层 | 职责 | 不应承担的职责 |
| --- | --- | --- |
| `plugin-api` | JSON 可表达的公开合同、Schema、parser、能力声明规则 | React、DOM、Worker、Tauri、内部歌词模型 |
| `plugin-sdk-js` | trusted-js 的强类型宿主 facade、Mock 和合同测试 | 宿主实现、内部 alias、状态容器 |
| `kernel` | 文档事务、命令和 contribution 注册、格式与主题核心 | 插件容器、远程 catalog、React 页面 |
| `plugins/adapters` | 公开投影与内部模型转换、服务接线 | 新造一套协议或绕过事务服务 |
| `plugins/trusted` | trusted-js 的信任闸门、状态、factory 解析和本地安装 | 假装提供代码隔离 |
| `plugins/store` | catalog、摘要校验、容器剥离、分发安装路由 | 自行执行插件或重复实现语义校验 |
| `plugins/ui` | 权限、consent、管理器、表单和视图宿主 | 直接持久化插件或写歌词 atom |
| `platform` | IndexedDB、Blob URL、DOM style 等环境适配 | 插件策略和业务规则 |

核心依赖规则是：协议不依赖宿主，kernel 不依赖插件 UI/runtime，公开插件 API 的文档写入统一进入 `EditorDocumentService` 的事务路径。

命令由 `src/kernel/commands/CommandRegistry.ts` 统一执行、查询、校验 owner、处理 enablement 和冲突；`src/modules/keyboard` 只负责快捷键持久化、按键匹配和模式快捷键 UI。manifest 的 `defaultKeys` 只是命令默认值，不直接写入用户快捷键配置，所有调用入口最终都使用同一个 command handler。

`src/plugins/adapters` 只负责公开投影与宿主内部模型之间的转换和端口接线，包括文档、host service、manifest contribution、格式/file-flow 和 enablement adapter。adapter 不定义新的公开合同，也不能绕过 parser、事务服务或权限检查。

## 6. 插件档位模型

| 档位 | 信任与隔离 | 能力面 | 生命周期管理 | 当前持久化 |
| --- | --- | --- | --- | --- |
| 宿主内置 `builtin` | 与应用同一信任根、同一 JS 上下文 | 内部 scope，可注册核心 mode/format/theme | 宿主启动代码 | 随应用构建 |
| `trusted-js` | 经准入后视为应用全权；没有安全隔离 | `TrustedJsHostV0`，含 React view、mode、format、匿名 HTTP | `TrustedJsPluginService` + `InstalledTrustedJsService` | IndexedDB `amll-extensions/trusted-js`，运行状态另存 localStorage |
| theme / `none` | 不执行代码；声明式 token、受限 CSS、本地资源 | `ThemeService` | 注册、预览、激活、安全模式 | IndexedDB `amll-extensions/theme-packages`，选择状态另存 key-value storage |

### 6.1 trusted-js

关键规则：

- factory 模块由应用构建产出，跳过远程来源与用户 consent 检查，但仍参与 crash 记账。
- 非 factory 模块必须通过 API 版本、同源或本地 Blob、用户禁用、崩溃禁用和 consent 检查。
- 第三方本地/商店代码以 Blob 持久化，加载时创建 Object URL。
- 本地/商店 Blob 包以代码内容摘要作为 `consentKey`，同 id 内容变化会重新 consent；开发模式在当前会话复用授权，远程裸模块行为见 11.5。摘要只用于内容识别，不代表代码可信。
- `activate({ pluginId, host, signal })` 可返回 cleanup；停用顺序为 abort → cleanup → host handle dispose → scope dispose → Object URL revoke。
- 注册的 command、menu、titlebar、format、mode、view 和事件都归同一个 owner scope。
- factory 更新采用 shadow 模型：更高 semver 的远程或已安装版本可遮蔽 factory；“卸载更新”通过 pin 回退到随应用副本。
- pending crash marker 在执行插件代码前写入，由宿主确认稳定启动后清除；连续失败 3 次进入 `crash-disabled`。

trusted-js 对宿主拥有与应用代码相同的实际权限。`TrustedJsHostV0` 是兼容性和生命周期边界，不是安全边界；即使宿主提供受控 `network.request`，trusted-js 仍可能直接使用浏览器能力。

### 6.2 主题

**已实现。** 主题与功能插件包互斥，不执行代码：

- `ThemePackageV0` 包含 manifest、tokens、受限 CSS 和内联二进制资源。
- parser 校验 token 版本、颜色、资源引用、选择器范围和危险 CSS 结构。
- 资源转换为本地 Object URL，切换或卸载时撤销。
- theme layer 与 user override layer 分离，用户覆盖优先。
- preview 与 active set 分开：至多一个 global 和每个 pluginId 各一个主题；同作用域替换经受保护对话框提示，支持撤销，恢复时按应用时间仲裁。
- 作用域 CSS 必须精确锚定宿主生成的 `data-amll-plugin-scope`，允许宿主公开 part 与目标 `contributes.themeParts`（自身 id 前缀、最多 32 个）。包解析延迟的目标 part 检查由宿主安装/激活/渲染补齐；CSS `@scope` 下边界排除嵌套插件与受保护区域。
- 作用域 token 编译到视图根，拒绝 accent/surfaces；用户 token 在 `amll.user` 同时覆盖根与插件后代。声明式表单、安全 UI 不归属插件作用域。
- 目标禁用只移除视图根而保留主题选择；目标缺失或版本不兼容投影为 `disabledByDependency`，不注入样式。
- 启动 crash marker 覆盖所有作用域；安全模式、救援快捷键和恢复默认清空全部选择。
- permission、插件管理和错误恢复 UI 位于受保护区域，不受主题 CSS 控制。

### 6.3 宿主核心与 factory 插件

当前存在两种“随应用交付”概念：

- **宿主核心**：编辑模式、宿主原生 TTML 格式、内置主题等直接由宿主注册，公开插件接口不开放替换；它们提供默认功能与恢复基座。
- **factory 插件**：已插件化但仍随应用离线交付的功能。当前 `builtin.time-shift` 由独立仓库构建 artifact，宿主用 `factory-plugins.lock.json` 锁定版本与 SHA-256，并在构建期生成 bundled loader。

factory 是来源/分发策略，`trusted-js` 是运行档。两者不应在未来的统一模型中合并成一个枚举。

## 7. 公开协议模型

### 7.1 Manifest 与 contribution

`PluginManifest` 是 `FunctionPluginManifest | ThemePluginManifest` 的判别联合。function manifest 包含：

- 身份：`id`、`name`、`version`、可选作者/主页/许可证；
- 执行：`apiVersion`、`runtime`、`entry`；
- 能力声明：`capabilities`；
- 静态扩展：commands、menus、settings、titlebar actions、formats；
- 激活提示：startup、command、document changed。

Contribution 不是任意 UI 注入。trusted-js 通过 SDK 注册声明式 contribution、React view 与 mode。所有插件 id、command id、view id 和 format id 必须落在自己的命名空间，注册冲突直接失败。

`ExtensionScope` 是贡献生命周期的核心抽象：所有注册返回 disposable，scope 按注册逆序释放。插件崩溃、禁用或卸载时销毁 scope，宿主不需要逐项猜测它注册过什么。

### 7.2 Capability

当前核心 capability：

| Capability | 含义 | trusted-js host facade |
| --- | --- | --- |
| `lyrics.core` | 读取投影、选择与基本编辑 | 文档与选择 API 可用 |
| `lyrics.ruby` | 读取和修改 ruby | 投影当前包含 ruby |
| `lyrics.format` | 文本与歌词投影转换 | `formats.register` |
| `ui.notify` | 纯文本通知 | `ui.notify` |
| `ui.form` | 声明式表单 | `ui.showForm` |
| `storage.kv` | 插件命名空间 KV | `storage.kv` |
| `network.http` | 无凭据匿名 HTTP | `network.request` |
| `extensions.<reverse-domain>.<name>` | 定制扩展能力 | 由具体宿主约定 |

能力匹配是精确匹配，不支持通配符。capability 是展示与文档声明；trusted-js 已被视为全权代码，其 SDK 能力面主要用于兼容与资源生命周期，不能阻止插件绕过 facade 使用 Web API。

### 7.3 文档模型与事务

文档 API 返回 `PluginDocumentV0`，不提供内部 `TTMLLyric` 引用：

```text
PluginDocumentV0
  revision
  lines[]
    id
    words[].id
    timing / text / translation / romanization / ruby ...
  metadata[]
  extensions?
```

写入使用 `DocumentOpV0[]`，包含按稳定 ID 更新、插入、删除、移动、元数据替换和整文档替换。共同不变量：

1. 一批 op 原子提交为一个事务、一个 revision、一个撤销记录。
2. 跨异步边界计算的编辑应携带 `expectedRevision`；冲突返回 `revision-conflict`。
3. adapter 按 ID 合并，投影没有暴露的内部字段保持原值。
4. 新行和新词的 ID 由宿主分配。
5. 变更事件携带来源和受影响的稳定 ID；插件自身造成的事件不会反向形成无限回路。

trusted-js 的一次 `host.document.applyEdit()` 是一个事务，插件若连续调用多次会产生多个事务。

## 8. Artifact、安装与更新

### 8.1 固定容器

容器格式通过 magic bytes 识别，不依赖扩展名：

- ZIP：根目录 `manifest.json`，载荷位于 `assets/<entry>`；
- JSON：已组装的 package object。

容器层只负责安全解包和组装：限制总大小、条目数、单项大小，拒绝绝对路径、反斜杠、dot segment、重复项和未声明文件。语义合法性仍必须进入对应的 `parseFunctionPluginPackage`、`parseTrustedJsPackage` 或 `parseThemePackage`。

### 8.2 商店安装路径

```mermaid
sequenceDiagram
    participant C as Catalog client
    participant S as Store installer
    participant U as Container unpacker
    participant P as Semantic parser
    participant R as Runtime-specific installer
    participant D as Persistence

    C->>S: catalog entry
    S->>S: fetch artifact
    S->>S: verify SHA-256（catalog 声明时）
    S->>U: ZIP/JSON bytes
    U-->>S: kind + package candidate
    S->>P: parse matching package
    P-->>S: validated package
    S->>S: verify catalog id/version and matching API version
    S->>R: install by runtime/kind
    R->>D: persist grant/code/data
    R-->>C: installed or cancelled/error
```

本地导入复用相同容器和语义闸门。开发目录最终也进入对应 service，但 `dev` 来源只在当前会话有效。多提供者与自托管目录已支持，见下文“商店提供者 v0”。

跨边界错误使用稳定、可序列化的 `PluginErrorCode` 与 `HostResult<T>` 表示。权限、参数、revision 冲突、取消、超时、payload/limit、崩溃、网络和内部错误保持可区分；HTTP 非 2xx 表示请求已完成传输并由 `HttpResponseV0` 携带状态，不当作 RPC 失败。离线或传输失败使用 `network-unavailable`，调用方据此决定重试或提示。

### 8.3 Factory 构建路径

独立插件仓库负责源码和插件单元测试，toolkit 产出可复现 ZIP 与内容寻址 catalog。可复现合同限定相同输入文件名、字节及锁定依赖：固定 UTF-16 码元排序、压缩级别、DOS 时间与平台属性，使用跨语言/时区固定摘要回归和三平台 CI 验收；不归一化源码换行，也不保证不同构建器版本生成相同代码。宿主只消费锁定 artifact：

```text
独立插件仓库
  -> toolkit build/test/pack
  -> <sha256>.zip
  -> factory-plugins.lock.json (id + version + sha256 + source)
  -> 宿主构建期验证并生成 loader/catalog
  -> 应用内置 factory copy
```

这个路径保证随应用副本与商店分发的是同一组字节。当前远端 Release/静态源发布尚未配置完成，本地 `vendor/plugin-store` 是离线镜像。

## 9. 生命周期与资源所有权

一个功能插件加载后的资源所有权应理解为：

```text
plugin id
  installation record
  runtime instance
    worker/module/object URL
    abort signal / invocation queue
    extension scope
      commands
      contributions
      event listeners
    host handle
      document/selection subscriptions
      open trusted views
      network cancellation
  durable KV namespace
  crash/consent/enabled state
```

卸载与禁用必须先停止新的调用，再取消在途工作，执行插件 cleanup，释放宿主 handle 和 scope，最后关闭 runtime。真正“卸载”还会删除 package、授权/consent、状态和该 id 的 KV；普通“禁用”保留安装数据和 KV。

trusted-js 按上述顺序管理生命周期。主题则使用另一套注册/激活/预览模型。

## 10. 持久化模型

| 数据 | 当前位置 | 键 | 备注 |
| --- | --- | --- | --- |
| trusted-js manifest、Blob、SHA-256、source | IndexedDB `amll-extensions/trusted-js` | plugin id | `dev` 不写入 |
| trusted-js consent/crash/pending/disabled | localStorage | plugin id map | 写失败时退化为会话内状态 |
| factory pin | localStorage | plugin id list | 控制是否回退随应用副本 |
| 插件 KV | IndexedDB `amll-extensions/plugin-kv` | `[pluginId, key]` | 卸载时清除，禁用时保留 |
| 已安装主题包 | IndexedDB `amll-extensions/theme-packages` | theme id | 从旧 localStorage 迁移 |
| 当前主题、安全模式、用户覆盖 | 同步 key-value storage | 固定设置键 | 与主题包分开 |
| 插件网络离线开关 | atom storage/localStorage | `amll-plugin-network-offline` | 只约束 host network port |

安装持久化采用“提交后发布、失败补偿”：主题安装/卸载等待包和资源事务完成；trusted-js 正式安装在执行候选代码前等待包写入，失败恢复旧包、consent/启停状态和运行实例，激活及批次失败恢复安装前 KV 快照。卸载先停止运行，删除授权状态，再原子删除包与 KV；失败尝试恢复快照及旧实例。KV 读写/清理与授权、启停、factory pin 的 localStorage 写入错误向上传播，不降级为成功。主题旧数据迁移失败保留原数据供重试。

包/KV、主题包/资源各自使用 IndexedDB 事务；localStorage 与 IndexedDB 之间采用补偿，并非跨介质原子事务，也不保证进程在中间步骤被强制终止后的原子性。若持续存储故障使回滚本身失败，返回明确的“回滚失败”错误，不报告安装成功；任意插件代码对文档、网络或宿主全局的副作用不在此快照内。开发热重载不回滚 KV 数据。

## 11. 用户责任、稳定性与信任模型

用户对自己的安装、授权和操作负主要责任，程序的职责是保证稳定性。trusted-js 按应用级代码处理；consent 负责告知与授权，来源标识帮助用户选择，均不承诺代码安全或沙箱隔离。校验、事务、资源限制与恢复机制负责减少损坏、资源耗尽、UI 失控和故障后的不可用；这也不意味着宿主能中断同一 JS 上下文中的任意死循环。

### 11.1 机制职责

| 对象 | 稳定性与接口目标 | 当前机制 |
| --- | --- | --- |
| 歌词文档和撤销历史 | 防止部分写入、并发覆盖和内部字段丢失 | 公开投影、稳定 ID、revision、原子事务、adapter 保留内部字段 |
| 用户选择和项目信息 | 提供稳定的数据接口 | 公开投影与只读快照；不限制 trusted-js 的实际数据访问 |
| 登录态、PAT 和业务身份 | 宿主接口不提供凭据原文；业务权限由服务端决定 | 凭据不进插件存储或文档投影；匿名网络端口不附带凭据；服务端鉴权 |
| 浏览器/桌面能力 | 告知代码的实际运行权限 | 主题不执行代码；非 factory trusted-js 须用户授权，桌面 consent 说明系统能力 |
| 宿主 UI | 保持管理与恢复入口可用，避免主题样式干扰 | 声明式 UI 校验、主题 selector 白名单、protected region、宿主核心恢复入口 |
| 应用可用性 | 减少超大输入、资源残留与重复启动失败 | 载荷限额、网络超时与取消、scope 清理、崩溃计数、自动禁用、主题安全模式 |
| 插件数据和注册项 | 避免正常 API 使用中的串写、命名冲突和清理遗漏 | plugin id KV 命名空间、owner scope、注册 id 命名空间；不构成 JS 隔离 |
| 发布和更新完整性 | 确认 artifact 字节与记录一致，保留回退能力 | 摘要、factory 精确 lock、包与目录身份复核、更新失败回退 factory |

### 11.2 责任与约束

当前模型按以下职责划分：

- catalog、ZIP/JSON、manifest、主题数据与 SDK 请求参数须按协议解析和校验，防止非法结构、过大载荷或不支持的操作损坏应用状态。
- theme 保持纯数据合同，通过 token、CSS 和资源校验避免 UI 失控，并保留主题恢复入口。
- `trusted-js` 在 consent 之后进入与应用代码相同的信任域。系统只做执行前准入、来源展示和执行后的可用性恢复，不承诺约束其 DOM、网络、存储、凭据或 Tauri 访问。
- factory 随应用构建，复用应用的交付与发布流程；只有 factory 模块免 consent，远程 trusted-js（含第一方更新）均须用户授权。
- 业务服务端不信任客户端。资格、提交身份、审阅和其他敏感操作必须在服务端重新鉴权，不能把插件 capability 当作服务端授权。
- 内容摘要只确认字节一致，用于完整性、缓存、回退和可复现构建；同源与 `firstParty` 不证明代码安全，也不替代用户授权。

新增机制须说明如何防止插件故障或平台越界；不以增加高级攻击者成本为目标引入发布者签名、信誉或透明日志等治理要求。资格过滤、kill switch 与必要操作记录服务于运营和事故响应，发布溯源复用代码托管与 CI 记录。

### 11.3 信任域与跨域路径

```mermaid
flowchart LR
    subgraph U[不可信输入域]
        CAT[catalog JSON]
        ART[ZIP / JSON artifact]
        MOD[远程 JS 模块]
    end

    subgraph G[准入与校验域]
        CP[catalog parser]
        HASH[摘要 / identity 校验]
        UNPACK[受限容器解包]
        PARSE[package + manifest parser]
        DECIDE[全权 consent]
    end


    subgraph T[非执行数据域]
        THEME[validated tokens / CSS / assets]
    end

    subgraph F[应用全权域]
        JS[factory / trusted-js]
        HOST[host adapters + kernel]
        CORE[文档事务 / 恢复 UI / 平台端口]
    end

    CAT --> CP --> HASH
    ART --> HASH --> UNPACK --> PARSE
    MOD --> CP --> DECIDE
    PARSE -->|theme，无需 consent| THEME --> HOST
    PARSE -->|trusted-js| DECIDE --> JS --> HOST
    HOST --> CORE
```

图中 `trusted-js` 与宿主位于同一全权域是有意设计，不是图示简化。其 SDK facade 只提供稳定接口和统一生命周期，不形成权限隔离。

### 11.4 边界闸门矩阵

| 边界 | 输入 | 强制检查 | 失败方式 | 明确不保证 |
| --- | --- | --- | --- | --- |
| Catalog | 远程 JSON | schema、版本、重复 id、相对 entry、dot segment | 整份 catalog 拒绝或不可用时跳过 | 发布者身份、条目代码安全；`platforms` 只是运营过滤 |
| Artifact 下载 | 远程字节 | 第三方 provider 必须提供 SHA-256；其余 artifact 声明摘要时校验；factory lock 必须匹配精确摘要 | 安装终止，旧版本/factory 保留 | 字节一致不代表发布者身份或代码安全 |
| 容器 | ZIP/JSON | magic bytes、路径、重复项、白名单布局、条目和解压尺寸 | 整包拒绝，不产生部分安装 | manifest 语义和代码行为，交给后续 parser/runtime |
| Package parser | 未知对象 | JSON Schema、manifest、API 版本、kind/runtime、静态 contribution、主题安全规则 | 返回结构化 issue，拒绝安装/恢复 | 插件业务正确性 |
| trusted-js 准入 | factory、同源模块或本地 Blob | API 版本、来源路径、禁用/crash 状态、consent key | import 前拒绝；更新可回退 factory | 代码开始执行后的任何沙箱保证 |
| 文档提交 | op batch + revision | schema、稳定 ID、expected revision、单事务 | 全批拒绝，不部分写入 | 编辑内容符合用户意图；capability 不隔离 trusted-js |
| Contribution | 注册 id 和 owner | owner 命名空间、全局冲突、trusted-only view/mode、数量限制 | 注册抛错，scope 可整体释放 | trusted-js 自己直接操作 DOM |
| 持久化 | package、状态、KV | 命名空间、提交等待、事务与补偿、恢复时重新解析 | 错误向上传播；尝试恢复旧包/状态/KV/实例，补偿失败明确报告 | 跨 localStorage/IndexedDB 原子性；持续存储故障下保证恢复 |

### 11.5 Artifact 完整性与资源限额

容器解包的当前硬限制如下：

| 资源 | 上限 |
| --- | --- |
| 原始 ZIP/JSON artifact | 48 MiB |
| ZIP 解压后总大小 | 64 MiB |
| 单个 ZIP entry | 33 MiB |
| `manifest.json` | 4 MiB |
| ZIP 文件条目数 | 64 |
| trusted-js package 中的代码字符串 | 16 MiB |
| 单个主题 CSS 文件 | 131072 字符 |

ZIP entry 必须使用相对正斜杠路径，不能包含空段、`.`、`..`、绝对路径、反斜杠或重复名称；固定布局之外的文件会使整个包失败。这一层用于防路径穿越、意外附带文件和常见解压膨胀，不替代语义 parser。

不同交付路径的完整性行为如下：

1. factory artifact 由 `factory-plugins.lock.json` 锁定版本和 SHA-256，构建时验证。
2. 商店 ZIP/JSON artifact 在 catalog 提供 `sha256` 时校验，第三方 provider 强制要求摘要。trusted-js 与 theme 均核对容器类型、包内 id、version、对应 API version 与 catalog 条目，并校验包自身语义。
3. catalog 中的裸 trusted-js 模块直接从同源 URL 动态 import。当前 loader 不验证 catalog `sha256`，也不把它作为 `consentKey`；这条路径依赖 TLS、同源服务器和发布流程，内容变化不会像本地 Blob 包一样按摘要强制重新 consent。

SHA-256 用于内容识别与完整性；同源脚本、CDN 反向代理、immutable 缓存和 catalog `no-store` 服务于部署与更新一致性；`firstParty` 是来源标识。同源不等于可信，第一方标识不免除远程代码的 consent。factory/shadow/pin 服务于出厂回退，`minAppVersion` 与平台过滤服务于版本兼容和运营策略，均不替代服务端鉴权。

### 11.7 trusted-js 准入边界

trusted-js 的边界全部发生在代码执行之前：

- factory module 与主应用同一构建和信任根，跳过用户 consent；
- 远程裸模块必须解析到应用 origin 内；
- 本地/商店 package 经 parser 后保存为 Blob，包内容 SHA-256 作为 consent key，内容变化重新询问；
- 桌面宿主已取消远程 JS 总开关，非 factory 模块继续逐插件 consent，桌面提示包含系统能力说明；
- 用户禁用、连续崩溃和上次启动残留 pending marker 都在 import 前检查；
- consent 明示插件可读取和修改应用数据、访问登录态并以用户身份操作；桌面端还提示系统能力。不向插件提供凭据原文是宿主接口约束，不能据此承诺任意 JS 无法读取同一环境中的凭据。

一旦 `import()` 开始，trusted-js 就能以应用前端的权限运行。它可以绕过 `TrustedJsHostV0` 直接使用可见的 DOM、Web API、存储、网络以及桌面 WebView 暴露的能力。以下机制对 trusted-js 只是兼容性或可用性机制，不是安全隔离：

- `TrustedJsHostV0` 与 capability 名称；
- host network offline switch；
- `data-amll-protected`；
- owner namespace 和 scope；
- AbortSignal、cleanup 和 crash counter。

当前 `index.html` 的 CSP 允许广泛来源、`blob:`、`unsafe-inline` 和 `unsafe-eval`，用于兼容现有应用与插件加载。CSP 不承担 trusted-js 隔离职责。

### 11.8 主题与安全 UI 边界

主题是“不执行代码”的数据档。`parseThemePackage` 是唯一语义入口，并执行以下限制：

- token 只接受已知名称和受限字面值，拒绝 `url()`、`var()`、`expression()`、`@import`、协议和结构字符；
- CSS 最长 131072 字符，嵌套深度最多 4；只允许 `@media`、`@supports` 和受限 `@font-face`；
- selector 必须从公开的 `[data-slot]` 或 `[data-part]` 开始；
- 拒绝 `!important`、escape、危险函数、远程/data/blob/file/javascript URL；
- `url()` 只能引用包内声明的 `asset:<name>`，应用时替换成宿主生成的本地 URL；
- 明确拒绝任何包含 `data-amll-protected` 的主题 CSS。

主题 CSS 位于 `amll.theme` cascade layer，用户覆盖位于更高的 `amll.user` layer，宿主未分层 CSS 仍高于两者。权限、consent、设置和插件管理对话框 portal 到 body 并标记 `data-amll-protected`，避免主题通过正常选择器或层叠覆盖决策界面。完整 mode 和 React view 只允许 trusted owner 注册。

主题应用前写入 pending marker；应用未稳定便崩溃时，下次启动进入安全模式。用户还能通过 `Ctrl+Alt+Shift+F12` 捕获阶段快捷键恢复默认主题，或用 `?theme-safe-mode=1` 强制本次安全启动。

这些保护只约束主题包。已经获准运行的 trusted-js 可直接修改 DOM/CSS，因此可以影响 protected UI；这正是它必须按全权代码处理的原因。

### 11.9 网络与凭据边界

`network.http` host port 的策略是“匿名、有限、可取消”：

- 只允许绝对 HTTPS URL，以及 `localhost`、`127.0.0.1`、`[::1]` 的 HTTP；拒绝 URL 凭据和其他 scheme；
- 禁止插件设置 `authorization`、cookie、proxy authorization、host、origin、referer 和 hop-by-hop header；
- `fetch` 固定使用 `credentials: "omit"`、`redirect: "error"`、`referrerPolicy: "no-referrer"`；
- 请求体最多 1 MiB，响应体最多 8 MiB；默认超时 30 秒，最大 120 秒；卸载会取消请求；
- 离线开关拒绝经该 port 发起的新请求；浏览器/Tauri WebView 的 CORS 规则仍适用。

该端口为调用方提供匿名请求、大小限额、超时与取消能力，避免宿主主动附带用户凭据。trusted-js 可以绕过该 port 直接联网，离线开关只控制该端口的请求，不承担网络隔离或防数据外传职责。

宿主持有的 PAT、登录态和服务端 token 不应出现在 `PluginDocumentV0`、插件 KV 或日志中，公开 API 不提供凭据原文。用户通过 consent 决定是否运行插件；业务 API 在服务端鉴权。trusted-js 可借宿主能力操作用户数据及以当前登录身份调用 API，前端对象隐藏不构成凭据隔离。

### 11.10 文档、表单与 contribution 完整性边界

事务层保护文档一致性，而不是判断编辑内容是否“正确”：

- 文档 API 提供公开投影，adapter 保留未暴露的内部字段；
- 所有定位使用稳定 ID；未知目标使事务失败；
- revision 冲突整批拒绝；一个 turn/applyEdit 对应一个撤销记录；
- 来源 plugin id 随事务传播，事件回送时避免自触发循环。

声明式表单在协议入口和 UI service 再次校验，字段、选项、文本和层级都有上限；提交值按 schema 清洗，丢弃未知键、限制文本和数字范围，并校验 select/radio 成员。通知是纯文本，图标只允许宿主预编译的 Fluent icon 白名单。这些声明式接口不接受 HTML、SVG、URL、React component 或内联回调；trusted-js 的 React view 使用独立的视图接口。`enablement/when` 解析失败、包含未知键或类型不匹配时必须关闭显示或禁用动作（fail closed），不得执行任意表达式。

Contribution registry 强制 plugin id 命名空间和 owner 归属；mode、trusted view、host-native format 只允许 trusted owner。标题栏 action 是数量受限的命令引用和白名单图标，不能占据窗口控件或恢复入口。scope disposal 只清理经宿主 API 注册的资源；trusted-js 自行创建的全局 listener、timer 或 DOM 仍需插件 cleanup，宿主无法可靠枚举。

### 11.11 可用性与恢复边界

| 故障 | 当前恢复行为 |
| --- | --- |
| catalog 不可达/非法 | 不加载远程候选；factory 功能继续可用 |
| artifact 摘要或语义校验失败 | 安装终止，不执行候选代码 |
| factory 更新加载失败 | 尝试重新加载 factory 副本 |
| trusted-js import/activate 失败 | abort、释放 host/scope/Object URL、记录 crash；更新可回退 factory |
| trusted-js 导致整次启动异常 | pending marker 在下次启动累计 crash，达到阈值后拒绝加载 |
| 主题应用导致启动异常 | 下次启动进入主题安全模式并清除主题效果 |
| active mode 的 owner 消失 | 回退到内置 `edit` mode |
| 插件禁用/卸载 | 取消在途工作并释放 owner scope；卸载另清 package 与 KV |

安全恢复入口必须属于宿主核心：默认编辑模式、host-native TTML、插件管理、权限/consent、主题安全模式和恢复快捷键均不能依赖可卸载插件才能访问。

### 11.12 当前实现限制

以下限制影响授权记录、持久化或恢复行为，不代表需要为 trusted-js 补建沙箱：

1. 远程裸 trusted-js 模块没有实际字节摘要校验，内容变化也没有摘要驱动的重新 consent；本地/商店 Blob 包使用内容摘要授权。
2. 安装和 KV 持久化错误向上传播；localStorage/IndexedDB 之间靠补偿恢复，持续故障导致补偿失败时明确报错，不保证跨介质原子性。
3. localStorage 不可用时，trusted-js crash/pin 状态会降级，factory pin 可能只在当前会话有效。
4. scope、AbortSignal 与 cleanup 只管理宿主登记或插件主动释放的资源，不能抢占中断主线程死循环；crash marker 用于后续启动恢复。
5. 浏览器、WebView 与 Tauri 配置决定实际可用的平台能力；桌面跨平台验证尚未全部完成。

## 12. 当前不变量

后续重构如果没有明确架构决策变更，应保持这些行为：

本架构的取舍是：实时编辑、渲染、音频和恢复入口留在宿主，以保证离线可用和故障恢复；需要 React 或浏览器能力的功能以 trusted-js 提供，但按应用级代码提示风险，不把 SDK facade 误称为沙箱；主题保持无代码声明包，并与功能包分离。资源通过 `ExtensionScope` 统一归属，禁用保留包与 KV，卸载才删除数据。安装路径复用容器、语义校验、授权和持久化闸门，SHA-256 用于完整性、缓存和 consent 绑定，不代表发布者身份认证。factory 副本提供离线基线，更新失败可回退，商店不可用不应移除基础功能。平台差异由 adapter 隔离，发布前仍需 WebView、Tauri 和跨平台实测。

1. `plugin-api` 保持宿主无关且可独立构建。
2. 外部插件开发合同只允许依赖公开 API/SDK，不导入 `$/` 或宿主内部类型；这是兼容性约束。
3. 每条 artifact 路径最终进入唯一的对应语义 parser。
4. 公开插件 API 的文档写入只经事务服务；稳定 ID、revision、原子提交和撤销语义不变。
5. capability 精确匹配，未知 capability 拒绝，不做前缀通配。
6. 宿主注册接口只接受插件自己命名空间下的命令和贡献。
7. scope disposal 能撤销插件的全部宿主注册。
9. trusted-js 明确按全权代码处理，不把 SDK facade 描述成沙箱。
10. 主题不执行代码，受保护 UI 不受主题样式影响。
11. factory copy 离线可用；更新失败可回退，商店不可用不会移除基础功能。
12. host-native TTML 和 fallback edit mode 始终由不可卸载的宿主核心提供。


## 13. 仍然有效的历史约束

以下条目来自已完成阶段的记录，仍约束后续工作。

### 13.1 分层检查规则

`pnpm lint:boundaries`（CI 执行）依次运行 dependency-cruiser、Biome 与短 AST 检查。`.dependency-cruiser.cjs` 使用 tsconfig paths 校验解析后的依赖；`biome.json` 按路径限制宿主全局与导入；`scripts/check-command-menus.mjs` 仅保留菜单、单写入口、TSX 与 Object URL 生命周期约束，不再自行解析 import。新增模块须遵守：

- 相对导入按解析后的真实目标校验，不能以 `../../modules/...` 绕过 application/kernel 边界。
- application/kernel/state/API/SDK 层禁止全局 `document`、`window`、`localStorage`、`fetch`、`indexedDB` 与 DOM 类型；局部同名参数合法。`globalThis` 也禁止，避免通过它绕过限制；`URL` 构造仍合法，但 Object URL 生命周期只能经 platform adapter。
- 遍历 `tests/plugin-api/` 与 `tests/plugin-sdk-js/`；`src/platform` 与 `src/plugins`（runtime、adapters、ui、trusted、store 与根目录）有正向依赖白名单。
- UI 不得以别名或相对路径直接导入纯算法模块（drag-reorder、segmentation、syllable-smoothing、LRC parser、时间线边界等），只能经 application service 与 adapter；`?worker` 资源只能由 platform/runtime adapter 引入。
- 普通菜单项不得重新内联 `onSelect`/`onClick`/`onCheckedChange` 或使用可能隐藏回调的 prop spread（菜单只引用 command ID）。编辑文档的写入仅限 editor document adapter。
- state 层不得重新访问 idb、fetch、localStorage 或 Object URL API（走 platform adapter）。
- `src/plugins/builtin/<plugin>/**`（formats/modes/themes 三个宿主核心目录除外）与 `examples/` 只允许导入 `@amll-ttml-tool/plugin-api`、`@amll-ttml-tool/plugin-sdk-js` 与 React；SDK 包只允许 plugin-api 与 type-only React。

### 13.2 格式插件的粒度

插件化的单位是“provider 注册”，不是“实现打包”。TTML 由自有 ttml-processor 承担，ESLRC/QRC/YRC/LYS/ASS 来自上游 `@applemusic-like-lyrics/lyric` 包，LRC 为 TS。这些实现属于主线程内部库，由单一 builtin scope `core.formats` 注册多个 provider。TTML 注册为不可卸载 hostNative provider；其余 provider 可禁用，禁用后对应导入/导出命令随 scope 消失。第三方格式插件经 trusted-js `formats.register` 接入同一 registry 与同一文件流程。

### 13.3 两档用户提示语与两条红线

用户提示语按两档说明实际能力，由用户决定是否安装和授权，不承诺插件行为安全：

1. 主题：不执行代码，token、CSS 与资源引用由宿主校验。
2. JS 插件：与应用同权，可访问应用数据和登录态；桌面端还可能访问系统能力，应像安装软件一样审查来源。

不随规模松动的红线：凭据（PAT/登录态）由宿主持有，不进插件存储、不进文档投影，宿主 API 不提供凭据原文；业务 API 鉴权在服务端，不信任客户端。trusted-js 与应用同处 JS 环境，接口约定不构成对任意 JS 的凭据隔离保证。只有随应用构建的 factory 模块免 consent，所有远程 trusted-js（含第一方更新）均须用户授权。

### 13.4 一级页面、标题栏与表单的信任结论

- 完整 React mainView 只由已准入的 builtin/trusted scope 注册，manifest 不能声明 mode。`FALLBACK_MODE_ID = "edit"`，edit 模式禁止携带 `when`，模式切换器位于 `data-amll-protected` 内。
- 标题栏承载模式切换器与窗口控制，属恢复入口。manifest 的标题栏声明最多 3 条动作（自身 command ID + 宿主图标白名单 + 纯文本 tooltip）；该接口不开放窗口拖拽区、窗口控制和模式切换器。这是 UI 合同，不限制 trusted-js 直接操作 DOM 的实际能力。
- 表单不向协议开放 CSS 文本；若未来需要主题动画，应在主题合同内以受限 `@keyframes` 另行扩展。

### 13.5 主题 slot / part 合同

slot：app-root、background-layer、title-bar、ribbon-bar、sidebar、lyric-editor、preview、audio-controls、spectrogram、plugin-form；part：lyric-line、lyric-word、form-field、form-group、form-note、form-footer。主题 CSS 的每个选择器必须以 `[data-slot="…"]` 或 `[data-part="…"]` 锚定，名称在 `THEME_SLOT_NAMES_V0` / `THEME_PART_NAMES_V0` 白名单内。`index.css` 声明 `@layer amll.base, amll.theme, amll.user`，未分层的应用 CSS 永远压过三层。新增 slot/part/token 名需扩展 `THEME_*_NAMES_V0` 并 bump `THEME_TOKEN_VERSION`。

### 13.6 trusted-js SDK 合同要点

- 分包 `packages/plugin-sdk-js`（`@amll-ttml-tool/plugin-sdk-js`，`./testing` 子路径导出 `MockTrustedJsHost` 与 `createTrustedJsHostUnderTest`）。不走 pnpm workspace，靠 tsconfig paths 与 Vite/Vitest alias 解析；React 只允许 `import type`。`pnpm plugin:sdk:check` 证明可脱离宿主编译。
- `TrustedJsHostV0`：`document.readSnapshot()` 返回含 ruby 的 `PluginDocumentV0`；`revision` 为 getter；`applyEdit(ops, label, { expectedRevision? })` 省略 expectedRevision 即不校验冲突；`onChanged` 事件含 `sourcePluginId`；`selection.get()` 只读并有 `selection.onChanged`；`commands`/`menus`/`titleBarActions`/`formats`/`views` 均是 ExtensionScope 薄封装；formats provider 以投影转换（importer 返回 `NewLineV0[]` + metadata，宿主分配 id）；`storage.kv` 直读写 `amll-extensions/plugin-kv` 命名空间；`views.registerMode` 经 `registerHostMode`。
- 宿主共享服务 `src/plugins/adapters/host-services.ts` 接入 trusted-js 宿主，保证事务、revision 冲突、来源标记与 KV 命名空间。`createTrustedJsHost` 为端口注入的纯工厂，可在 Node 中与 `EditorDocumentService` 组成真实宿主。
- 加载合同：`createHost({ pluginId, scope, signal })` 返回 handle；`activate({ pluginId, host, signal })` 返回 cleanup；unload 顺序固定为 abort → cleanup → host handle dispose → scope dispose；activation 抛错同样 abort 并全清理。
- 合同测试入口 `runHostContractTests` 由 MockTrustedJsHost 与真实 trusted-js 宿主共用。
- 热重载：工具链成功构建后发布 `dist/module/manifest.json` 与入口模块，编译失败保留上次输出；宿主监听归应用会话所有；开发 consent 按同 id 的当前会话复用，与正式包的内容授权、崩溃计数分开；激活失败清理新实例并重新激活旧模块，KV 和文档不清空。
- 开发调试：`dev` 构建携带内联 source map、sourcesContent 和 `amll-plugin:///插件id/src/...` 源文件标识，宿主为开发 Blob 添加同命名空间的 module.js sourceURL；`build`/`pack` 不输出源码映射。
- 开发模式与正式 trusted-js 同权，不在沙箱中运行，可访问和修改应用数据及使用当前登录态；目录加载入口及 consent 均明确提示。本会话授权覆盖同 id 的源码修改，“不持久化开发包”不代表撤销数据副作用；继续保留 API/manifest 校验、来源展示、scope 清理与失败恢复。

## 14. 代码索引

| 主题 | 文件 |
| --- | --- |
| 公共类型 | `packages/plugin-api/src/types.ts` |
| Schema 与 parser | `packages/plugin-api/src/schema/schemas.ts`、`packages/plugin-api/src/parsers.ts` |
| Capability | `packages/plugin-api/src/capabilities.ts` |
| 匿名网络策略 | `packages/plugin-api/src/network.ts`、`src/plugins/adapters/plugin-network.ts` |
| trusted-js SDK | `packages/plugin-sdk-js/src/host.ts` |
| Contribution/owner scope | `src/kernel/extensions/ContributionRegistry.ts` |
| 文档事务 | `src/kernel/editor/EditorDocumentService.ts` |
| 插件文档 adapter | `src/plugins/adapters/plugin-document.ts` |
| trusted-js load gate | `src/plugins/trusted/trusted-js-service.ts` |
| trusted-js 本地安装 | `src/plugins/trusted/installed-trusted-js.ts` |
| factory/更新选择 | `src/plugins/trusted/factory-plugins.ts`、`trusted-js-load-plan.ts` |
| 主题核心 | `src/kernel/theme/ThemeService.ts` |
| 主题 CSS 安全校验 | `packages/plugin-api/src/theme-css.ts`、`theme-package.ts` |
| 容器与商店安装 | `src/plugins/store/package-container.ts`、`store-install.ts` |
| 权限与 consent UI | `src/plugins/ui/PluginPermissionDialog.tsx`、`TrustedJsConsentDialog.tsx` |
| 页面 CSP | `index.html` |
| 平台持久化 | `src/platform/storage/IndexedDb*.ts` |
| 工厂锁 | `factory-plugins.lock.json` |
| 当前路线图 | `goal.md` |
| 架构决策 | 本文第 3、5、6、7、11、12 节 |

### 扩展持久化

插件、主题与用户背景共用 `amll-extensions`，仅 `src/platform/storage/plugin-database.ts` 打开连接，负责升级、阻塞关闭、终止与打开失败后的重试。四个 object store 为 `trusted-js`、`plugin-kv`（复合键 `[pluginId, key]`）、`theme-packages` 与 `theme-assets`。历史快照继续使用 `amll-autosave-db`；localStorage 中的授权、启用、factory pin、主题选择与 override 键保持不变。分支未上线，不迁移旧 IndexedDB 库。

主题包资源以 Blob 存入 `theme-assets`，通过 `themeId` 索引关联包；用户 surface 图片以 surface 名为键，不归属于任何主题。全局背景为 `appRoot` surface，设置入口统一到主题设置。卸载 trusted-js 时一个事务删除包与其 KV 范围；卸载主题时一个事务删除包及其资源，保留用户 surface 图片。失败安装的回滚仅删除包，不清空已有 KV。

用户选图立即应用固定默认遮罩（浅色白色 35%、深色黑色 45%）；每个 surface 可手调遮罩，全局 `appRoot` 图片另可调整透明度。用户值与 Blob 持久化于 `theme-assets`，刷新恢复；恢复默认清除图片，不进行图片可读性分析。

### 统一安装目录与管理入口

`src/plugins/store/store-install.ts` 的 `PluginInstallation` 是宿主内部管理投影，分别保留 `kind`、`runtime`、版本、来源、可用 artifact 身份与启用状态。`PluginInstallationService` 聚合 factory、安装记录、运行中功能插件及主题目录，`store-host.ts` 负责单一订阅与启停、卸载、回退出厂、重新授权的接线；两套 runtime 继续各自负责生命周期。factory 当前版本与被遮蔽的安装包身份分开表示，缺少来源元数据的旧主题记录显示“来源未记录”，不推断为本地或商店来源。

管理器位于“首选项 > 插件管理”，与设置共用一个受保护、portal 到 body 的 Dialog.Content，返回按钮恢复原设置页。工具菜单不再提供插件商店入口。“可用插件”左侧用“全部 / 插件 / 主题”过滤种类，右侧用“在线 / 本地”切换 catalog 与安装目录；本地导入入口只选择 ZIP。已安装列表混排功能插件与主题，按种类提供适用操作。主题设置保留预览、应用、恢复默认与 override 编辑，安装、更新和卸载归管理器。

桌面宿主取消远程 JS 总开关，继续使用插件级 consent、来源校验及崩溃恢复；consent 保留桌面环境的能力说明。网络离线开关和开发目录加载保留在插件管理器设置页。完整边界负例和合法对照在临时项目快照运行，桌面构建 quality job 同时执行主边界检查与 `pnpm lint:boundaries:test`。


### 商店提供者 v0（技术原型）

公开合同 `StoreProviderV0 { id, name, catalogUrl, official }` 使用现有 `RemotePluginCatalogV0` JSON 聚合目录，作为逐 manifest JSONL 的等价传输方案。目录的 `entry` **相对 catalog URL 所在目录**，例如 `/plugins/catalog.json` 配 `store/<sha256>.zip`；可连接静态托管，也可连接服务端 `GET /plugins/catalog.json`。官方构建产物已同步此解析基准。客户端不需要管理员账号，目录与 artifact 为公开 GET。

插件管理 → 插件设置 → 商店提供者可添加/移除提供者；在“可用插件 → 在线”主动刷新目录。用户添加的来源一律 `official: false`，即使目录声明 `firstParty` 也忽略；唯一官方来源由宿主定义且保持同源。原型允许 HTTPS，以及 HTTP `localhost`、`127.0.0.1`、`[::1]`，不代表正式上线策略。跨源服务需配置 CORS；HTTPS 页面访问本机端口仍遵守浏览器网络权限。

提供者与验证后的目录按来源缓存至 localStorage；启动及普通读目录不请求网络，点击刷新（或添加来源）才以 `no-store` 请求所有来源，并在缓存更新后与本地安装版本比较。并发刷新合并，单来源超时/坏目录不会清除上次有效缓存，也不影响其他来源；界面显示不可用与缓存时间。缓存写入失败会明确显示，当前会话仍可查看响应。目录流式限额 4 MiB，artifact 48 MiB，下载另受容器解压限额约束。

同 id 同 SHA-256 标记镜像；不同摘要冲突时官方优先，其余按添加顺序选择首项并阻止冲突项安装。第三方不能覆盖 factory id；第三方条目必须提供 SHA-256 与 ZIP/JSON 包，不能通过裸 JS URL 自动执行。所有第三方安装经下载、摘要校验、容器解析、包身份与目录身份核对、原有 semantic gate / consent、IndexedDB 持久化，再从本地 Blob 加载。主题安装等待写入成功才发布新状态。JS consent 展示提供者名，仍按第三方权限措辞；原有桌面 consent 闸门不变。

安装记录保留 provider id/name、artifact SHA-256、安装时间。移除来源不卸载插件，已安装页显示“来源已移除，不再更新”，原有本地运行和卸载保持可用。官方同源裸 JS 模块保留既有 loader 策略；第三方目录只参与商店展示和显式安装，不参与启动时的远程 load plan。
