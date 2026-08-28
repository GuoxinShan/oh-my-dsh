# Changelog

Oh My DSH 桌面端的面向用户变更。插件各自有包内 CHANGELOG 的，不在这里重复。发版时 `scripts/release-notes.mjs` 抽取对应 `## [version]`（没有则回退 `## [Unreleased]`）写入 GitHub Release 与 `latest-mac.yml` / `latest.yml` 的 `releaseNotes`。

## [Unreleased]

## [0.3.0-rc.4] - 2026-08-28

### Fixed

- macOS sidecar 改为 LSUIElement helper 子进程，同事机没有 clang 时也不再出现两颗 Dock 图标。

## [0.3.0-rc.3] - 2026-08-28

### Fixed

- macOS 打开应用时 Dock 不再闪一颗马上消失的图标（sidecar 不再 `setsid` 成第二份 `.app`）。
- 更新说明按 GitHub HTML 收成标题/列表；标题带已下载勾可点，不再被拖窗条抢走点击。
- 自动更新只认 GitHub `releases/latest`，不再因空的 `-rc` tag 刮 atom 而静默失败。
- 测试与 `desktop:dev` 不再把共享 `node-shim` 写成死路径（云之家登录 ENOENT）。

### Changed

- 新增模型档位编辑器插件：设置 → 模型的每条自定义模型行内可直接编辑推理档位组合、各档线上值与 Z.ai 线缆格式，改档位不再需要手工编辑 settings.yaml 或重新发版。

## [0.3.0-rc.2] - 2026-08-27

### Fixed

- 新建会话时 agent 附着的短暂 running 脉冲不再发「回合已完成」。
- 启动或切工作区灌入会话列表时，不再把历史会话刷进通知中心。
- macOS 上 Bash 等工具不再在 Dock 冒出通用 exec 图标。

### Changed

- 新增模型档位编辑器插件：设置 → 模型的每条自定义模型行内可直接编辑推理档位组合、各档线上值与 Z.ai 线缆格式，改档位不再需要手工编辑 settings.yaml 或重新发版。

- Tauri 壳从仓库删除；Electron 升为正职 `src/`。图标与 DMG 背景随壳走。

## [0.3.0-rc.1] - 2026-08-25

### Changed

- 桌面壳换成 Electron（Chromium）。macOS 用 `hiddenInset` 标题栏；通知带应用身份，点击回到窗口。
- 自动更新改为 `electron-updater`。0.2.x Tauri 用户须手动下载。
- macOS 关窗后壳与 sidecar 留在后台（通知仍会响），Dock 点回来；Cmd+Q 才退出。
- 0.3.x Release 仍放一份 `latest.json`，让 0.2.x 看到换壳说明而不是端点 404；不能热更新，须手动下载。

### Added

- 标题带通知中心。切到其他应用或非当前会话时发系统通知，点击打开对应会话。

### Fixed

- macOS DMG 安装窗按 660×400 出，不再被 2x 背景像素撑成 1320×800。


## [0.2.0-rc.23] - 2026-08-24

### Fixed

- Overlay 标题栏下，带内控件相对红绿灯上漂（WKWebView 根滚动器的自动 content inset）。

## [0.2.0-rc.22] - 2026-08-22

### Changed

- 运行中发送按钮的 Stop 态改为主题柔和红，与蓝色 Send 区分。

### Fixed

- 规范化更新包资源名，避免 updater URL 对不上附件。
