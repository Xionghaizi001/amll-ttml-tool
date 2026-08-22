# Extism Echo 示例插件

这个插件只依赖 Rust 标准工具链和 `wasm32-unknown-unknown` target，不依赖 Extism PDK，直接使用
Extism ABI 完成最小 JSON bytes roundtrip。导出函数：

- `echo_json`：原样返回输入 bytes
- `hang`：持续执行，用于验证超时会终止 Worker
- `crash`：触发 WASM trap，用于验证插件崩溃不会影响宿主

在仓库根目录运行 `pnpm plugin:build:example`，产物写入 `public/plugins/echo.wasm`。
