# 插件运行时验证

状态：当前可重复验证清单

最后核对：2026-09-21

本文验证已经投入使用的 WASM runtime，不再作为 PoC 阶段计划。自动化覆盖协议和生命周期，人工检查用于确认浏览器、WebView、Worker、WASI 与内存行为。

## 1. 准备

```sh
pnpm install
pnpm dev
```

仓库已包含诊断所需的预构建样例。需要从源码重建 Rust 与 C# echo 样例时，另行执行 `pnpm plugin:build:pdk`；该命令要求 Rust `wasm32-unknown-unknown` target、.NET 8、`wasi-experimental` workload，并通过 `WASI_SDK_PATH` 指向 x86_64 WASI SDK。缺少任一工具链时应直接使用预构建样例。

打开开发服务器的 `/?plugin-runtime=1` 进入“插件运行时诊断”。诊断页可加载：

- `echo.wasm`：无 PDK 的最小模块
- `rust-pdk-echo.wasm`：Rust Extism PDK
- `csharp-pdk-echo.wasm`：C# WASI
- 本地 `.wasm` 文件

WASI 模式可以自动检测、强制关闭或强制启用。当前 runtime 使用外层 Worker，Extism 配置 `runInWorker: false`，不要求 `SharedArrayBuffer` 或 `crossOriginIsolated`。

## 2. 自动化验证

```sh
pnpm vitest run tests/plugins/runtime
pnpm vitest run tests/plugins/adapters/wasm-plugin-service.test.ts
pnpm vitest run tests/plugins/adapters/host-contract.test.ts
pnpm vitest run tests/plugins/adapters/format-commands.test.ts
pnpm lint:boundaries
```

这些测试应覆盖：Worker 请求关联、加载/调用超时、终止恢复、WASI 检测、payload 限制、串行回合、能力拒绝、表单续体、事务合并、revision 冲突、KV 提交、格式转换和崩溃状态。

确认 Extism 没有越过 runtime 边界：

```sh
rg -n "@extism/extism|createPlugin" src -g "*.ts" -g "*.tsx" -g "!src/plugins/runtime/**"
```

期望无输出。

## 3. 诊断页检查

对无 WASI 与 WASI 样例分别执行：

| 操作 | 预期 |
| --- | --- |
| JSON roundtrip | 输出与输入一致，并记录 load/call metric |
| 超时/终止 | 500 ms 左右终止调用，UI 不冻结 |
| 终止后再次调用 | runtime 自动重新加载已保存模块并成功 |
| 插件崩溃 | 返回 `plugin-crashed` 或对应 runtime 错误，宿主保持可用 |
| 8 MiB payload | 在进入 guest 前以 `payload-too-large` 拒绝 |
| 重复加载 20 次 | 全部完成，旧 Worker 被释放 |
| 空调用 1000 次 | 完成并输出 p50、p95、平均与最大值 |
| 1 MiB JSON 往返 | 内容一致，输出耗时与字节数 |
| 10 Runtime 内存 | 支持 `performance.memory` 时输出近似 JS heap 增量 |

性能数值是环境记录，不设跨设备固定阈值。回归判断应使用同一浏览器/WebView、同一构建模式和相同硬件比较。`performance.memory` 不包含 Worker 原生内存，不可用时记录为“不支持”。

## 4. 业务插件检查

在设置 → 插件安装官方 `sample-tools`，验证：

1. 安装前出现 capability 授权，拒绝后不持久化或激活。
2. 接受后命令和菜单出现，声明式表单可多轮提交。
3. 一次命令中的多批编辑只产生一个撤销记录。
4. 表单打开期间修改文档，续体提交以 revision conflict 拒绝。
5. KV 在成功回合后保留；超时、trap 或取消的回合不提交暂存值。
6. 禁用后贡献点消失，再启用后恢复。
7. 连续制造 3 次崩溃类失败后状态变为 `crash-disabled`，手动重试可清零。
8. 卸载后 runtime、贡献点、包、授权状态和插件 KV 被清理。

格式插件还需验证导入/导出只做文本与公开文档投影转换；文件选择、dirty 确认、项目名和最终导入事务由宿主负责，conversion turn 不能直接调用 `lyrics.applyEdit`。

## 5. 平台矩阵

至少在以下环境各跑一次诊断页与 sample-tools 主流程：

| 平台 | 关注点 |
| --- | --- |
| Chromium Web | Worker、IndexedDB、File System Access API、PWA 缓存 |
| Firefox/Safari Web | Worker/Extism 兼容性；开发目录入口可能不可用 |
| Tauri Windows | WebView2、WASI、挂起/恢复、窗口关闭清理 |
| Tauri macOS | WKWebView、WASI 与模块加载 |
| Tauri Linux | WebKitGTK、WASI 与包安装 |

记录应用提交、构建模式、OS/WebView 版本、样例 SHA-256、每项结果和错误日志。某个平台未验证时应明确写为“未验证”，不能从浏览器测试推断桌面端结论。

## 6. 通过标准

- 崩溃、超时、超限和无效返回都不能冻结或破坏编辑器。
- Worker 终止、禁用和卸载后不再接收调用，资源可释放。
- capability、事务、KV 与表单续体行为与协议合同一致。
- WASM 没有 DOM、网络、文件、Tauri 或凭据访问路径。
- 自动化测试通过，并完成目标发布平台的人工冒烟。
