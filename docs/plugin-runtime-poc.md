# 阶段 1：插件运行时 PoC 与验收清单

对应 `goal.md` 阶段 1。目的：**在大规模重构之前**确认 Extism 能覆盖目标平台，否则更换运行时方案。

## 为什么这份清单必须由人在真机上跑一遍

宿主把 Extism 放进独立 Worker，并使用 SDK 的 `runInWorker: false` 模式；因此浏览器主线程不执行 WASM，
也不强制依赖 `SharedArrayBuffer`。Extism 自带的二级 Worker 模式仍需要 COOP/COEP，所以本 PoC 不使用它。
当前项目优先验收浏览器和 Tauri Windows：

| 目标                 | WebView 内核        | 风险                                        |
| -------------------- | ------------------- | ------------------------------------------- |
| 浏览器（Chromium）   | Blink               | 低                                          |
| Tauri Windows        | WebView2 (Blink)    | 低，但 COOP/COEP 头由自定义协议提供         |

macOS 与 Linux 暂不作为当前项目的优先支持目标；对应平台用户可以自行执行诊断页，验证本地
WebView 的可用性。CI 与本仓库的自动化测试都跑在 Node 上，因此本文件是一份需要人工执行并回填
结果的清单。

## 如何跑

1. 运行 `pnpm plugin:build:example`，构建 `examples/plugins/echo/` 并生成 `public/plugins/echo.wasm`。
2. 运行 `pnpm dev`，打开 `/?plugin-runtime=1` 进入诊断页（仅 `import.meta.env.DEV` 可见）。
3. 也可以在诊断页拖入其它 Extism `.wasm` 插件；示例插件需要 Rust 工具链和 `wasm32-unknown-unknown` target。
4. 依次执行下方每一项，把结果回填进表格。
5. 在 Tauri Windows 上重复：`pnpm tauri dev`。

### PDK 示例构建

Rust PDK 和 C# PDK 示例可通过以下命令构建：

```powershell
# Rust: extism-pdk 1.4.1；要求 wasm32-unknown-unknown
# C#: .NET 8 SDK、wasi-experimental workload，以及 x86_64 WASI SDK
$env:WASI_SDK_PATH = "C:\path\to\wasi-sdk-24.0-x86_64-windows"
pnpm plugin:build:pdk
```

`WASI_SDK_PATH` 必须指向 x86_64 Windows WASI SDK，不能使用 ARM 版本。构建产物为
`public/plugins/rust-pdk-echo.wasm` 和 `public/plugins/csharp-pdk-echo.wasm`。
诊断页中的“加载 Rust PDK”和“加载 C# PDK（WASI）”按钮会自动加载对应产物；C# 插件需要显式
启用 WASI，普通插件默认不启用 WASI。

诊断页额外提供四个性能/恢复按钮：

- `显式终止`：终止当前 Worker；随后点击 `JSON roundtrip`，应自动重建 Worker 并成功调用。
- `空调用 ×1000`：先预热 10 次，再执行 1000 次空输入 `echo_json`，输出 p50、p95、平均和最大延迟。
- `1 MiB JSON 往返`：生成恰好 1 MiB 的 JSON，测量 JSON 序列化、Worker 往返和解析的总耗时。
- `10 Runtime 内存`：创建 10 个独立 Runtime 并加载插件；若 WebView 提供 `performance.memory`，输出
  JS heap 增量和每插件平均值。该数值不包含 Worker 原生内存，无法替代任务管理器观察。

## 验收项

| #   | 检查项                                        | 通过标准                                       |
| --- | --------------------------------------------- | ---------------------------------------------- |
| 1   | 最小插件：接收 JSON，返回 JSON                | `echo_json` 往返数据一致                       |
| 2   | 浏览器 Worker 中加载                          | `extism.worker` 加载且主线程无阻塞              |
| 3   | Tauri Windows 加载                            | 同上                                           |
| 4   | 插件终止（`terminate()`）                     | Worker 真的退出，内存回落                      |
| 5   | 调用超时                                      | 到达 `timeoutMs` 返回 `timeout` 且 Worker 被杀 |
| 6   | 重复加载同一插件 20 次                        | 无句柄泄漏，内存回到基线 ±10%                  |
| 7   | 大 payload（1 MiB / 8 MiB 文档）              | 超过 1 MiB 干净返回 `payload-too-large`        |
| 8   | 插件主动崩溃（unreachable / panic）           | 宿主收到 `plugin-crashed`，编辑器不受影响      |
| 9   | 语言 PDK：Rust                                | `extism-pdk` 构建并通过 `echo_json`            |
| 10  | 语言 PDK：C#                                   | `Extism.Pdk` + WASI 构建并通过 `echo_json`      |
| 11  | Extism 未泄漏到业务模块                       | `boundary.test.ts` 与 grep 断言均为空           |

### 第 11 项的自动化断言

```bash
# 只允许 src/plugins/runtime/** 出现 extism
grep -rl "extism" src --include=*.ts --include=*.tsx | grep -v "^src/plugins/runtime/"
# 期望输出为空
```
这条断言已写进 `src/plugins/runtime/boundary.test.ts`，CI 会守住。

## 当前自动验证结果

- 已验证：Rust 示例插件编译、Node Extism JSON roundtrip、WASM trap 映射、Worker 协议单测、超时后的
  Worker 终止与重启、payload 上限、重复加载指标、生产构建和 Extism import boundary。
- 需要真机回填：Chromium 页面、Tauri Windows 的启动与内存数据。
- macOS/Linux 不在当前优先验收范围内，平台用户可自行回填可用性数据。
- 已验证：Rust `extism-pdk` 1.4.1 构建和 Node Extism roundtrip；C# `Extism.Pdk` 1.1.1 在
  .NET 8 + `wasi-experimental` + x86_64 WASI SDK 下构建，并通过启用 WASI 的 Node Extism roundtrip。
- C# PDK 产物约 22.6 MiB，明显大于 Rust PDK；其 WASI host imports 中 HTTP 能力在当前宿主中保持关闭。
- JS PDK 尚未加入依赖锁定；如需 JS PDK，先确认目标 PDK 的构建工具与版本，再把生成的 WASM 放入同一诊断页验证。

自动化验证：

```powershell
pnpm test
```

其中包括 Worker 超时/崩溃后的自动恢复、payload 上限、真实 Rust WASM 往返，以及基准辅助函数的
分位数和精确 1 MiB JSON 测试。

## 性能记录模板

在每个平台上记录，作为后续回归基线：

| 指标                          | 浏览器 | Tauri Win |
| ----------------------------- | ------ | --------- |
| 冷启动（首次 load 到 ready）  |load 42.4 ms, input=974 B, output=0 B | load 44.7 ms, input=974 B, output=0 B|
| 热启动（第 2 次 load）        |  load 4.3 ms, input=974 B, output=0 B      |load 10.5 ms, input=974 B, output=0 B|
| 空调用往返延迟（p50 / p95）   |p50=0.11 ms，p95=0.16 ms，avg=0.12 ms，max=3.75 ms|p50=0.14 ms，p95=0.21 ms，avg=0.15 ms，max=3.00 ms|
| 1 MiB 文档序列化 + 往返       |1048576 B，95.86 ms|1048576 B，97.70 ms|
| 插件包体（wasm 大小）（测试包）         |974 bytes|974 bytes|
| 常驻内存增量（每插件）        |JS heap 增量 -3.55 MiB，平均 -0.36 MiB / 插件；不含 Worker 原生内存|JS heap 增量 -2.89 MiB，平均 -0.29 MiB / 插件；不含 Worker 原生内存|

macOS/Linux 的 WASM 与 WebView 兼容性由对应平台用户自行测试；如需在这些平台正式支持，应在目标
平台完成独立验收后再决定是否调整运行时方案。相关改动仍应被 `PluginRuntime` 接口挡住，只影响
`src/plugins/runtime/`。
