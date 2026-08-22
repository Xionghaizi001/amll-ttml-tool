# Extism C# PDK 示例插件

这个插件使用官方 `Extism.Pdk` NuGet 包和 .NET WASI workload，不直接调用 Extism ABI。

- 导出：`echo_json`
- 输入/输出：UTF-8 JSON 字符串
- 构建目标：`wasi-wasm`
- 前置条件：`.NET 8 SDK`、`wasi-experimental` workload、x86_64 Windows WASI SDK

安装 workload：

```powershell
dotnet workload install wasi-experimental
$env:WASI_SDK_PATH = "C:\path\to\wasi-sdk-24.0-x86_64-windows"
```

项目内的 `global.json` 将 SDK 固定为 8.0.422；.NET 9 的 `wasi-experimental` 不兼容此构建流程。

在仓库根目录运行 `pnpm plugin:build:pdk`，产物写入 `public/plugins/csharp-pdk-echo.wasm`。
