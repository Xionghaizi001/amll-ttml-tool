# 插件安装与更新验证

状态：当前可重复验证清单

最后核对：2026-09-21

本文覆盖本地文件、开发目录、同源商店、factory 更新和主题安装。ZIP/JSON 入口应进入同一容器与语义校验链路；catalog 中的 trusted-js 裸 ESM 应进入同源解析与统一加载闸门。

## 1. 自动化检查

```sh
pnpm plugin:catalog:build
pnpm vitest run tests/plugins/store
pnpm vitest run tests/plugins/trusted/installed-trusted-js.test.ts
pnpm vitest run tests/plugins/trusted/factory-artifact.test.ts
pnpm vitest run tests/plugins/adapters/manifest-contributions.test.ts
pnpm vitest run tests/kernel/theme
```

构建后确认 `public/plugins/catalog.json` 通过协议解析，artifact 位于 `public/plugins/store/<sha256>.zip`，且 factory lock 中的 id、version 与 SHA-256 和实际 artifact 一致。

## 2. 本地文件安装

工具 → 插件商店的“导入插件包”接受 ZIP/JSON；设置 → 插件当前只提供 JSON WASM 文件选择器。

分别导入有效的 WASM、trusted-js 和主题包，确认：

- 宿主按内容识别 JSON/ZIP，不依赖扩展名。
- WASM 在持久化前显示 capability 授权；取消后没有安装记录。
- trusted-js 在执行任何代码前显示来源与全权风险；内容 SHA-256 可在管理行查看。
- 主题经过 token、CSS 与资源校验后可预览、应用和卸载。
- 刷新页面后持久化插件恢复；`dev` 来源除外。

恶意/损坏容器至少测试：缺少根 `manifest.json`、路径穿越、反斜杠、重复文件、未声明文件、错误 entry、超大文件、错误 base64、runtime/kind 不匹配和无效 CSS。所有情况都应在执行或注入前拒绝，并显示可理解错误。

## 3. 开发目录

在支持 File System Access API 的浏览器中，从设置 → 插件选择包含 `manifest.json` 与入口 JS/WASM 的目录。

确认首次加载仍经过 parser 和授权/consent；修改 manifest 或入口后约 1.5 秒自动热重载；关闭热重载后只在点击“立即重载”时生效。开发插件仅当前会话有效，不写入安装包存储。Safari/Firefox 或不支持目录选择的 WebView 不显示该入口，这是当前预期行为。

## 4. 同源商店

运行 `pnpm dev` 后打开工具 → 插件商店：

1. catalog 正常加载并按当前平台过滤。
2. artifact 请求只能解析到应用同源；跨源或包含 dot segment 的 entry 被拒绝。
3. 声明 `sha256` 时，篡改任意字节后安装失败。
4. WASM、theme、trusted-js channel 只能安装对应容器类型。
5. trusted-js artifact 的包内 id、version、apiVersion 必须与 catalog 一致。
6. trusted-js 裸 ESM 只允许同源 entry，且在 import 前经过 desktop、consent、禁用与 crash gate。
7. catalog 缺失、离线或无效时商店显示不可用，但编辑器和 factory 插件照常工作。

当前 catalog 是静态、同源、单提供者模型。`sha256` 是内容完整性与寻址，不是发布者签名；catalog 中该字段目前可选。

## 5. trusted-js 与 factory 更新

桌面端先确认“允许加载远程 JS 插件”默认关闭，factory 不受该开关影响。非 factory trusted-js 必须满足开关、consent、禁用和 crash gate。

使用 `builtin.time-shift` 验证：

- 无更新时加载 lock 指定的 factory 副本。
- catalog/已安装版本严格高于 factory 时可遮蔽 factory。
- 新内容摘要触发重新 consent；拒绝后回退 factory，而不是丢失内置功能。
- “卸载更新”删除安装副本并 pin 到 factory；重新选择更新时清除 pin。
- 更新加载失败时回退 factory，并保留可恢复的管理入口。
- 禁用只停止运行并保留包/KV；卸载删除包、consent/授权、状态与 KV。

## 6. 主题恢复

安装并应用一个自定义主题，验证 preview 与 active theme 分离、用户 override 优先、资源 URL 在切换或卸载时撤销。模拟启动期间主题失败，确认 crash marker 触发安全模式并回落默认视觉；权限、插件管理和错误恢复 UI 始终可见且不受主题 CSS 影响。

## 7. 通过标准

- 所有 ZIP/JSON 入口复用容器解包和对应 package parser；裸 ESM 复用统一加载闸门。
- 未授权代码不会执行，未校验 CSS 不会注入。
- 更新失败不会破坏 factory 回退或现有编辑功能。
- 刷新、禁用、启用、重试、卸载后的 UI、运行态和持久化状态一致。
- Web 与目标 Tauri 平台均完成一次真实安装、重启恢复与卸载冒烟。
