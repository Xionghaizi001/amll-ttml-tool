# AMLL TTML Tool 插件架构与协议

状态：experimental v0

本文档记录插件系统的架构边界、信任模型和公开协议入口。v0 允许破坏性变更；在上游版与定制版
共同通过协议契约测试之前，不承诺 v1 兼容性。

## 开发基线

阶段 0 从上游 `main` 的干净提交创建 `feat-plugin` 功能分支。当前基线提交与 `main` 一致，插件架构
改动集中在本分支；定制版的未跟踪目录和业务改动不纳入本阶段提交。后续阶段继续保持内核、公开协议、
运行时和定制版适配分离，以便按提交批次移植。

## 架构边界

内核永久保留产品的实时核心能力：

- 歌词文档模型、事务、revision、撤销和重做
- 时间轴与打轴交互
- AMLL 歌词预览与渲染
- 频谱图和波形
- 音频解码、播放和渲染

插件只能通过公开宿主能力访问文档和 UI。插件不得直接依赖 React、Jotai、Tauri、内部 `TTMLLyric`、
DOM、网络、文件系统、音频 PCM 或频谱数据。

目标目录边界如下：

```text
packages/plugin-api/  公共协议与类型，不依赖宿主实现
src/kernel/           文档事务、命令、贡献点、平台能力、主题
src/plugins/runtime/  Worker、Extism、权限、隔离和生命周期
src/plugins/builtin/  官方受信任 TypeScript/React 插件
src/plugins/adapters/ 上游版与定制版的宿主适配
src/plugins/ui/       插件管理、菜单、表单等宿主 UI
```

## 插件类型与信任边界

插件包通过 `kind` 判别，只能选择一种类型：

| 类型 | runtime | 信任级别 | MVP |
| --- | --- | --- | --- |
| 功能插件 | `builtin` | 随应用发布的受信任代码 | 支持 |
| 功能插件 | `extism-wasm` | 独立 Worker 中的不受信任 WASM | 支持 |
| 主题插件 | `none` | 声明式 token 与受限 CSS，不执行代码 | 支持 |

`trusted-js` 只作为未来 manifest 能力保留。MVP 拒绝普通第三方插件使用它；受信任 React view 只能由
`builtin` 插件注册。

主题包与功能包互斥。需要同时提供功能和主题时，发布两个插件包，避免主题权限扩大到文档或平台能力。

## v0 公开协议

协议定义在 `packages/plugin-api`，权威决策记录见：

- [插件开发手册](docs/plugin-development-guide.md)：SDK 字段、最小示例、API 范围和发布检查。
- [Agent 实现指南](docs/plugin-agent-guide.md)：分层边界、协议工作流和自动化交付约束。

- [ADR 0001：插件架构、信任边界与 MVP 范围](docs/adr/0001-plugin-architecture.md)
- [ADR 0002：Plugin 协议 v0 契约草案](docs/adr/0002-protocol-v0-contract.md)
- [ADR 0003：内核命令、Contribution 与宿主能力层](docs/adr/0003-kernel-command-contribution.md)

v0 的首批 capability：

- `lyrics.core`：读取和事务化修改公开歌词文档
- `lyrics.ruby`：读取和修改 ruby 分段
- `ui.notify`：纯文本通知与进度
- `ui.form`：声明式表单
- `storage.kv`：按插件隔离的键值存储

插件看到的是 `PluginDocumentV0` 投影，而不是内部文档对象。行和单词通过稳定 ID 定位；宿主写回时按
ID 合并，并保留投影中不存在的内部字段。插件修改必须携带 `source`、`pluginId`、`label` 和
`expectedRevision`，一次插件操作只产生一个撤销记录；revision 冲突必须拒绝写入。

菜单只引用 command ID，第三方插件只能使用命令、菜单、通知和声明式表单，不能注入任意 HTML、React
组件或 CSS 选择器。插件卸载时，宿主统一清理命令、贡献点、事件监听、运行时和隔离存储句柄。

## MVP 范围与非目标

MVP 的目标是安装一个主题插件和一个 WASM 功能插件。功能插件可以注册菜单、打开声明式表单、修改
歌词并完整撤销；主题可以安全替换视觉 token；插件超时或崩溃不会破坏编辑器；Web 和 Tauri 通过冒烟测试。

MVP 不包含：

- 插件市场、远程安装、自动更新、评分和发现页
- 普通第三方的任意 JS、React、HTML 或 CSS 注入
- 插件直接访问 DOM、网络、文件系统、Tauri、音频和频谱管线
- 在定制版适配和契约测试完成前冻结 v1
- 先于事务层迁移外围功能

## 阶段顺序

先验证 Extism 在浏览器 Worker、Tauri Windows 和 Tauri WebKit 上的可行性，再建立编辑器事务层，随后
实现公开 API、命令与贡献点、首个内置插件、主题系统和 WASM 宿主。Extism 只能出现在
`src/plugins/runtime`；验证清单见 [插件运行时 PoC](docs/plugin-runtime-poc.md)。

协议、内核和运行时应按独立提交移植到定制版。只有上游版和定制版使用同一套契约测试全部通过后，才考虑
发布 v1。
