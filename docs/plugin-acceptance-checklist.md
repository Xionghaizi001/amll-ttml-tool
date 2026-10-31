
### 节拍器迁移

- 自动化：独立插件窗口计算/生命周期测试；真实宿主 ZIP 摘要、sidebar 渲染与禁用/恢复合同；宿主延迟补偿、参数校验、原始分析重置和订阅清理。
- 实机复核：加载音频后打开节拍器，检查减半/加倍/重置、跟随倍速、键盘与频谱校准、Escape 退出；插件管理器禁用后入口/拍线消失，重新启用恢复偏好，刷新后禁用状态保持。
- Tauri 生产包、macOS/Linux WebView 与真实音频硬件的延迟复核仍待平台验收。

2026-10-26 Chromium 自动化：真实 App 加载锁定出厂插件并渲染原面板；经公开输入桥接校准为 120 BPM，unload 后显示连接清空、模式回到 off，重新加载侧栏恢复且拍线偏好保持，无 pageerror。此项使用程序驱动宿主端口，不替代真实音频硬件与用户按键的延迟实测。

### 大纲迁移（2026-10-27）

自动回归覆盖 factory ZIP 摘要/渲染/贡献卸载与恢复，编号规则，以及真实页面的默认展开、多选、跳转、共享右键动作、排序/复制/撤销、拖拽中卸载清理、禁用跨刷新和旧侧栏配置迁移。
复现：启动独立 Vite 端口后执行 `node tests/plugins/browser/outline.browser-check.mjs http://127.0.0.1:5187/`；依赖同级 toolkit 的 playwright-core 和本机 Chrome，使用全新浏览器上下文。
待实机：Windows 原生 WebView、macOS/Linux 与正式安装包；重点复核触屏/触控板、长列表自动滚动及编辑模式切换。

### 元数据编辑器迁移（2026-10-29）

已通过：插件元数据增删/拖放去重/空槽填充/单事务撤销/失败提示单元测试，真实宿主锁定 ZIP 摘要、渲染、贡献及对话框清理；Chromium 编辑、自定义键、拖放、撤销、卸载恢复、禁用跨刷新及重新启用，无 pageerror。
复现：`node tests/plugins/browser/metadata.browser-check.mjs http://127.0.0.1:5188/`，依赖同级 toolkit 的 playwright-core 与本机 Chrome，使用独立浏览器上下文。布局断言覆盖 920×680、零外层内边距及无障碍标题；截图写入 `release/metadata-editor.png` 与 `release/metadata-editor-original-layout.png`（不入库）。原生 WebView、生产包及 macOS/Linux 留待统一平台验收。

### Ruby 编辑器迁移（2026-10-29）

已通过 Chromium 回归：简洁/高级布局、首次添加提示、增改/退格合并、最后项删除及撤销、按目标时间批量应用、Latin/带标点假名排除、注音分词、禁用保留数据/恢复、禁用跨刷新，以及真实插入输入框的 `|` 快捷输入随插件启停。宿主合同覆盖 ZIP 摘要、内联 view/命令注册清理、内部字段保留、单次撤销、null/[] 区分、分词输入校验与卸载后拒绝异步结果。

复现：`node tests/plugins/browser/ruby.browser-check.mjs http://127.0.0.1:5189/`，依赖同级 toolkit 的 playwright-core 和本机 Chrome，使用全新上下文；截图在 `release/ruby-editor-{advanced,simple}.png`。不修改个人文件。Tauri WebView、macOS/Linux 与正式安装包仍待统一平台验收。
