# AMLL TTML Tool 插件开发指南

状态：experimental v0

适用版本：当前仓库

本文面向插件作者，说明当前可用的插件档位、开发入口、包格式和发布检查。完整类型以 `packages/plugin-api/src` 与 `packages/plugin-sdk-js/src` 为准；自动生成的字段索引运行 `pnpm plugin:api:build` 后见 `docs/plugin-protocol-v0.md`，宿主内部结构见仓库根目录 `PLUGIN.md`。v0 允许破坏性变更。

## 1. 选择插件档位

| 目标 | `kind` | `runtime` | 运行边界 |
| --- | --- | --- | --- |
| 歌词处理、命令、表单、格式转换及 React 视图 | `function` | `trusted-js` | 经准入后与应用同权，不提供安全隔离 |
| 颜色、排版、表面背景和受限 CSS | `theme` | `none` | 纯声明式数据，不执行代码 |

`builtin` 只供宿主内置功能使用，不是第三方分发入口。主题和功能不能放在同一个包中。

trusted-js 可以绕过 SDK 直接使用浏览器能力，因此应像安装桌面软件一样审查其来源；`TrustedJsHostV0` 是兼容性与资源生命周期边界，不是沙箱。

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

非 factory 包在 import 前经过 API 版本、来源、桌面总开关、用户禁用、崩溃状态与 consent 检查。内容 SHA-256 用于识别变更并触发重新授权，不是签名或安全认证。factory 副本随应用交付；严格更高版本可以遮蔽它，卸载更新后可 pin 回 factory。

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

## 7. 打包、安装与更新

宿主按 magic bytes 识别 JSON 或 ZIP，不依赖文件扩展名：

- JSON 是完整的 `TrustedJsPluginPackageV0` 或 `ThemePackageV0`。
- ZIP 根目录必须有 `manifest.json` 描述符，载荷位于 `assets/<entry>`；主题样式和资源同样必须被声明。
- 容器最多 48 MiB，解包总量最多 64 MiB，最多 64 个文件；拒绝绝对路径、反斜杠、dot segment、重复项和未声明文件。

用户入口：

- 设置 → 插件：插件网络设置、从目录加载 trusted-js 开发插件。
- 工具 → 插件商店：导入 ZIP/JSON，浏览同源 catalog，管理 trusted-js 与更新。
- 开发目录：`manifest.json` 加入口 JS，仅当前会话有效；浏览器需支持 File System Access API。

### trusted-js 插件级热重载

1. 在插件项目运行 `amll-plugin dev`（使用本工作区工具链时可运行 `node ../amll-ttml-tool-plugin-toolkit/bin/cli.mjs dev`）。工具链监听 `src/` 与根目录 `manifest.json`，将成功构建的入口和 manifest 输出到 `dist/module/`；单文件项目的 manifest 从 `definePlugin()` 元数据生成。
2. 在宿主“设置 → 插件 → 开发模式”选择 **`dist/module/`**，确认开发授权，保持“热重载”开启。桌面端仍需先启用 JS 插件开关。
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
