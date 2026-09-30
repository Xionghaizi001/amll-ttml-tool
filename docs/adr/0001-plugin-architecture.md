# ADR 0001：插件架构与信任边界

状态：Accepted，按当前实现重写

日期：2026-09-21

协议状态：experimental v0

## 背景

AMLL TTML Tool 同时需要安全运行第三方歌词处理逻辑、承载需要 React/浏览器能力的第一方或受信代码，并允许用户定制视觉。三类需求的信任程度和生命周期不同，不能用一个不透明“插件”加载器处理。

## 决策

### 1. 内核保留实时核心

歌词文档、事务/revision、撤销重做、时间轴、打轴交互、预览渲染、频谱/波形、音频解码与播放属于宿主核心。插件通过公开端口使用这些能力，不能直接持有内部 atom、`TTMLLyric` 或平台对象。

所有文档写入最终进入 `EditorDocumentService` 的事务路径。插件只看到 `PluginDocumentV0` 投影，并使用稳定行/词 ID 提交 `DocumentOpV0[]`。

### 2. 类型、运行档、来源和交付方式相互独立

- 类型：`function` 或 `theme`。
- 运行档：`builtin`、`extism-wasm`、`trusted-js`；主题固定为 `none`。
- 来源：user、dev、store、sample、builtin/factory 等运行档特定来源。
- 交付：factory bundle、catalog artifact、裸 ESM、本地 ZIP/JSON 或开发目录。

不能用单个枚举混合这些维度。尤其 factory 是交付/来源策略，trusted-js 是执行方式；builtin 是宿主核心运行档，不等于 factory。

### 3. extism-wasm 是不可信代码档

每个插件在独立 Worker 中使用 Extism。宿主只暴露同步 `amll_host_call`，按 capability 校验每次调用，并实施超时、payload/调用次数配额、串行回合和崩溃禁用。

WASM 不获得 DOM、网络、文件系统、Tauri、凭据、音频 PCM 或频谱数据。WASI 仅用于兼容需要 `wasi_snapshot_preview1` import 的模块，宿主不提供预打开目录或 socket。

### 4. trusted-js 是全权准入档

trusted-js 已对 factory、本地包、开发目录和同源商店路径开放。它在应用 JS 上下文执行，不是沙箱。加载前必须完成 API/来源检查、桌面总开关、禁用/崩溃 gate 和内容 consent；factory 与明确 `firstParty` 的同信任根内容可跳过用户 consent。

`TrustedJsHostV0` 负责稳定 API、命名空间、取消和资源回收，但不能阻止插件直接使用浏览器能力。因此安全说明必须把 trusted-js 当作安装应用代码，而不是“权限受限脚本”。

### 5. 主题是无代码声明包

主题只能包含 manifest、token、受限 CSS 和内联资源。所有值在注入前校验；远程 URL、任意代码和越界选择器被拒绝。权限、插件管理、consent 与错误恢复 UI 是受保护区域，主题不能覆盖。

主题与功能包互斥；同时提供功能和视觉时发布两个包。

### 6. 资源按 owner scope 管理

每个运行实例拥有 `ExtensionScope`。命令、菜单、设置页、标题栏操作、格式、模式、视图与事件订阅都登记 owner，并返回 disposable。停用/崩溃/卸载会释放整个 scope，避免遗留贡献点。

禁用保留安装数据与 KV；卸载还删除 package、授权/consent、状态和该插件 KV。

### 7. 安装与加载只有受控信任链

ZIP/JSON 来源复用：容器识别 → 安全解包 → package parser → 授权/consent → 持久化 → 加载。ZIP 解包必须限制大小、数量与路径；商店 artifact 还校验同源 entry、可选 SHA-256 和 catalog/package 身份。catalog 中的 trusted-js 裸 ESM 不经过容器，但必须通过 catalog parser、同源解析和统一加载闸门。

SHA-256 用于内容寻址、完整性和 consent key，不代表发布者身份或代码安全。

### 8. factory 副本保证离线与回退

随应用交付的外置功能使用 lock 固定 id、version、SHA-256 和 artifact。更高 semver 的安装/远程版本可遮蔽 factory；更新卸载或加载失败时可以 pin/回退 factory，不能让更新失败移除应用基线功能。

## 后果

- 不可信功能需要适配 JSON/回合协议，不能获得任意 UI。
- 需要 React/模式/浏览器能力的插件必须接受 trusted-js 的全权风险提示。
- 三套运行档目前有不同的持久化和状态服务；UI 需要聚合它们，未来可引入统一 installation 模型。
- Web/Tauri 的真实隔离仍依赖浏览器、WebView、Extism 与 Tauri 配置，发布前需要跨平台验证。

实现全景和剩余风险见仓库根目录 `PLUGIN.md`。
