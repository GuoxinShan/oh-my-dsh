# 自动更新走 `/releases/latest`，不刮 atom

日期：2026-08-27

## 决策

壳在 `configureUpdater` 里钉 `autoUpdater.allowPrerelease = false`。检查、下载都认 GitHub 的 `releases/latest`（桌面 Release `make_latest: true`、不勾 prerelease），不认 `releases.atom` 里第一条 semver `-rc` tag。

## 理由

`electron-updater` 默认：当前版本带 prerelease 段（`0.3.0-rc.1`）就把 `allowPrerelease` 设成 true，GitHub provider 去刮 `releases.atom`，把第一条通道为 `rc` 的 tag 当最新，再向**该 tag** 要 `rc-mac.yml` / `latest-mac.yml`。

本仓的 `-rc` 只是 semver 预发布段，GitHub 上桌面 Release 走 latest、插件 tag 也进同一条 atom。一次失败的 `v0.3.0-rc.3`（tag 在、Release 不在、没有 yml）排在 atom 最前时，已装的 `0.3.0-rc.1` 检查 404，标题带按设计静默，图标永远不出现。真正的 latest（当时 `v0.3.0-rc.2`）根本走不到。

这与「GitHub Release 不勾 prerelease / latest 由桌面独占」的发版契约一致：semver `-rc` ≠ GitHub prerelease 通道。

## 行为

- 新装与升上来的壳：`checkForUpdates` 只解析 `/releases/latest` 上的 `latest-mac.yml` / `latest.yml`。
- 已装的旧 `-rc` 壳仍会刮 atom。失败的桌面 `v*` tag 若没做成带附件的 latest Release，必须删 tag（2026-08-27 对 `v0.3.0-rc.3` 即此救场），否则旧客户端继续静默。
- 不改「失败静默、发现才出图标」的 UI 契约。

## 验收

- `src/updater.ts` 的 `configureUpdater` 每次都写 `allowPrerelease = false`。
- 推一个没有附件的 `v*` tag 时，已升到本修复的客户端仍能从 `/releases/latest` 看到上一版；旧 `-rc` 客户端仍可能中招，靠删 tag 救。
