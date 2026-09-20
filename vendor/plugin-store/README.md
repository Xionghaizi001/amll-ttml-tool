# Locked factory artifact mirror

这里保存独立插件构建出的不可变 ZIP，供首次发布及离线构建使用，不包含插件源码。

time-shift 源码/测试位于独立项目 `amll-ttml-plugin-time-shift`。`factory-plugins.lock.json` 是版本与 SHA-256 的唯一锁定入口；构建同时验证摘要、manifest id 和版本，再生成静态 import 与 catalog。出厂副本与商店 ZIP 使用同一字节。

正式静态源可用后，将 lock 的 `source` 替换为其 HTTPS artifact URL；收集器已支持下载与摘要验证。远端发布尚未执行，不应把本地镜像称为已发布商店。
