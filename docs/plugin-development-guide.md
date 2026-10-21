# AMLL TTML Tool 插件开发指南

状态：experimental v0

适用版本：当前仓库

本文面向插件作者，说明当前可用的插件档位、开发入口、包格式和发布检查。完整类型以 `packages/plugin-api/src` 与 `packages/plugin-sdk-js/src` 为准；自动生成的字段索引运行 `pnpm plugin:api:build` 后见 `docs/plugin-protocol-v0.md`，架构、信任边界和设计取舍见仓库根目录 `PLUGIN.md`。v0 允许破坏性变更；仓库不再维护单独的 ADR 文件。

## 1. 选择插件档位

| 目标 | `kind` | `runtime` | 运行边界 |
| --- | --- | --- | --- |
| 歌词处理、命令、表单、格式转换及 React 视图 | `function` | `trusted-js` | 经准入后与应用同权，不提供安全隔离 |
| 颜色、排版、表面背景和受限 CSS | `theme` | `none` | 纯声明式数据，不执行代码 |

`builtin` 只供宿主内置功能使用，不是第三方分发入口。主题和功能不能放在同一个包中。

trusted-js 可以绕过 SDK 直接使用浏览器能力，因此应像安装桌面软件一样审查其来源；`TrustedJsHostV0` 是兼容性与资源生命周期边界，不是沙箱。

### 依赖声明（协议与加载闸门已接入）

功能包与主题包均可声明 `dependencies: [{ id, version, optional? }]`；`version` 为非空 semver range，`optional` 默认 `false`。每包最多 16 条，不允许自依赖或重复 id。字段规范、可选依赖与版本匹配语义见 [插件依赖 v0](../PLUGIN.md#插件依赖-v0)。

宿主在 trusted-js 唯一加载闸门中检查必需依赖的安装、启用和版本范围，并按依赖拓扑顺序启动 factory 插件；缺失或不匹配时不会执行依赖者代码。商店依赖闭包安装、批次回滚、手动导入后的 disabled 状态与主题作用域已接入宿主。依赖不提供跨插件调用能力。

## 2. 推荐工具链

独立插件优先使用同级仓库 `amll-ttml-tool-plugin-toolkit` 创建、构建、测试和打包。宿主仓库也提供：

```sh
pnpm plugin:packages:build   # 构建 plugin-api 与 plugin-sdk-js
pnpm plugin:api:check        # 类型检查并确认协议文档没有漂移
pnpm plugin:catalog:build    # 生成同源 catalog 与内容寻址 artifact
```

本仓库的 `plugin-api` 和 `plugin-sdk-js` 包版本均为 `0.1.0`，且当前标记为 private。独立仓库应使用 toolkit/vendor 提供的固定 tarball，而不是引用宿主源码、`$/` alias 或宿主构建产物。

常用导入：

```ts
import {
  PLUGIN_API_VERSION,
  parseManifest,
  type FunctionPluginManifest,
} from "@amll-ttml-tool/plugin-api";

import {
  definePlugin,
  type TrustedJsHostV0,
} from "@amll-ttml-tool/plugin-sdk-js";
```

`@amll-ttml-tool/plugin-api/schema` 导出 Schema 与校验器；两个包的 `testing` 子路径提供 mock 和合同测试工具。

## 3. Manifest 与 capability

功能插件的最小 manifest：

```json
{
  "kind": "function",
  "id": "dev.example.word-tools",
  "name": "Word Tools",
  "version": "0.1.0",
  "apiVersion": 0,
  "runtime": "trusted-js",
  "entry": "index.js",
  "capabilities": ["lyrics.core", "ui.notify"],
  "activationEvents": ["onStartup"]
}
```

当前核心 capability：

| Capability | 用途 |
| --- | --- |
| `lyrics.core` | 读取公开文档和选择、提交文档操作 |
| `lyrics.ruby` | 读取和修改 ruby 分段 |
| `lyrics.format` | 注册歌词格式转换 |
| `ui.notify` | 纯文本通知 |
| `ui.form` | 声明式表单 |
| `storage.kv` | 插件隔离 JSON KV |
| `network.http` | 宿主代理的匿名 HTTP |

能力精确匹配，不支持 `lyrics.*`。定制能力必须使用 `extensions.<反向域名>.<名称>`。capability 仅作展示与文档声明，不限制 trusted-js 的实际权限。

Manifest 规则包括：

- `id` 使用反向域名形式，`version` 使用 semver。
- command、settings、title bar action、format、view 和 mode 等 ID 必须位于插件命名空间。
- `homepage` 只能使用 HTTPS。
- `entry` 是包内相对路径；trusted-js 必须是 `.js` 或 `.mjs`。
- `contributes` 可声明 commands、menus、settings、titleBarActions 和 formats。
- `activationEvents` 支持 `onStartup`、`onCommand:<id>` 和 `onDocumentChanged`。

## 4. 文档与事务

插件只看到 `PluginDocumentV0` 投影，不会得到内部 `TTMLLyric`、atom 或 React 状态。行和词使用稳定 ID；索引不能作为写入定位信息。公开字段包括时间、文本、翻译、音译、背景/对唱标记、同步忽略标记和可选 ruby。

`DocumentOpV0` 支持：

- `updateLine`、`updateWord`
- `insertLine`、`removeLine`、`moveLine`
- `insertWord`、`removeWord`
- `setMetadata`、`replaceDocument`

一批操作由宿主原子提交，生成一个 revision 和一个撤销记录。跨 `await` 计算的修改应携带读取时的 `expectedRevision`；冲突时重新读取并决定是否重试，不能静默覆盖。宿主按稳定 ID 合并，投影中没有的内部字段保持不变。

## 5. trusted-js 插件

入口是单文件 ESM，默认导出或模块命名空间必须提供 `activate`：

```ts
import { definePlugin } from "@amll-ttml-tool/plugin-sdk-js";

export default definePlugin({
  activate({ pluginId, host, signal }) {
    const command = host.commands.register({
      id: `${pluginId}.notify`,
      title: "Notify",
      handler: () => host.ui.notify({ level: "info", message: "Ready" }),
    });

    signal.addEventListener("abort", () => command.dispose(), { once: true });
  },
});
```

宿主会统一释放通过 SDK 注册的资源；返回 cleanup 只用于 SDK 之外的资源。卸载顺序是 abort、插件 cleanup、host handle、extension scope、Object URL。

`TrustedJsHostV0` 当前提供：

- `document`、`selection`、`project`
- `i18n.t/locale/onLocaleChanged`（包内字符串表，见“字符串表”）
- `commands`、`menus`、`titleBarActions`
- `ui.showForm/notify/openView/closeView`
- `storage.kv`
- `network.request/isOffline`
- `formats.register`
- `views.registerMode/registerView`

网络端口仅允许 HTTPS 或本机 HTTP，不附加凭据、不跟随重定向，请求体上限 1 MiB、响应体上限 8 MiB。用户的离线开关只约束这个端口，不能阻止全权 JS 自行发起网络访问。

React 与 React DOM 由宿主固定为 19.2.7。构建时必须 externalize：

```ts
const external = (id: string) => [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react/compiler-runtime",
  "react-dom",
  "react-dom/client",
].includes(id);
```

产物保留 bare import，由宿主 import map 解析。不要打包第二份 React，不要引用 CDN、宿主 chunk 或私有 alias。toolkit 会拒绝非白名单依赖、运行时 `require`、不可静态确定的动态 import 和额外资源。

非 factory 包在 import 前经过 API 版本、manifest、来源、用户禁用、崩溃状态与 consent 检查。内容 SHA-256 用于识别变更并触发重新授权，不是签名或安全认证。factory 副本随应用交付；严格更高版本可以遮蔽它，卸载更新后可 pin 回 factory。

开发模式与正式 trusted-js 权限相同：代码与宿主在同一 JS 环境运行，可访问和修改应用数据及使用当前登录态。开发包只在当前会话加载，不代表数据修改会自动撤销；首次授权后，同一插件的源码修改可在本会话内自动执行。开发模式继续经过 API/manifest 校验、来源展示和 consent，并沿用 scope 清理与失败恢复；会话授权、热重载失败及崩溃计数与正式安装分开，不能将其理解为更低权限或沙箱。

## 6. 主题插件

主题 manifest 示例：

```json
{
  "kind": "theme",
  "id": "dev.example.contrast",
  "name": "Example Contrast",
  "version": "0.1.0",
  "themeApiVersion": 0,
  "runtime": "none",
  "appearance": "both",
  "tokens": "theme/tokens.json",
  "styles": ["theme/styles.css"]
}
```

`ThemePackageV0` 包含 manifest、tokens、可选 styles 和内联 assets。宿主校验 token 版本、颜色、长度、选择器范围和资源引用；禁止远程 URL、任意代码和危险 CSS。资源通过 `asset:<name>` 引用并转换为本地 Object URL。权限、插件管理和错误恢复 UI 位于受保护区域，不受主题 CSS 控制。

### 插件作用域主题

`scope` 省略或为 `"global"` 表示全局；`{ "pluginId": "dev.example.editor" }` 表示只作用于该插件，并必须声明该目标的非 optional `dependencies`。激活时目标必须存在、版本兼容且启用。目标禁用后宿主移除视图锚点，主题仍保持选中；目标卸载或版本不兼容时，管理器显示 `disabledByDependency`，不注入其 CSS。

目标功能插件通过 `contributes.themeParts: ["dev.example.editor.panel"]` 发布自己的 `data-part` 名称（最多 32 个，必须以自身 id 加 `.` 为前缀）。主题 CSS 示例：

```css
[data-amll-plugin-scope="dev.example.editor"] [data-part="dev.example.editor.panel"] {
  color: var(--attt-color-text-primary);
}
```

每个选择器都必须以精确作用域锚点开头，再选择后代 slot/part；part 白名单为宿主公开 part 加目标声明的 part。离线包解析只能检查命名空间，宿主在安装、激活和渲染时核对目标声明，避免目标更新后使用过期声明。禁止跨作用域的兄弟选择器、选择器列表伪类及全局 `@font-face`。宿主通过 CSS `@scope` 下边界排除嵌套插件根和受保护区域；不支持 `@scope` 的旧 WebView 不会应用作用域样式，不能视作已完成平台验收。

锚点由宿主包裹 mode mainView、trusted settings/dialog view 和 titlebar group，声明式表单及安全 UI 不打插件锚点。插件 portal 不会自动继承锚点。作用域 token 定义在锚点元素上，禁止设置任何模式的 accent 或 surfaces；用户 override 在 `amll.user` 层覆盖所有作用域元素及其后代。

可以同时启用一个全局主题和每个目标各一个主题。相同作用域最后应用者胜出，受保护对话框点名新旧主题和作用域，可确认或撤销本次应用。持久化保存应用时间，兼容原来的单一全局 id；启动冲突也会提醒。预览只临时替换对应作用域。安全模式、救援快捷键与恢复默认清空所有主题选择；退出安全模式不会自动重新启用主题。

## 7. 打包、安装与更新

ZIP 可复现打包由独立 toolkit 保证：输入文件名、字节及锁定依赖一致时，条目按 UTF-16 码元排序，固定压缩级别、DOS 时间和平台属性，得到相同 SHA-256；文件 mtime、项目路径、语言与时区不参与产物。源码换行及 JSON 键顺序不自动归一化，发布需统一 checkout 换行并使用 frozen lockfile。验收运行 toolkit 的 `pnpm test`（含跨语言/时区进程与 trusted-js/theme 固定摘要），其 CI 在 Windows/Linux/macOS 核对同一摘要基线；配置矩阵不等于已通过远端实测。

当前验收进度（2026-10-18）：toolkit 在 Windows / Node 24.12.0 / pnpm 10.28.2 下 `pnpm test` 9/9 通过，包含四组语言/时区固定摘要回归；Windows/Linux/macOS CI 已配置但尚未远端执行。后续需记录三个平台通过同一摘要基线的 run URL，桌面 WebView 运行验收独立进行。

宿主按 magic bytes 识别 JSON 或 ZIP，不依赖文件扩展名：

- JSON 是完整的 `TrustedJsPluginPackageV0` 或 `ThemePackageV0`。
- ZIP 根目录必须有 `manifest.json` 描述符，载荷位于 `assets/<entry>`；主题样式和资源同样必须被声明。
- 容器最多 48 MiB，解包总量最多 64 MiB，最多 64 个文件；拒绝绝对路径、反斜杠、dot segment、重复项和未声明文件。

用户入口：

- 首选项 → 常规 → 管理插件：统一管理功能插件与主题包，支持启停、卸载、更新、回退出厂与重新授权；“可用插件”通过“全部 / 插件 / 主题”和“在线 / 本地”分段选择器筛选，导入入口只选择 ZIP 包。
- 插件管理 → 设置：插件网络设置、从目录加载 trusted-js 开发插件。主题设置页保留预览、应用、恢复默认与 override 编辑，不再安装或卸载主题包。
- 开发目录：`manifest.json` 加入口 JS，仅当前会话有效；浏览器需支持 File System Access API。

### trusted-js 插件级热重载

安装与卸载只有在必要写入提交后才报告成功；失败会尝试恢复旧包、授权/启停状态和旧实例，正式包激活失败及商店批次回滚还恢复安装前 KV 快照。`host.storage.kv` 的读取、写入和删除失败会 reject，插件应等待 Promise 并处理错误。localStorage 不可用时不会把授权或启停写入伪装为成功，启动恢复错误会显示提示。持续存储故障也可能使补偿失败，此时明确报告“回滚失败”；不保证跨 localStorage/IndexedDB 的原子提交，文档与网络副作用也不属于安装回滚范围。

`amll-plugin dev` 的入口模块内嵌 source map 与源码，打开浏览器开发者工具的 Sources，在 `amll-plugin:///插件id/src/` 下查看原始模块、设置断点；异常可映射回源文件和行号。开发 Blob 的模块名为同目录下的 `module.js`。编译错误保留具体源模块诊断和上次成功输出；正式 `build`/`pack` 不携带 source map，发布前重新运行 `pack`。

1. 在插件项目运行 `amll-plugin dev`（使用本工作区工具链时可运行 `node ../amll-ttml-tool-plugin-toolkit/bin/cli.mjs dev`）。工具链监听 `src/` 与根目录 `manifest.json`，将成功构建的入口和 manifest 输出到 `dist/module/`；单文件项目的 manifest 从 `definePlugin()` 元数据生成。
2. 在宿主“首选项 → 常规 → 管理插件 → 设置 → 开发模式”选择 **`dist/module/`**，确认开发授权，保持“热重载”开启。桌面端同样通过插件级 consent 授权，无额外 JS 插件总开关。
3. 修改源码并保存。宿主每 1.5 秒轮询一次，连续两次读到稳定文件后只替换该插件，无需刷新页面。关闭设置页后仍继续监听；重新打开可关闭热重载或点击“立即重载”。页面刷新后需重新选择目录。

开发授权仅在当前应用会话内按插件 id 复用，包含后续源码修改；不覆盖正式 ZIP 的内容授权。修改 id 或 runtime 时需重新选择目录。同名出厂插件可用相同版本开发，不必人为递增版本；正式安装仍执行版本检查。禁用状态不被重载开启，卸载或换装正式包后目录变化不会重新安装开发副本。

替换顺序为 `abort → cleanup → host dispose → scope dispose → import → activate`。每次导入使用新的 Blob URL，旧 URL 随卸载释放；命令、菜单、视图及宿主订阅随 scope/host 清理。插件自行创建的定时器、DOM 监听器等必须在返回的 cleanup 中释放，异步工作应响应 `signal`。KV、宿主文档和其他插件保留；组件局部状态与模块闭包重新创建。

编译失败时工具链保留上次成功输出；导入或激活失败时宿主清理失败实例并尝试重新激活旧模块，通过通知显示错误，可修复后保存或立即重试。回退不会撤销失败插件已提交的文档事务或外部副作用，也不能保证有副作用的旧模块再次激活一定成功。开发失败不会累计到正式插件的 crash 计数，开发代码不写入 IndexedDB 安装包，factory pin 不变。专用开发面板、source map 和桌面真机完整验收尚未交付。

商店 catalog 位于同源 `plugins/catalog.json`。artifact 下载后先按可选 `sha256` 校验，再解包和语义校验；trusted-js artifact 还会比对 catalog 与包内 id、version、apiVersion。catalog 也允许 trusted-js 条目直接指向同源裸 ESM，这一路径不经过容器安装，但仍经过 catalog 解析、同源限制和统一加载闸门。当前只有一个同源 catalog，没有多源聚合、评分或依赖解析。

## 8. 测试与发布检查

插件至少覆盖 manifest/包解析、能力拒绝、revision 冲突、原子编辑、卸载清理、取消/超时和恶意输入。trusted-js 使用 `MockTrustedJsHost`；宿主实现与 mock 应运行同一合同测试。

宿主仓库发布前执行：

```sh
pnpm plugin:api:check
pnpm plugin:sdk:check
pnpm lint:boundaries
pnpm test
pnpm build
```

协议变化时先修改 `packages/plugin-api` 的类型、Schema、parser 和合同测试，再运行 `pnpm plugin:api:build` 重新生成协议索引，最后更新 SDK、宿主和本指南。生成文件不入库，不要手工编辑。


## 本地商店提供者技术验证

1. 启动静态 toolkit 服务或 `amll-ttml-tool-plugin-store` 后端，确认 `GET http://localhost:8787/plugins/catalog.json` 可返回 `RemotePluginCatalogV0`。
2. 在宿主首选项 → 常规 → 管理插件 → 插件设置 → 商店提供者填写名称和完整 catalog URL，点击“添加第三方提供者”。按服务实际监听端口调整 URL；artifact `entry` 相对 catalog 所在目录解析。
3. 点击刷新时客户端请求目录，缓存到本地后与已安装版本比较；之后断开服务刷新，应显示不可用并保留缓存，其他货架仍可用。
4. trusted-js 包安装时确认第三方 consent 中的提供者名；安装和更新均校验 SHA-256 与 manifest id/version/API 一致性。主题安装成功后可在已安装页启用。
5. 移除提供者后，已安装插件继续可用，来源显示已移除；重新添加同一 URL 会分配新的提供者 id，可显式从新来源安装/更新。

目录公开读取无需管理员登录；管理员仅用于后端维护目录/上传。提供者警示与 localhost HTTP 放行仅用于本期技术原型。

浏览器交互已于 2026-10-18 随提交 `82e406f0` 验收完成。后续回归使用 `tests/plugins/browser/index.html`，步骤、导航预期与平台边界见 [浏览器验收说明](../tests/plugins/browser/README.md)。插件管理器入口位于常规页，SDK 的动态 `settings-view` 贡献与管理器自身的“插件设置”分别覆盖；Tauri 真实 WebView 的 Blob 加载与共享 React 尚待平台实测。

## 局部覆盖资源协议

当前交付的真实 Chromium UI 回归已通过，安装、字符串表表单、冲突提示、管理器覆盖链与禁用/卸载回退的步骤及边界见 [局部覆盖验收记录](local-overrides-acceptance.md)。

trusted-js 覆盖方启用后，目标插件的命令标题/分类、标题栏动作 tooltip/图标、格式标题及 `host.i18n.t` 字符串即时切换，禁用或卸载覆盖方即回退。文案按 locale 合并：覆盖方提供的 locale（含必填的 default）替换目标同 locale 文本，未提供的保持原样，因此只补一种语言时 default 宜沿用目标原文。多个覆盖方覆盖同一 key（同一 locale）时最后启用者胜出，重启后保持；启用时宿主弹出冲突提醒，可停用新启用者回退，插件管理器的目标条目列出覆盖链。目标需已加载；被过滤的地址会在 console 输出 `[overrides]` 诊断。主题包中的 overrides 与 `settings` 表单地址暂无运行时效果。

覆盖方 manifest 示例（片段）：

```json
{
  "dependencies": [{ "id": "example.target", "version": "^1.0.0" }],
  "overrides": [{ "pluginId": "example.target", "kind": "localization", "entry": "strings/zh-CN.json" }]
}
```

对应资源：

```json
{
  "/commands/example.target.run/title": { "default": "Run", "zh-CN": "运行" },
  "/settings/example.target.settings/form/fields/0/label": { "default": "Name", "zh-CN": "名称" }
}
```

JSON 安装包将此对象放入 `resources["strings/zh-CN.json"]`；ZIP 将它保存为 `resources/strings/zh-CN.json`，manifest.json descriptor 不内联 resources。现有独立工具链尚未扩展自动收集此资源，制作时须遵守此容器布局。文件名不指定语言，使用 LocalizedText 映射指定 locale；映射必须含 default，最多 16 项，每个字符串最多 2048 字符，无 HTML。icons 使用相同 key 映射形状，值为宿主白名单 ActionIconV0。

完整地址与限制见 PLUGIN.md“局部覆盖协议”。目标不存在的地址只产生诊断；核心行为字段不能覆盖。表单数组索引绑定目标版本，目标结构改变时应调整依赖版本范围和资源。`resolveOverridePayload` 返回过滤后的 payload 和 diagnostics；调用者应记录诊断，不得把原始 payload 当作对象补丁合并到 manifest。

## 字符串表

代码里需要展示给用户的文案应放入字符串表，语言包插件才能经 `/strings/<key>` 覆盖它们；硬编码字符串不可覆盖。

```json
{ "contributes": { "strings": ["strings/base.json", "strings/ja.json"] } }
```

```json
// strings/base.json
{ "shift.done": { "default": "Shifted {count} lines", "zh-CN": "已平移 {count} 行" } }
// strings/ja.json —— 可只放一个语言，合并后须有 default
{ "shift.done": { "ja": "{count} 行をシフトしました" } }
```

```ts
host.ui.notify({ level: "info", message: host.i18n.t("shift.done", { count: 3 }) });
host.i18n.onLocaleChanged(() => rerender());
```

JSON 包放入 `resources[entry]`，ZIP 保存为 `resources/<entry>`，与覆盖资源相同；独立工具链尚未自动收集这些文件。语言按 `zh-CN` → `zh` → `default` 回退；占位符只支持 `{name}`；未知 key 返回 key 本身。key、数量与长度限制见 PLUGIN.md“字符串表”。测试可用 `new MockTrustedJsHost({ pluginId, strings, locale })` 与 `setLocale()`。
