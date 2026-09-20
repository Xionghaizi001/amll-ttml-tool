# 本地插件与外置模板验收（2026-09-20）

已验证路径：

| 范围 | 验证 |
| --- | --- |
| 宿主 | TypeScript、边界检查、协议生成文档检查、61 个测试文件 / 356 项测试通过 |
| 本地 JS | consent 前不执行；写盘失败/激活失败不保留新包；内容变化重新授权；损坏记录拒绝恢复；禁用、卸载与 KV 清理 |
| 出厂 artifact | time-shift 1.1.0，SHA-256 `62266aa75fc15aaad1c291bd68255a236ab4b552d718351a477686e4cc018398`；独立 pack 重复产出同一 ZIP；宿主校验 lock 后生成静态模块/catalog |
| time-shift | 独立仓库 9 项 SDK/协议测试；宿主对 ZIP 的命令 → 表单 → 单事务 → 撤销与并发编辑合同通过 |
| toolkit | ZIP 顺序/时间戳、主题 schema、静态服务原字节、路径逃逸拒绝、开发 mock 验证通过；JS 与 WASM 脚手架分别通过 5 项测试，主题通过 1 项 |
| Chrome 开发/生产预览 | 本地 ZIP → consent → 菜单命令 → 禁用/刷新 → 启用/刷新 → 卸载/刷新通过 |
| Chrome 生产预览补测 | 生成 WASM ZIP 授权安装成功；锁定出厂 time-shift 菜单打开表单成功 |

复跑：宿主先 `pnpm build`、`pnpm preview --host 127.0.0.1 --port 4173`，在 toolkit 仓库执行 `tests/chrome-smoke.mjs`，设置 `HOST_URL=http://127.0.0.1:4173/` 和本机 `CHROME_PATH`。可选 `WASM_ARTIFACT` 指向生成的 WASM ZIP。

截图由夹具保存在 toolkit 的 `node_modules/.cache/chrome-smoke/`，不提交缓存。Chrome 使用独立测试 profile；Windows 本次使用真实安装的 Google Chrome，非模拟 DOM。

未宣称完成：桌面原生 WebView、跨操作系统 ZIP 可复现性、远端 SDK/toolkit Release 与插件静态商店部署。两个新仓库只在本地初始化，workflow 已提供；宿主当前使用入库的 artifact 镜像，可切换为正式 HTTPS 源。

生产构建通过，仍有既有大 chunk、WASM glue 的 browser external 与重复动态 import 提示。
