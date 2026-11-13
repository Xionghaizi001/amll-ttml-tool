# 插件开发指南

本文按当前工作区实现编写（2026-11-14），覆盖宿主公开的插件能力和全部 `TrustedJsHostV0` 方法。协议、SDK、主题 token 版本均为 **0**，仍处于开发阶段；同为 v0 的旧 SDK 包不一定包含新接口。本文不介绍任何内置插件；其他插件的命令和业务合同应查阅其自身仓库。

## 1. 选择插件类型

| 类型 | Manifest | 当前能力 |
| --- | --- | --- |
| 功能插件 | `kind: "function"`、`runtime: "trusted-js"`、`apiVersion: 0` | 单文件 ESM，运行 `activate()`，通过 SDK 注册命令、菜单、视图、格式并访问宿主服务 |
| 主题插件 | `kind: "theme"`、`runtime: "none"`、`themeApiVersion: 0` | 声明 token、受限 CSS、包内图片，可面向全局或指定插件；不执行 JS |

`builtin` 是宿主内部运行档，不是第三方包的运行档。当前没有供外部插件使用的 Worker/RPC 沙箱运行档。trusted-js 在应用上下文中运行，用户在加载前确认信任；SDK 的命名空间和生命周期管理不是安全沙箱。开发模式具有相同权限。

事实来源：[公开数据类型](../packages/plugin-api/src/types.ts)、[SDK 接口](../packages/plugin-sdk-js/src/host.ts)、[真实宿主实现](../src/plugins/trusted/trusted-js-host-api.ts)。维护宿主请阅读 [Agent 指南](./plugin-agent-guide.md)。

## 2. 创建、构建、安装

使用独立的 plugin-toolkit，要求 Node 24+。从 toolkit 仓库运行：

```sh
pnpm install --frozen-lockfile
node bin/cli.mjs create ../my-plugin trusted-js
cd ../my-plugin
pnpm install
pnpm test
pnpm run pack
```

主题模板把最后一个参数改成 `theme`。当前 API/SDK 由模板的 `vendor/*.tgz` 提供，不要假设它们已发布到公共 npm。固定工具链和依赖版本；宿主更新接口后需要同步 tarball 和 lockfile。

工具链命令：

| 命令 | 用途 |
| --- | --- |
| `pnpm exec amll-plugin build` | 正式构建单文件 ESM，输出 `dist/module/` |
| `pnpm exec amll-plugin dev` | 监听 `src/`、根 manifest，输出含内联 source map 的开发模块 |
| `pnpm test` | 模板中的构建及 Vitest 测试 |
| `pnpm run pack` | 构建并生成 `dist/plugins/catalog.json`、`dist/plugins/store/<sha256>.zip` |
| `pnpm serve` | 本地提供 `dist/`，默认 `127.0.0.1:4174` |

正式安装：在首选项的插件管理页导入 ZIP，或通过配置的商店源安装。不要把开发输出当发布包。开发加载：开启插件开发模式，选择 `dist/module/` 目录并确认授权；刷新应用后需要重新选择。编译失败保留旧产物，激活失败尝试恢复旧模块。开发授权只在会话内有效，已产生的数据修改不会自动撤销。字符串表和覆盖资源应使用正式 ZIP 验证，当前开发目录不携带这些资源。

源码入口是 `src/plugin.ts`，可以导入自己的 `.tsx`/其他模块，最终必须打包为一个 ESM。可保留的共享导入只有 `react`、`react/jsx-runtime`、`react/jsx-dev-runtime`、`react/compiler-runtime`、`react-dom`、`react-dom/client` 和 `@radix-ui/themes`。使用宿主共享的 React/Radix，不能打包私有副本；API/SDK 随插件打包。禁止依赖宿主 `$/` 别名或未打包的任意模块导入。

## 3. 最小可用功能插件

`definePlugin()` 是 SDK 的身份函数，用来检查模块形状；toolkit 从字面量元数据生成 manifest。无需在宿主仓库内添加源码。

```ts
import { definePlugin } from "@amll-ttml-tool/plugin-sdk-js";

export default definePlugin({
  id: "example.plugin",
  name: "示例插件",
  version: "1.0.0",
  apiVersion: 0,
  capabilities: ["ui.notify"],
  activate({ host, pluginId, signal }) {
    host.commands.register({
      id: `${pluginId}.hello`,
      title: "打个招呼",
      handler: () => host.ui.notify({ level: "info", message: "你好" }),
    });
    host.menus.register({ command: `${pluginId}.hello`, menu: "menu.tool" });
    // signal 在停用时中止；宿主自动清理以上注册。
  },
});
```

也可以提供完整的根 `manifest.json` 并导出 `activate`（toolkit 优先读取根 manifest）：

```json
{
  "id": "example.plugin",
  "name": "示例插件",
  "version": "1.0.0",
  "kind": "function",
  "runtime": "trusted-js",
  "apiVersion": 0,
  "entry": "index.js",
  "capabilities": ["lyrics.core", "ui.form", "storage.kv"]
}
```

ID 大小写敏感，命令、视图、模式、格式 ID 必须以自己的 `<pluginId>.` 开头。版本使用 semver。需要依赖、覆盖、图标等 `definePlugin` 元数据类型未包含的字段时使用完整 manifest。

当前核心 capability 名称为 `lyrics.core`、`lyrics.ruby`、`lyrics.format`、`ui.notify`、`ui.form`、`storage.kv`、`network.http`；还允许符合规则的 `extensions.*` 名称。它们不意味着额外的 `host.extensions` 方法，也不是 trusted-js 的逐方法安全隔离机制。

**声明不等于运行时注册。** 当前 trusted-js 加载器直接调用 `activate()`；命令、菜单、标题栏按钮、格式和设置页应在其中调用对应注册方法。manifest 的 `contributes` 可描述贡献、提供字符串表和覆盖表面，但不能代替实际 handler/view/provider 注册。`activationEvents` 虽在协议中接受，当前加载链路不按它提供延迟激活；需要事件处理时显式订阅。

## 4. 调用约定与生命周期

后续 snippet 均放在 `activate({ host, pluginId, signal })` 或其回调中；`pluginId` 为 `example.plugin`。各代码块独立，不要按顺序一次性执行全部示例。TSX 示例位于独立组件文件，组件通过闭包或 props 获得 host。

- `host.sdkVersion`、`host.document.revision`、`host.i18n.locale` 是只读属性，不是方法。
- `document.applyEdit` 同步返回 `HostResult`；`project.importDocument`、`network.request`、专用桥接 `github.post` 异步返回 `HostResult`。先判断 `ok`，失败读取 `error.code/message`。
- 其他接口按签名返回普通值，可能抛异常或拒绝 Promise；不要把所有返回值都当作 `HostResult`。
- 注册、连接和订阅通常返回 `DisposableV0`：`const sub = host.selection.onChanged(console.log); sub.dispose();`。宿主停用时自动清理；React 组件应在自己的卸载回调中提前释放订阅。
- `activate` 可以返回同步或异步 cleanup，用于自己创建的定时器、监听器、DOM 等资源。停用会中止 signal；cleanup 不应再提交宿主操作。不要在模块顶层执行注册或修改数据。

```ts
const timer = setInterval(() => {
  if (!signal.aborted) console.log(host.document.revision);
}, 1000);
return () => clearInterval(timer);
```

## 5. 文档、选区与项目

### `host.document`

| 方法 | 作用与最短调用 |
| --- | --- |
| `readSnapshot()` | 读取公开投影：`const snapshot = host.document.readSnapshot();` |
| `applyEdit(ops, label, options?)` | 一批操作作为一次可撤销事务：见下例 |
| `onChanged(listener)` | 监听事务：`const sub = host.document.onChanged(e => console.log(e.revision, e.sourcePluginId));` |

投影的行/词使用稳定 ID；歌词、词、Ruby 的 `startTime/endTime` 单位为**毫秒**。新行和新词不传 ID，由宿主分配。快照不包含全部宿主内部字段；修改快照本身不会写回。

```ts
const snapshot = host.document.readSnapshot();
const line = snapshot.lines[0];
if (line) {
  const result = host.document.applyEdit(
    [{ op: "updateLine", lineId: line.id, patch: { translation: "译文" } }],
    "修改译文",
    { expectedRevision: snapshot.revision },
  );
  if (!result.ok) host.ui.notify({ level: "error", message: result.error.message });
}
```

`expectedRevision` 可省略，但任何基于旧快照计算的修改，尤其跨 `await` 后的修改，都应传入。冲突时重新读取/重新计算或提示用户，不应盲目覆盖。失败的事务不部分提交。订阅中若要写回，检查 `event.sourcePluginId === pluginId`，避免自身事件循环。

### 全部 `DocumentOpV0`

下面是传给 `applyEdit` 的单个操作示例；`lineId`、`wordId` 必须来自当前快照，`newLine`、`newWord` 为下方结构，示例不应整组同时执行。

| 操作 | snippet |
| --- | --- |
| 更新行 | `{ op: "updateLine", lineId, patch: { isDuet: true } }` |
| 更新词 | `{ op: "updateWord", wordId, patch: { text: "你好" } }` |
| 插入行 | `{ op: "insertLine", afterLineId: null, line: newLine }` |
| 删除行 | `{ op: "removeLine", lineId }` |
| 移动行 | `{ op: "moveLine", lineId, afterLineId: null }` |
| 插入词 | `{ op: "insertWord", lineId, afterWordId: null, word: newWord }` |
| 删除词 | `{ op: "removeWord", wordId }` |
| 替换全部元数据 | `{ op: "setMetadata", entries: [{ key: "musicName", values: ["示例歌曲"] }] }` |
| 替换文档内容 | `{ op: "replaceDocument", lines: [newLine], metadata: [] }` |

```ts
import type { NewLineV0, NewWordV0 } from "@amll-ttml-tool/plugin-api";
const newWord: NewWordV0 = {
  text: "你好", startTime: 0, endTime: 1000, emptyBeat: 0, romanText: "",
};
const newLine: NewLineV0 = {
  words: [newWord], translation: "", romanization: "",
  isBackground: false, isDuet: false, ignoreSync: false,
  startTime: 0, endTime: 1000,
};
```

`afterLineId/afterWordId: null` 表示插入或移动到开头。`updateLine` 不替换整组 words，需使用词操作。`updateWord` 的 `ruby: null` 删除 Ruby，`ruby: []` 保留启用但为空的 Ruby 结构；省略字段表示不修改。`setMetadata` 是全量替换，保留其他键时先合并当前 metadata。`replaceDocument` 只修改文档内容，不等同于打开新项目。

### `host.selection`

| 方法 | snippet |
| --- | --- |
| `get()` | `const { lineIds, wordIds } = host.selection.get();` |
| `onChanged(listener)` | `const sub = host.selection.onChanged(selection => console.log(selection.lineIds));` |

没有公开的任意 `selection.set()`；定位并选择单行可用 `editor.revealLine()`。

### `host.project`

| 方法 | snippet |
| --- | --- |
| `getInfo()` | `const { projectId, fileName } = host.project.getInfo();` |
| `importDocument(document, label)` | `const result = await host.project.importDocument({ lines: [newLine], metadata: [] }, "导入歌词");` |

`newLine` 使用前面的无 ID 结构。导入经过未保存修改确认、文档事务、项目身份/文件名和默认作者处理，并清空选区；用户保留当前文档时返回 `cancelled`。需要检查 `result.ok`，并捕获可能的异常。没有公开的直接保存路径或任意文件系统接口。

## 6. 命令、菜单与标题栏

### `host.commands`

```ts
// register(input)：返回 DisposableV0；handler 可同步或异步。
const command = host.commands.register({
  id: `${pluginId}.run`, title: "执行示例", category: "示例",
  enablement: "hasLineSelection",
  handler: args => console.log(args),
});
// execute(id, args?)：返回 Promise<unknown>；提供方不可用/命令禁用时拒绝。
await host.commands.execute(`${pluginId}.run`, { source: "button" });
```

跨插件调用的返回值必须由调用者按目标合同校验；宿主不提供业务结果的通用类型保证。不要猜测其他插件的命令 ID。

### `host.menus.register(input)`

```ts
host.menus.register({
  command: `${pluginId}.run`, menu: "menu.tool",
  group: "example", order: 10, when: "hasLineSelection",
});
```

菜单位置全集：`menu.file`、`menu.edit`、`menu.tool`、`menu.help`、`toolbar.edit`、`toolbar.sync`、`context.lyricLine`、`context.lyricWord`、`sidebar.panel`。`sidebar.panel` 目前只有注册位置定义，没有对应菜单渲染入口；其他位置还受当前界面和 when 条件影响。创建 React 侧栏使用 `views.registerView`。

`when` / `enablement` 支持 `!`、`&&`、`||`、`==`、`!=`、括号、单引号字符串、数字、布尔值。上下文包括 `mode`、`hasSelection`、`hasLineSelection`、`hasWordSelection`、`documentEmpty`、`audioLoaded`、`canUndo`、`canRedo`。未知标识符按不满足处理。

### `host.titleBarActions.register(input)`

```ts
host.titleBarActions.register({
  id: `${pluginId}.action`, command: `${pluginId}.run`,
  icon: { source: "@fluentui/react-icons", name: "InfoRegular" },
  tooltip: "执行示例", order: 10,
});
```

每插件最多 3 个声明式标题栏操作；图标必须来自 `ACTION_FLUENT_ICON_NAMES_V0` 白名单，tooltip 为纯文本或 `LocalizedText`。菜单和按钮引用本插件已经注册的命令。

## 7. 表单、通知与视图

### `host.ui`

```ts
// showForm(schema)：普通 FormResultV0，不是 HostResult。
const form = await host.ui.showForm({
  title: "设置偏移", size: "small",
  fields: [{ kind: "number", key: "offset", label: "毫秒", default: 0, step: 1 }],
});
if (form.submitted) console.log(form.values.offset);

// notify(params)：level 为 info / success / warning / error。
host.ui.notify({ level: "success", message: "操作完成", detail: "示例详情", timeoutMs: 3000 });

// openView(viewId) / closeView(viewId)：只能打开自己的已注册 dialog-view。
host.ui.openView(`${pluginId}.dialog`);
host.ui.closeView(`${pluginId}.dialog`);
```

表单字段支持 `text`（可 multiline）、`number`、`boolean`、`select`、`radio`、`note`、嵌套 `group`；`visibleWhen: { field, equals }` 控制显示。自定义 `actions` 可包含 submit/cancel 角色，结果的 `action` 为按钮 ID；设置 actions 后忽略旧 submit/cancelLabel。取消或卸载返回 `{ submitted: false }`。宿主负责表单展示与值清理，业务校验仍由插件完成。

### `host.views.registerView(input)`

注册返回 `DisposableV0`。面板类型为 `sidebar`、`settings-view`、`dialog-view`、`titlebar-group`；设置视图显示在插件管理侧栏。`size` 仅用于 dialog-view，可为 small/medium/large/full。

```tsx
host.views.registerView({
  id: `${pluginId}.dialog`, kind: "dialog-view", title: "示例对话框", size: "medium",
  view: () => <p>你好</p>,
});
```

同一个方法也支持词编辑器与只读附加标记：

```tsx
host.views.registerView({
  id: `${pluginId}.wordEditor`, kind: "word-editor", title: "词编辑器",
  view: ({ word, layout }) => <span>{layout}: {word.text}</span>,
  // 同步钩子，处于宿主原有输入事务内；返回 undefined 表示不处理。
  transformTextInput: (text, word, context) =>
    text === "示例快捷输入" ? { text: "示例" } : undefined,
});
host.views.registerView({
  id: `${pluginId}.badge`, kind: "line-adornment", title: "行标记",
  view: ({ targetId }) => <small>{targetId}</small>,
});
// word-adornment 使用相同的 { targetId } props。
```

词编辑器收到 `word`、`layout: "simple" | "advanced"`。`word-adornment` / `line-adornment` 收到 targetId，需自行读取快照并订阅变化。多个文本输入转换器中首个返回 patch 的贡献生效；钩子不能异步等待，也不要在其中再次提交事务。

### `host.views.registerMode(input)`

```tsx
host.views.registerMode({
  modeId: `${pluginId}.mode`, title: "示例模式", order: 50,
  mainView: () => <main>模式内容</main>,
  ribbonView: () => <span>模式工具栏</span>, hideSidebar: false,
});
```

可选字段还包括 `when`、`titleBarActions`（React 组件）、`mainViewKey`（共享相同 key 的模式保留主视图挂载）。模式/视图属于 trusted-js 动态注册能力，不要虚构 manifest 的 `contributes.modes/views` 字段。

### `host.editor`

```ts
// revealLine(lineId)：选中存在的行、清空词选区并滚动；未知 ID 抛错。
const line = host.document.readSnapshot().lines[0];
if (line) host.editor.revealLine(line.id);
```

`useLineList(containerRef)` 是 React hook；`LineContextMenu` 是 React 组件，不是普通命令。以下组件放在 activate 内定义或通过 props 注入 host：

```tsx
import { useRef } from "react";
function LineList() {
  const ref = useRef<HTMLDivElement>(null);
  const drag = host.editor.useLineList(ref);
  const Menu = host.editor.LineContextMenu;
  const lines = host.document.readSnapshot().lines;
  return <div ref={ref} style={{ position: "relative" }}>
    {lines.map((line, index) => <Menu key={line.id} lineId={line.id}>
      <div data-line-id={line.id} data-absolute-index={index}
        onPointerDown={event => drag.onPointerDown(event, line.id)}>
        {line.words.map(word => word.text).join("")}
      </div>
    </Menu>)}
    <div style={{ position: "absolute", left: 0, right: 0, height: 2,
      pointerEvents: "none", background: "currentColor",
      display: "var(--drop-indicator-display, none)",
      top: "var(--drop-indicator-y, 0px)" }} />
  </div>;
}
```

hook 还返回 `isDragging`、`isDraggingSource`。绝对索引必须对应完整文档顺序（虚拟列表不可使用窗口内索引）。编辑模式外只提供选择，不进行拖拽编辑；右键菜单也仅在编辑模式可用。组件卸载时取消手势。上述示例仅展示手势接线，实际列表还需订阅 `document.onChanged` 触发重渲染，例如：

```tsx
import { useEffect, useState } from "react";
const [snapshot, setSnapshot] = useState(() => host.document.readSnapshot());
useEffect(() => {
  const sub = host.document.onChanged(() => setSnapshot(host.document.readSnapshot()));
  setSnapshot(host.document.readSnapshot());
  return () => sub.dispose();
}, [host]);
// 在组件中使用 snapshot.lines 渲染。
```

## 8. 音频与 BPM

### `host.audio`

| 方法 | snippet |
| --- | --- |
| `getState()` | `const audio = host.audio.getState();` |
| `onChanged(listener)` | `const sub = host.audio.onChanged(state => console.log(state.currentTimeMs));` |

状态字段为 engineState、loaded、durationMs、currentTimeMs、playbackRate。该端口是只读的；没有 `audio.play/pause/seek` 或音频采样读取方法。时间字段单位为毫秒。

### `host.bpm`

| 方法 | snippet |
| --- | --- |
| `connect(sidebarViewId, onTap)` | ``const connection = host.bpm.connect(`${pluginId}.beats`, seconds => console.log(seconds));`` |
| `setTapMode(mode)` | `host.bpm.setTapMode("key");`，可选 off/key/spectrogram |
| `getTapKeyLabel()` | `const label = host.bpm.getTapKeyLabel();` |
| `applyCalibration(result)` | `host.bpm.applyCalibration({ bpm: 120, baseBpm: 120, anchorTick: 0, confidence: 1, ticks: [0, 0.5, 1] });` |
| `getState()` | `const state = host.bpm.getState();` |
| `onChanged(listener)` | `const sub = host.bpm.onChanged(state => console.log(state.status));` |
| `setScale(scale)` | `host.bpm.setScale(2);` |
| `setFollowPlaybackRate(value)` | `host.bpm.setFollowPlaybackRate(true);` |
| `setShowBeatLines(value)` | `host.bpm.setShowBeatLines(true);` |
| `tap(timeSeconds?)` | `host.bpm.tap();` 或 `host.bpm.tap(1.5);` |
| `reset()` | `host.bpm.reset();` |

先用 `views.registerView` 注册自己的 beats 侧栏，再 connect。连接是宿主 BPM 显示/输入桥，同时只能存在一个提供者；冲突时不可假设可以共存。`connection.dispose()` 提前释放连接。

BPM 的 ticks、anchorTick、onTap 与 tap 参数单位为**秒**，不要与歌词毫秒混用。无参 tap 使用宿主校准过的音频时钟。scale 范围为 1/64–64，校准 bpm 范围为 20–400、baseBpm > 0、confidence 为 0–1；anchorTick 非负，ticks 非负且严格递增，数量不超过 100000。状态为 idle/analyzing/completed/error，只有 completed 有 bpm/ticks 等结果字段。reset 恢复当前音频的原分析；校准属于音频会话，不是项目文档内容。

## 9. 分词与罗马音预测

### `host.segmentation`

```ts
// isKanaOnly(text)
const kana = host.segmentation.isKanaOnly("かな");
// getConfig?() / setConfig?(config)：SDK 中为可选成员，当前真实宿主已接通。
const config = host.segmentation.getConfig?.();
if (config) host.segmentation.setConfig?.({ ...config, splitEnglish: true });
// segmentText(input, segments?)：省略 segments 自动分词；提供时按显式片段分配时间。
const automatic = await host.segmentation.segmentText({ text: "你好", startTime: 0, endTime: 1000 });
const explicit = await host.segmentation.segmentText(
  { text: "你好", startTime: 0, endTime: 1000 }, ["你", "好"],
);
```

配置包含 splitCJK、splitEnglish、punctuationMode（merge/standalone）、punctuationWeight、removeEmptySegments、ignoreListText、customRules、lang。`setConfig` 修改宿主共享分词偏好，不能当作仅当前调用的局部配置。segmentText 返回 `{ text, startTime, endTime }[]`，不写文档；时间为毫秒。需要应用结果时自行构造文档操作并保留 revision 保护。

### `host.romanization.registerPredictor(predict)`

```ts
const provider = host.romanization.registerPredictor((words, romanization) => {
  const parts = romanization.trim().split(/\s+/);
  return words.map((_, index) => parts[index] ?? "");
});
```

这是最简单的按空白分配示例，并非语言算法。回调同步返回与 words 索引对齐的字符串数组；最近的活动注册生效，dispose 后恢复上一提供者。它为编辑器提供建议，不直接改文档。

## 10. 格式转换

### `host.formats.register(provider)`

```ts
host.formats.register({
  formatId: `${pluginId}.plain`, title: "示例纯文本", extensions: ["txt"],
  mimeType: "text/plain", order: 100,
  importer: ({ text }) => ({
    lines: text.split(/\r?\n/).map(text => ({
      words: [{ text, startTime: 0, endTime: 0, emptyBeat: 0, romanText: "" }],
      translation: "", romanization: "", isBackground: false, isDuet: false,
      ignoreSync: false, startTime: 0, endTime: 0,
    })), metadata: [],
  }),
  exporter: ({ document }) =>
    document.lines.map(line => line.words.map(word => word.text).join("")).join("\n"),
});
```

importer/exporter 至少提供一个，可异步。扩展名为不带点的小写字符串，首个用于导出。importer 返回无 ID 的行与 metadata；exporter 收到公开文档和 fileName，返回字符串。每插件最多 8 个格式；单次文本转换上限为 1 Mi 个 UTF-16 单元。只做转换，文件选择、未保存确认、文件名和导入事务由宿主处理。示例纯文本格式会丢弃时间、翻译和 Ruby，不应作为无损格式使用。

## 11. 存储、网络与专用桥接

### `host.storage.kv`

| 方法 | snippet |
| --- | --- |
| `get(key)` | `const value = await host.storage.kv.get("preferences");` |
| `set(key, value)` | `await host.storage.kv.set("preferences", { enabled: true });` |
| `delete(key)` | `await host.storage.kv.delete("preferences");` |
| `keys()` | `const keys = await host.storage.kv.keys();` |

值为 JsonValue，缺失时 get 返回 null；读取后验证业务结构。存储按插件 ID 隔离，写入/删除需要 await 并处理异常；禁用保留 KV，卸载删除 KV。没有跨插件读写或多键事务 API。

### `host.network`

```ts
// isOffline()
const offline = host.network.isOffline();
// request(request)
const result = await host.network.request({
  url: "https://example.com/data.json", method: "GET", timeoutMs: 10000,
});
if (!result.ok) {
  host.ui.notify({ level: "error", message: result.error.message });
} else if (!result.value.ok) {
  host.ui.notify({ level: "error", message: `HTTP ${result.value.status}` });
} else {
  console.log(result.value.body); // UTF-8 文本；JSON 仍需自行解析和校验。
}
```

method 支持 GET/POST/PUT/PATCH/DELETE，body 仅支持文本。默认匿名传输，不附加宿主凭据；禁止 Authorization、Cookie 等保留请求头。只接受绝对 HTTPS URL（本机开发允许 HTTP loopback），离线时快速失败。卸载取消在途请求；当前适配器把多数传输失败/超时/取消映射为 `network-unavailable`，超大响应为 `payload-too-large`。HTTP 4xx/5xx 是 `HostResult.ok: true` 内的 `response.ok: false`，不能只检查外层 ok。

### `host.github`：受限宿主桥接

此成员在公共类型中存在，但真实宿主**只允许指定身份 `github.auth` 调用**，普通插件直接调用会抛错。以下仅为全部 SDK 方法的签名示例，不是普通插件可运行的功能；不应通过修改插件 ID 冒用身份。具体提供方业务用法请查其独立仓库。

```ts
// 以下代码仅适用于获准的专用提供方；token 来自用户输入，不能写入源码/日志。
const identity = await host.github.authenticate(token);
const current = await host.github.getIdentity();
host.github.logout();
// 仅在用户明确触发提交时调用；path 为 GitHub API 相对路径。
const response = await host.github.post(path, body);
```

authenticate/getIdentity 返回 `GithubIdentityV0` 状态联合（成功时含 login/id，不含凭据）；post 返回 `HostResult<HttpResponseV0>`。认证先验证再替换保存的凭据；存储失败会拒绝。此处不列举任何插件命令。

## 12. 国际化、依赖与覆盖

### `host.i18n`

在 manifest 添加 `"contributes": { "strings": ["strings/ui.json"] }`，对应文件内容：

```json
{
  "hello": { "default": "Hello {name}", "zh-CN": "你好，{name}" }
}
```

```ts
// t(key, params?)：缺失 key 时返回 key；支持 {name} 插值。
const greeting = host.i18n.t("hello", { name: "读者" });
// onLocaleChanged(listener)：语言或覆盖层改变后重新读取文案。
const sub = host.i18n.onLocaleChanged(locale => console.log(locale, host.i18n.t("hello")));
const locale = host.i18n.locale;
```

语言按当前 locale、基础语言、default 回退。`LocalizedText` 也可直接写成字符串或 `{ default: "Run", "zh-CN": "执行" }`。希望语言包替换的 React 文案应放入字符串表，不能硬编码。

依赖写在完整 manifest，最多 16 项：

```json
{ "dependencies": [{ "id": "example.provider", "version": "^1.0.0", "optional": false }] }
```

依赖只表达存在、版本与激活顺序，不自动获得 API/权限。必要依赖缺失、禁用或未就绪会阻止激活；可选依赖不可用时插件应自行降级。

局部覆盖是声明式资源，不执行目标代码。例如语言包 manifest 片段：

```json
{
  "dependencies": [{ "id": "example.provider", "version": "^1.0.0" }],
  "overrides": [{ "pluginId": "example.provider", "kind": "localization", "entry": "overrides/zh.json" }]
}
```

资源 `overrides/zh.json` 示例：

```json
{ "/strings/hello": { "default": "Hello", "zh-CN": "你好" } }
```

覆盖类型为 localization/icons，目标必须是必要依赖。仅允许目标发布的文本表面和白名单图标；不能覆盖 handler、ID、capability、激活行为等。未知表面会被过滤并产生诊断。运行时按启用顺序叠加，停用后回退。声明的字符串表/覆盖资源必须存在于包中，不能携带未声明资源。

## 13. 主题能力

主题没有 activate，也没有可调用的 host 方法。完整 manifest 最小例：

```json
{
  "id": "example.theme", "name": "示例主题", "version": "1.0.0",
  "kind": "theme", "runtime": "none", "themeApiVersion": 0,
  "appearance": "both", "tokens": "tokens.json"
}
```

`tokens.json`：

```json
{
  "tokenVersion": 0,
  "color": { "accent": "#8064ee", "textPrimary": "#222222" },
  "dark": { "color": { "textPrimary": "#eeeeee" } }
}
```

token 组：color、font、spacing、lyrics、spectrogram、background、surfaces；light/dark 可覆盖颜色、歌词、频谱、背景和表面组。合法键：

| 组 | 可用键 |
| --- | --- |
| color | panelBackground、textPrimary、textSecondary、accent、border、danger |
| font | family、monoFamily、scale |
| spacing | scale、radius |
| lyrics | lineBackground、lineSelectedBackground、lineHoverBackground、wordText、wordSecondaryText、wordHighlight |
| spectrogram | background、playhead、lineSegment、wordSegment、gapSegment、waveform |
| surfaces | appRoot、titleBar、ribbonBar、dropdownMenu、playControls、modalLarge、modalMedium、modalSmall |

background 的 kind 为 solid/gradient/none；surfaces 还支持 image 和 scrim，图片通过 `asset:<name>` 引用包内资源，不能加载远程资源。modalSmall/modalMedium 使用背景时需要满足 modalLarge 回退约束。

可选 `styles: ["theme.css"]` 引入受校验 CSS，例如：

```css
[data-slot="lyric-editor"] [data-part="lyric-word"] { color: #8064ee; }
```

宿主 slot：app-root、background-layer、title-bar、ribbon-bar、sidebar、lyric-editor、preview、audio-controls、spectrogram、plugin-form。part：lyric-line、lyric-word、form-field、form-group、form-note、form-footer。只能使用协议允许的选择器、属性和资源引用，不能覆盖 `data-amll-protected` 区域。

`scope` 默认为 global；限定插件使用 `"scope": { "pluginId": "example.provider" }`，并声明目标必要依赖。目标可通过 `contributes.themeParts` 发布 `<pluginId>.` 前缀的 part 名称。作用域主题由宿主包装锚点，不要写 `:root` 越界样式。应用、预览、恢复默认和用户 override 由宿主主题 UI 管理，未提供插件可调用的 `host.theme` API。

## 14. 验证与发布

先运行插件自己的 `pnpm test`、`pnpm run pack`，再在目标宿主安装生成的 ZIP，验证触发入口、正常操作、取消/冲突/错误、禁用、启用、刷新和卸载。React 视图、编辑手势、主题效果、文件选择和桌面 WebView 必须用实际界面验收。

示例测试可使用 SDK 的 `@amll-ttml-tool/plugin-sdk-js/testing` 导出的 `MockTrustedJsHost` 与 `createTrustedJsHostUnderTest`；API 的 `runHostContractTests` 位于 `@amll-ttml-tool/plugin-api/testing`。这些是测试工具，不是运行时 host 方法；mock 不能证明真实 DOM、持久化或网络可用。

发布保持 ZIP 字节和 catalog SHA-256 一致；复制整个发布目录，不修改产物内容。不要把开发 source map、凭据、用户文档或未声明文件打入包。外部插件的发布、版本和专有命令由其自身仓库维护。
