# ADR 0003：内核命令、Contribution 与宿主能力层

状态：Accepted，按当前实现重写

日期：2026-09-21

## 背景

插件需要把命令、菜单、设置页、标题栏操作、格式、模式与视图接入现有编辑器。直接操作旧 keyboard registry、React 页面或 Jotai 状态会造成生命周期泄漏、ID 冲突和插件对宿主内部结构的依赖。

## 决策

### 1. 内核 registry 与旧键盘配置分工

`src/kernel/commands/CommandRegistry.ts` 是插件与核心命令的统一执行/查询入口，负责 owner、ID、enablement、冲突和释放。`src/modules/keyboard` 继续负责用户快捷键持久化、按键匹配与模式快捷键 UI。

Manifest 的 `defaultKeys` 只是命令默认值，不直接写用户配置。命令可由菜单、标题栏、快捷键或宿主代码调用，执行入口必须相同。

### 2. ContributionRegistry 管理声明式扩展

`src/kernel/extensions/ContributionRegistry.ts` 管理菜单、设置页、标题栏操作及其 owner。注册返回 disposable；相同 ID 或不合法命名空间拒绝注册。UI 从 registry 快照渲染，不让插件直接修改宿主组件树。

格式使用 `FormatProviderRegistry`，主题使用 `ThemeService`，模式/受信视图使用对应宿主 service；它们遵守相同的 owner 生命周期原则。

### 3. ExtensionScope 是资源所有权单位

每次插件加载创建 scope。静态 manifest contribution、动态 SDK 注册与事件监听都进入该 scope。scope 按注册逆序 dispose，插件停用、崩溃或卸载时不需要逐项猜测资源。

trusted-js 的 cleanup 先运行，再释放 host handle 与 scope；WASM 先停止新调用/事件并取消在途回合，再释放贡献点和 Worker。重复 dispose 必须安全。

### 4. Adapter 隔离宿主模型

`src/plugins/adapters` 将公开协议连接到内核与应用服务：

- plugin document adapter 在内部歌词与 `PluginDocumentV0` 间转换。
- host services 提供文档、选择、通知、表单与 KV 端口。
- manifest adapter 注册静态 contribution。
- format/file-flow adapter 保证转换与最终文件导入事务分离。
- enablement context 只暴露稳定键，不暴露 atom。

Adapter 不定义新的公开合同，也不能绕过 parser、事务或权限检查。

### 5. Contribution 分档开放

extism-wasm 通过 manifest 声明 commands、menus、settings、titleBarActions 和 formats；运行时只处理命令、事件、表单续体和格式转换。它不能注入 React/HTML。

trusted-js 除静态声明外可动态注册命令、菜单、标题栏、格式、mode 和 trusted view。view kind 限定为 sidebar、settings-view、dialog-view、titlebar-group；所有 ID 和实际 owner 必须匹配插件命名空间。

主题不注册功能 contribution，只向 ThemeService 提供声明式视觉包。

### 6. Enablement 与 UI 输入失败关闭

`enablement`/`when` 只使用公开上下文和受限语法。解析失败、未知键或类型不匹配时不显示/不启用，不能执行任意代码。

表单、图标、动画、标题栏和菜单均由宿主渲染。第三方数据只能选择白名单枚举、文本和有限布局参数；恢复入口使用 `data-amll-protected`，不受插件主题覆盖。

### 7. 格式插件只负责纯转换

格式 provider 负责文本与公开歌词投影互转。文件选择、dirty 确认、项目身份、文件名推导、保存下载与导入事务由宿主 file flow 负责。WASM conversion turn 禁止 `lyrics.applyEdit`；trusted-js importer 返回 `NewLineV0[]` 与 metadata，由宿主分配稳定 ID 并一次提交。

### 8. 平台能力通过端口注入

网络、文件选择、IndexedDB、Blob URL、DOM style、音频等环境能力位于 `src/platform` 或明确 adapter。插件服务依赖小型端口，测试使用 mock；不把 Tauri/Web API 散落进协议和内核。

当前 trusted-js 网络端口只发送匿名文本 HTTP，请求不带凭据并受离线开关、URL、header、超时与大小限制。WASM 不提供网络端口。

## 后果

- 贡献点在插件卸载后可确定性移除，命令不依赖具体 UI。
- 新增 contribution 必须同时实现合同、registry/owner、adapter、渲染和卸载测试。
- 旧 keyboard registry 与 kernel command registry 暂时并存；新增插件行为应接入 kernel，不应扩大旧 registry 的职责。
- trusted-js 视图拥有应用级代码权限，因此 UI registry 不是安全沙箱。

实现索引见仓库根目录 `PLUGIN.md`，当前断层见 `goal.md`“架构调整点”。
