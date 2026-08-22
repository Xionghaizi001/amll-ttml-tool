# 阶段 1：插件运行时 PoC 与验收清单

对应 `goal.md` 阶段 1。目的：**在大规模重构之前**确认 Extism 能覆盖目标平台，否则更换运行时方案。

## 为什么这份清单必须由人在真机上跑一遍

Extism 的浏览器 SDK 依赖 `WebAssembly` + `SharedArrayBuffer`（可选）+ Worker。
不同目标的 WebView 内核不同：

| 目标                 | WebView 内核        | 风险                                        |
| -------------------- | ------------------- | ------------------------------------------- |
| 浏览器（Chromium）   | Blink               | 低                                          |
| Tauri Windows        | WebView2 (Blink)    | 低，但 COOP/COEP 头由自定义协议提供         |
| Tauri macOS / Linux  | WKWebView / WebKitGTK | **高**：WASM 特性支持与内存上限差异最大   |

CI 与本仓库的自动化测试都跑在 Node 上，**测不出 WebKit 的问题**。因此本文件是一份需要人工执行
并回填结果的清单。

## 如何跑

1. `pnpm dev`，在应用中打开插件运行时诊断页（仅 `import.meta.env.DEV` 可见）。
2. 拖入一个 Extism 插件 `.wasm`（示例插件见 `examples/plugins/`，用 `pnpm plugin:build:example` 构建，
   需要 Rust 工具链 + `wasm32-unknown-unknown` target）。
3. 依次执行下方每一项，把结果回填进表格。
4. 在 Tauri 上重复：`pnpm tauri dev`（Windows / macOS / Linux 各一次）。

## 验收项

| #   | 检查项                                        | 通过标准                                       |
| --- | --------------------------------------------- | ---------------------------------------------- |
| 1   | 最小插件：接收 JSON，返回 JSON                | 往返数据一致                                   |
| 2   | 浏览器 Worker 中加载                          | 主线程无阻塞（长任务 < 50 ms）                 |
| 3   | Tauri Windows 加载                            | 同上                                           |
| 4   | Tauri WebKit（macOS 与 Linux）加载            | 同上；**这一项失败即触发运行时方案重选**       |
| 5   | 插件终止（`terminate()`）                     | Worker 真的退出，内存回落                      |
| 6   | 调用超时                                      | 到达 `timeoutMs` 返回 `timeout` 且 Worker 被杀 |
| 7   | 重复加载同一插件 20 次                        | 无句柄泄漏，内存回到基线 ±10%                  |
| 8   | 大 payload（1 MiB / 8 MiB 文档）              | 要么成功，要么干净地返回 `payload-too-large`   |
| 9   | 插件主动崩溃（unreachable / panic）           | 宿主收到 `plugin-crashed`，编辑器不受影响      |
| 10  | 语言 PDK：Rust                                | 能构建并通过第 1 项                            |
| 11  | 语言 PDK：低门槛语言（JS via Extism JS PDK）  | 能构建并通过第 1 项                            |
| 12  | Extism 未泄漏到业务模块                       | 见下方 grep 断言                               |

### 第 12 项的自动化断言

```bash
# 只允许 src/plugins/runtime/** 出现 extism
grep -rl "extism" src --include=*.ts --include=*.tsx | grep -v "^src/plugins/runtime/"
# 期望输出为空
```
这条断言已写进单元测试（`src/plugins/runtime/*.test.ts`），CI 会守住。

## 性能记录模板

在每个平台上记录，作为后续回归基线：

| 指标                          | 浏览器 | Tauri Win | Tauri macOS | Tauri Linux |
| ----------------------------- | ------ | --------- | ----------- | ----------- |
| 冷启动（首次 load 到 ready）  |        |           |             |             |
| 热启动（第 2 次 load）        |        |           |             |             |
| 空调用往返延迟（p50 / p95）   |        |           |             |             |
| 1 MiB 文档序列化 + 往返       |        |           |             |             |
| 插件包体（wasm 大小）         |        |           |             |             |
| 常驻内存增量（每插件）        |        |           |             |             |

## 若第 4 项失败的备选方案

按优先级：

1. **仅 Worker + JS 沙箱**：放弃 WASM，改用 Worker 内的受限 JS（丢失多语言支持，且需要更严格的
   能力裁剪）。
2. **wasmtime/wasmer 侧车进程**：Tauri 端用 Rust 侧车跑 WASM，Web 端降级为不支持功能插件。
3. **仅 Tauri 支持功能插件**：Web 版只支持主题插件。

无论选哪个，改动都应当被 `PluginRuntime` 接口挡住，只影响 `src/plugins/runtime/`。
