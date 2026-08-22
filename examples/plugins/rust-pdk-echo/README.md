# Extism Rust PDK 示例插件

这个插件使用官方 `extism-pdk` crate，不直接调用 Extism ABI。

- 导出：`echo_json`
- 输入/输出：UTF-8 JSON 字符串
- 构建目标：`wasm32-unknown-unknown`

在仓库根目录运行 `pnpm plugin:build:pdk`，产物写入 `public/plugins/rust-pdk-echo.wasm`。
