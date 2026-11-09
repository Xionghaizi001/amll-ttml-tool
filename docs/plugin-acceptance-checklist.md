
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


### 网络服务基础设施（2026-11-09）

自动合同覆盖：离线拒绝/恢复、请求前与在途取消、无视 signal 的传输超时、响应读取超时/挂起取消、响应头提示与分块实际字节限额、二进制/FormData/进度、HTTP 非 2xx 保留、匿名默认策略、插件拒绝宿主专用选项、诊断脱敏与写请求不重试。SDK/API 合同不变。

LRCLIB 已迁出；其余业务调用者、认证业务端口与真实服务/CORS/桌面 WebView 验收继续单独推进，不以 Node 合同测试代替。

网络可选重试合同：参数省略仍单次请求；GET 显式 retries 的次数上限、指数退避、等待期间取消/离线/总超时；Range/If-Range 请求及 206 版本/偏移/总长度检查；缺少强 ETag 或压缩内容改为完整重试；200 覆盖旧片段；拒绝写请求及调用者 Range 重试。实际跨域 Range/CORS 与远端服务器行为仍待业务接入验收。


### LRCLIB（2026-11-09）

子包算法测试覆盖 LRC 多时间戳、翻译/音译、纯文本、背景人声、API 校验、离线/HTTP 失败、导入确认/撤销与分词取消；宿主合同覆盖锁定 ZIP 摘要、真实视图/命令/菜单注册与清理、离线拒绝及重新激活，导入流程测试覆盖异步项目查找期间取消。

浏览器复现：`node tests/plugins/browser/lrclib.browser-check.mjs http://127.0.0.1:5191/`，使用隔离 Chrome 和受控 LRCLIB 响应；覆盖搜索/预览、取消/确认导入、背景人声/翻译/音译、元数据文件名、一次撤销、离线恢复、确认期间禁用、跨刷新禁用保持及恢复入口。截图 `release/lrclib-browser.png` 不入库。同日真实 Chrome 经共享网络端口请求 LRCLIB 搜索返回 HTTP 200、20 条结果；这不保证远端持续可用。桌面原生 WebView/CORS 与生产包运行仍待平台验收。

### GitHub 外置插件

- 自动测试：PAT 验证后保存、错误不覆盖旧账号、身份结果不含敏感字段、存储错误传播；固定 GitHub origin、POST 请求预算、离线、退出/卸载取消；真实 registry 跨插件调用及停用清理；插件设置注册与 PNG 内嵌打包。
- 手动待验收：新版宿主安装 ZIP，在插件管理器打开 GitHub 设置，真实 PAT 登录/重启恢复/退出；用受控仓库验证 POST、401/403 与网络失败；桌面 WebView 尚未验证。
