# AMLL TTML Tool Plugin Development Guide

本文是给插件开发者的人工可读手册。它描述当前 experimental Plugin API v0 的稳定约定、最小示例和安全边界。
机器可校验的完整 Schema 见 [Plugin Protocol v0](./plugin-protocol-v0.md)；架构决策见
[ADR 0001](./adr/0001-plugin-architecture.md) 和 [ADR 0002](./adr/0002-protocol-v0-contract.md)。

## 1. 先确认范围

当前 API 是 v0，允许破坏性变更，不承诺 v1 兼容。插件分为两类，而且一个包只能选择一种：

| 类型 | `kind` | `runtime` | 适用场景 |
| --- | --- | --- | --- |
| 功能插件 | `function` | `builtin` 或 `extism-wasm` | 命令、歌词处理、通知、表单、隔离存储 |
| 主题插件 | `theme` | `none` | 声明式视觉 token 和受限 CSS |

`trusted-js` 仅保留在类型联合中，MVP 的 manifest 校验会拒绝它。普通第三方插件不能注入 React、HTML、DOM、网络、文件系统、Tauri、音频 PCM 或频谱数据。

当前已经可以直接复用的部分：

- `packages/plugin-api` 的类型、版本常量、capability negotiation、manifest/调用/返回值解析。
- JSON Schema 子集校验器和主题 token 校验器。
- Mock Host 合同测试。
- `TimeShiftService` 这样的无 UI application service（宿主内置插件示例）。

命令 registry、contribution 菜单渲染、声明式表单宿主和 owner-scoped 卸载清理已经接入；
`builtin.time-shift` 是首个完整示例。Worker/Extism 权限执行、隔离 KV 和插件管理 UI 仍在后续阶段接入。
不要把“协议中有类型”误解为“宿主已经开放了所有运行入口”。

## 2. 安装和导入

仓库内开发直接使用 workspace 路径：

```ts
import {
  PLUGIN_API_VERSION,
  parseManifest,
  type FunctionPluginManifest,
  type HostCallV0,
  type PluginDocumentV0,
} from "@amll-ttml-tool/plugin-api";
```

包不依赖 React、Jotai、Tauri 或 DOM。运行时传输由宿主负责；SDK 类型只描述 JSON 合同，不假定某个 RPC 库。

常用入口：

| 导入 | 用途 |
| --- | --- |
| `@amll-ttml-tool/plugin-api` | 公共类型、解析器、版本和 capability |
| `@amll-ttml-tool/plugin-api/schema` | Schema 常量和 `validate()` |
| `@amll-ttml-tool/plugin-api/testing` | `MockPluginHost`、`runHostContractTests()` |

开发检查：

```sh
pnpm plugin:api:check
pnpm test
pnpm lint:boundaries
```

## 3. SDK 关键字段

### 3.1 版本和 capability

```ts
PLUGIN_API_VERSION // 0，功能插件 manifest 的 apiVersion
THEME_API_VERSION  // 0，主题 manifest 的 themeApiVersion
THEME_TOKEN_VERSION // 0，主题 token 的 tokenVersion
```

内置 capability：

| Capability | 权限范围 |
| --- | --- |
| `lyrics.core` | 读取公开文档、读取选区、修改行/词/元数据 |
| `lyrics.ruby` | 读取或修改 ruby 分段；涉及 ruby 的编辑还需要它 |
| `ui.notify` | 发送纯文本通知 |
| `ui.form` | 请求宿主渲染声明式表单 |
| `storage.kv` | 访问插件隔离的键值存储 |

定制版可以声明精确的扩展 capability，例如 `extensions.dev.amll.review`。不支持 `lyrics.*` 等通配符。

```ts
const result = negotiateCapabilities(
  ["lyrics.core", "ui.notify", "extensions.dev.amll.review"],
  hostSupportedCapabilities,
);
// result.granted / result.rejected
```

### 3.2 功能插件 manifest

```ts
const manifest: FunctionPluginManifest = {
  kind: "function",
  id: "dev.example.time-shift",
  name: "Example Time Shift",
  version: "0.1.0",
  description: "Shifts selected lyric lines",
  author: "Example Team",
  homepage: "https://example.com/amll-time-shift",
  license: "MIT",
  apiVersion: 0,
  runtime: "builtin", // 第三方不可信代码使用 extism-wasm
  entry: "example.time-shift",
  capabilities: ["lyrics.core", "ui.notify"],
  contributes: {
    commands: [
      {
        id: "dev.example.time-shift.shift",
        title: "Shift lyrics",
        category: "Editing",
        enablement: "hasSelection && mode == 'edit'",
        defaultKeys: ["Control", "Alt", "KeyT"],
      },
    ],
    menus: [
      {
        command: "dev.example.time-shift.shift",
        menu: "menu.tool",
        group: "timing",
        order: 20,
      },
    ],
  },
};

const parsed = parseManifest(manifest);
if (!parsed.ok) throw new Error(parsed.error.message);
```

字段规则：

- `id` 使用反向域名格式，例如 `dev.example.time-shift`。
- `version` 使用 semver；`homepage` 只能是 `https://`。
- `entry` 对 `builtin` 是应用内部标识，不是任意文件路径；WASM 才使用包内相对路径。
- command/settings 的 ID 必须以 `${manifest.id}.` 开头。
- `extensions` 是宿主保留的命名空间数据；宿主不把它当作内部对象的无约束覆盖入口。

### 3.3 主题 manifest

```ts
const theme = {
  kind: "theme",
  id: "dev.example.high-contrast",
  name: "High Contrast",
  version: "0.1.0",
  themeApiVersion: 0,
  runtime: "none",
  appearance: "both",
  tokens: "theme/tokens.json",
  styles: ["theme/styles.css"],
} satisfies ThemePluginManifest;
```

主题包不能同时声明功能 capability。主题 token 是声明式数据，禁止 `url()`、远程引用、`expression()` 和任意代码执行；损坏 token 必须让宿主回退到默认主题。

## 4. 最小功能插件示例

宿主 runtime 会把 JSON RPC 传输实现为 `call()`。下面的 guest 逻辑只依赖协议类型，可用于 builtin 适配器或 WASM PDK 的上层业务：

```ts
import type {
  HostCallV0,
  HostResponseV0,
  PluginDocumentV0,
} from "@amll-ttml-tool/plugin-api";

type HostCall = (call: HostCallV0) => Promise<HostResponseV0>;

export async function shiftFirstLine(callHost: HostCall): Promise<void> {
  const read: HostCallV0 = {
    id: "read-1",
    method: "lyrics.getDocument",
    params: {},
  };
  const response = await callHost(read);
  if (!response.result.ok) throw new Error(response.result.error.message);

  const document = response.result.value as unknown as PluginDocumentV0;
  const line = document.lines[0];
  if (!line) return;

  const edit: HostCallV0 = {
    id: "edit-1",
    method: "lyrics.applyEdit",
    params: {
      expectedRevision: document.revision,
      label: "Shift first lyric line",
      ops: [
        {
          op: "updateLine",
          lineId: line.id,
          patch: {
            startTime: line.startTime + 100,
            endTime: line.endTime + 100,
          },
        },
      ],
    },
  };
  const editResponse = await callHost(edit);
  if (!editResponse.result.ok) {
    // revision-conflict 必须重新读取文档后决定是否重试，不能静默覆盖。
    throw new Error(editResponse.result.error.message);
  }
}
```

一个调用可以包含多个 `ops`，宿主应将其作为一次事务和一次撤销记录处理。行和单词只能用稳定 ID 定位，不能把数组索引写进协议。

## 5. 文档和编辑 API

### 5.1 `PluginDocumentV0`

```ts
interface PluginDocumentV0 {
  revision: number;
  lines: PluginLineV0[];
  metadata: PluginMetadataEntryV0[];
  extensions?: Record<string, JsonValue>;
}
```

`PluginLineV0` 字段：`id`、`words`、`translation`、`romanization`、`isBackground`、`isDuet`、`startTime`、`endTime`、`ignoreSync`。

`PluginWordV0` 字段：`id`、`text`、`startTime`、`endTime`、`emptyBeat`、`romanText`、可选 `ruby`。

`PluginRubySegmentV0` 字段：`text`、`startTime`、`endTime`。没有 `lyrics.ruby` 时，宿主不得暴露 ruby 数据。

### 5.2 `DocumentOpV0`

支持的操作：

| 操作 | 作用 |
| --- | --- |
| `updateLine` | 按 `lineId` 更新行字段 |
| `updateWord` | 按 `wordId` 更新单词字段 |
| `insertLine` | 在 `afterLineId` 后插入，不填表示头部 |
| `removeLine` | 删除行 |
| `moveLine` | 移动行 |
| `insertWord` | 在指定行的 `afterWordId` 后插入 |
| `removeWord` | 删除单词 |
| `setMetadata` | 原子替换公开 metadata |
| `replaceDocument` | 原子替换公开行和 metadata |

`LyricsApplyEditParams` 必须包含：

```ts
{
  expectedRevision: number; // -1 仅供宿主同步命令使用
  label: string;             // 撤销历史标题
  ops: DocumentOpV0[];
}
```

插件写入的 `source` 和 `pluginId` 由宿主 runtime 注入，不由 guest 伪造。revision 不匹配返回 `revision-conflict`；失败时文档不得部分提交。

## 6. 宿主调用、错误和生命周期

宿主方法与 capability：

| Method | Capability | 返回 |
| --- | --- | --- |
| `lyrics.getDocument` | `lyrics.core` | `PluginDocumentV0` |
| `lyrics.getSelection` | `lyrics.core` | `PluginSelectionV0` |
| `lyrics.applyEdit` | `lyrics.core`，含 ruby 时再加 `lyrics.ruby` | `ApplyEditResult` |
| `ui.notify` | `ui.notify` | `{}` |
| `ui.showForm` | `ui.form` | `FormResultV0` |
| `storage.get/set/delete/keys` | `storage.kv` | 隔离 KV 结果 |

错误使用 `HostResult<T>`：

```ts
type PluginErrorCode =
  | "revision-conflict" | "permission-denied" | "invalid-params"
  | "not-found" | "unsupported-api-version" | "timeout"
  | "cancelled" | "payload-too-large" | "plugin-crashed" | "internal";
```

guest 生命周期导出名由 `PLUGIN_EXPORTS` 固定：`plugin_activate`、`plugin_deactivate`，可选 `plugin_execute_command`、`plugin_handle_event` 和 `plugin_resume_form`。激活参数包括 `pluginId`、`apiVersion`、已授予 capability、locale 和 hostVersion。

文档事件使用 `changedLineIds`/`changedWordIds`；插件自身发起的同源事件不会回灌给自己，避免循环。

## 7. 表单、通知、存储和主题

- 表单控件支持 `text`、`number`、`boolean`、`select`、`radio`、`note` 和递归 `group`。
  `number.control: "stepper"` 可渲染宿主步进按钮，`radio.orientation` 控制横/纵排列，option 可声明
  `disabled`；`visibleWhen` 只能按另一个表单字段的等值条件显示，不能执行表达式。`group` 可声明
  row/column、对齐、间距和缩进，字段可使用隐藏标签、紧凑宽度和小号控件。字段 `key` 与 group `id`
  在整个 schema 中分别唯一，group 最大嵌套 4 层。
- `FormSchemaV0.size` 只允许 `small`、`medium`、`large` 三档宿主尺寸。所有布局属性都映射到宿主组件；
  表单标题、字段/分组标签、提示、select/radio option 和提交/取消按钮可通过 `FormIconV0` 引用
  `@fluentui/react-icons` 白名单；stepper 还可覆盖 `decrementIcon`/`incrementIcon`。引用格式固定为
  `{ source: "@fluentui/react-icons", name: "InfoRegular" }`，可用名称由
  `FORM_FLUENT_ICON_NAMES_V0` 导出。宿主只渲染预编译映射，插件仍不能提供任意 SVG、URL、CSS、HTML、
  React 组件或事件回调。
- 页脚按钮不限于取消/应用：`FormSchemaV0.actions` 可声明 1~4 个自定义动作（如"删除"、"添加"、
  "确认"），每个动作有唯一 `id`、`label`、可选白名单 `icon`，`role`（`submit` 受校验门控并返回
  values，`cancel` 直接关闭）和 `tone`（`primary`/`danger`/`neutral` 映射宿主按钮样式）。点击后
  `FormResultV0.action` 携带被点击的动作 id；ESC/关闭仍返回 `{ submitted: false }`。声明 `actions`
  后默认页脚与 `submitLabel`/`cancelLabel` 等旧字段被整体替换。
- 通知是纯文本，不能传 HTML；`timeoutMs` 最大 60000。
- KV 值必须是 JSON，按插件隔离；不要把 token、文件路径或宿主对象写入存储。
- 主题 token 的 `tokenVersion` 必须为 0。颜色和长度按白名单校验，禁止远程资源和代码。

## 8. 测试和发布前检查

至少覆盖：manifest 解析、capability 拒绝、无效 RPC、revision 冲突、一次多 op 的原子性、撤销、权限不足、超时/取消和主题恶意值。

仓库提供通用合同测试：

```ts
import { runHostContractTests } from "@amll-ttml-tool/plugin-api/testing";

runHostContractTests(() => createYourHost());
```

发布前运行：

```sh
pnpm plugin:api:check
pnpm test
pnpm lint:boundaries
```

不要提交生成的 `dist`、宿主私有字段或未经 capability 协商的扩展行为。协议发生破坏性变化时，先更新版本常量、Schema、合同测试和本手册，再实现 runtime。

## 9. WASM 运行时（extism-wasm）调用约定

WASM 插件在独立 Worker 中通过 Extism 执行（`runInWorker: false`，不依赖 SharedArrayBuffer）。
WASM 执行是同步的，宿主不能在执行途中等待用户输入或主线程数据，因此 v0 采用**回合制**模型：

- 每次 guest 调用（activate / executeCommand / handleEvent / resumeForm）是一个"回合"。
  宿主在回合开始时快照：文档投影（`lyrics.core`）、选区、隔离 KV 命名空间（`storage.kv`）。
- guest 通过唯一的同步宿主函数 `amll_host_call`（导入模块 `extism:host/user`，常量
  `WASM_HOST_MODULE`/`WASM_HOST_CALL_FUNCTION`）发起 `HostCallV0` JSON，得到 `HostResponseV0` JSON。
  每次调用都按已授予 capability 逐项校验。
- `lyrics.getDocument`/`lyrics.getSelection`/`storage.*` 在 Worker 内对回合快照同步解析；
  `lyrics.applyEdit` 与 `ui.notify` 进入回合效果队列。**回合内所有 applyEdit 会在回合结束后
  由主线程合并为一个文档事务**：一次插件操作只产生一条撤销记录，且以回合开始时的 revision 做
  冲突检测——若用户在回合期间修改了文档，整批编辑被拒绝并通知。
- applyEdit 内插入行/词得到的 id 在回合内立即可引用（种子化确定性分配，提交时保持一致）。
- `ui.showForm` **不能**作为同步宿主调用使用。需要表单时，从 `plugin_execute_command` 返回
  `PluginCommandOutcomeV0`：`{ kind: "showForm", schema, state? }`。宿主渲染表单后调用
  `plugin_resume_form`，参数为 `{ commandId, state, result: FormResultV0 }`；guest 可以继续返回
  `showForm`（同一次命令最多 `FORM_ROUNDS_PER_INVOCATION_LIMIT_V0 = 8` 轮）或
  `{ kind: "done", value? }` 结束。
- guest 导出的返回值一律是 `PluginReturnV0`（`{ ok, value | error }`）；executeCommand /
  resumeForm 的 `value` 是 `PluginCommandOutcomeV0`。

回合资源限制（`DEFAULT_WASM_TURN_LIMITS`）：每回合宿主调用 ≤128、单次调用 payload ≤1MB、
通知 ≤16、applyEdit 批次 ≤16、存储键 ≤128、单值 ≤32KB、命名空间 ≤1MB。默认回合超时 10s，
超时或崩溃会终止 Worker（下次调用自动重载模块）；连续 3 次失败自动禁用插件。WASM 无法访问
DOM、网络（Extism `allowedHosts` 为空）、文件系统和 Tauri。

分发格式为 `FunctionPluginPackageV0`（JSON）：`{ packageVersion: 0, manifest, wasm: <base64> }`，
经 `parseFunctionPluginPackage` 单一信任入口校验后，由宿主弹出能力授权确认再安装。开发模式
（插件管理页，需支持 File System Access API）可从本地目录（`manifest.json` + 入口 wasm）加载并
热重载，不持久化。

参考实现：`examples/plugins/sample-tools`（Rust + extism-pdk），演示命令、表单续体、
单事务编辑、通知与隔离存储；对应的 Node 合同测试见 `src/plugins/runtime/wasm-session.test.ts`。
