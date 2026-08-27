# Sample Tools（官方示例 WASM 插件）

演示 v0 WASM 插件宿主的完整能力面：

- 生命周期导出：`plugin_activate` / `plugin_deactivate` / `plugin_handle_event`
- 同步宿主桥 `amll_host_call`（模块 `extism:host/user`）：文档读取、单事务编辑、通知、隔离 KV
- `showForm` 命令 outcome + `plugin_resume_form` 续体（WASM 无法在执行中等待用户输入）

命令：

- `example.sample-tools.trimWords`：去除全部单词首尾空格，一次 applyEdit（单条撤销记录），
  记录 `lastTrimCount` 到隔离存储并发送通知。
- `example.sample-tools.wordCount`：先返回 showForm outcome（选择统计范围），提交后在
  `plugin_resume_form` 中统计行/词/字符数。

构建（需要 Rust 工具链和 `wasm32-unknown-unknown` target）：

```sh
pnpm plugin:build:sample
```

产物：`public/plugins/sample-tools.wasm`（与 `sample-tools.manifest.json` 一同作为
Node 测试 fixture 和插件管理页"安装示例插件"的来源）。
