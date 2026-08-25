# Changelog

Oh My DSH 桌面端的面向用户变更。插件各自有包内 CHANGELOG 的，不在这里重复。发版时 `scripts/release-notes.mjs` 抽取对应 `## [version]`（没有则回退 `## [Unreleased]`）写入 GitHub Release 与 `latest-mac.yml` / `latest.yml` 的 `releaseNotes`。

## [Unreleased]

### Changed

- 桌面壳换成 Electron。独立 sidecar 仍跑 `dsh web`；安装包内共用 Electron 的 Node（`ELECTRON_RUN_AS_NODE`），不再附带第二份 `tools/node`。
- 已安装的 0.2.x（Tauri）不能自动热更新到 0.3.x，请从 GitHub Releases 下载新安装包。
- 安装确认框展示本版更新说明，并按 Keep a Changelog 的标题/列表排版，不再只有一句「已下载、是否安装」。
- 桌面发版从本文件抽取对应版本，写入 GitHub Release 正文和自动更新清单，不再使用占位句 “See the release page for notes.”。

## [0.3.0-rc.1] - 2026-08-25

### Changed

- 桌面壳换成 Electron（Chromium）。macOS 用 `hiddenInset` 标题栏；通知带应用身份，点击回到窗口。
- 自动更新改为 `electron-updater`。0.2.x Tauri 用户须手动下载。
- macOS 关窗后壳与 sidecar 留在后台（通知仍会响），Dock 点回来；Cmd+Q 才退出。
- 0.3.x Release 仍放一份 `latest.json`，让 0.2.x 看到换壳说明而不是端点 404；不能热更新，须手动下载。

### Added

- 标题带通知中心。切到其他应用或非当前会话时发系统通知，点击打开对应会话。


## [0.2.0-rc.23] - 2026-08-24

### Fixed

- Overlay 标题栏下，带内控件相对红绿灯上漂（WKWebView 根滚动器的自动 content inset）。

## [0.2.0-rc.22] - 2026-08-22

### Changed

- 运行中发送按钮的 Stop 态改为主题柔和红，与蓝色 Send 区分。

### Fixed

- 规范化更新包资源名，避免 updater URL 对不上附件。
