# 2026-08-21 About 页与可观测自动更新

## 决策

恢复 `settings.section` 的 `desktop-about` 页面，并把更新检查、下载进度、安装与重启统一建立在 Tauri 壳的进程级状态机上。标题带的安静更新入口继续保留；两个入口只读取同一份状态，不各自推断更新阶段。

## 为什么状态归壳所有

`tauri-plugin-updater` 的下载回调只存在于 Rust 侧，浏览器如果仅等待一个长时间 `invoke`，只能显示无法验证的 loading。状态归壳后有三个直接收益：

- About 在下载中途打开也能立即恢复累计字节、总大小与百分比。
- About 与标题带不会出现一边“可更新”、另一边“安装中”的分叉状态。
- 壳可以在命令入口做单飞检查，重复点击不会启动第二份下载或覆盖 updater 临时文件。
- 浏览器桥用共享递增代次串起两个 UI 面；检查或应用一旦开始，旧 IPC 回包即失效，各组件内部再按请求序号拒绝乱序快照。

状态为 `idle / checking / current / available / preparing / downloading / installing / restarting / failed`。下载回调按 chunk 累加 `downloaded`，首个可用 `content_length` 固定为 `total`；失败保留目标版本用于诊断，但重新安装前必须再次检查并回到 `available`。签名校验仍由 Tauri updater 的 `download_and_install` 完成，浏览器不接触包文件。

## 交互边界

- About 打开时先读取现状；从未检查过才触发一次共享检查，手动按钮可强制刷新。
- 后台检查失败继续静默；About 打开后才显示具体错误及重试入口。
- 发现版本只提示，不自动安装。用户点击“更新并重启”后才下载、校验、安装并自动重启；壳只接受刚完成检查的 `available` 状态，并在真正下载前重新检查 latest。检查或安装失败后先显式重试检查，再由用户重新确认安装；若发布端此时已有更高版本，安装最新版本，下载态立即展示实际目标。
- About 显示桌面 semver、编译进壳的 runtime ref 与完整 SHA（视觉缩短，hover 可见完整值），不读取用户目录中的解压 runtime。
- release notes 作为纯文本显示，避免把发布端内容作为 HTML 注入 webview。

## IPC 与测试

新增 `dsh_desktop_version_info`、`dsh_desktop_update_status`；`dsh_desktop_check_update` 和 `dsh_desktop_apply_update` 同步推进共享状态。命令同时进入 `build.rs` manifest、生成权限与默认 capability。

Rust 单测覆盖 chunk 累加、首个 total、状态序列化与安装 claim 门禁；TypeScript 测试覆盖快照解码、忙碌判定、百分比封顶、字节格式，以及并发检查合并、强制刷新、检查→安装排队和失败后重试。实际成功安装仍需已签名、版本高于当前桌面的 GitHub Release 做跨进程验收，开发构建只能覆盖检查失败和 UI 错误路径。
