# 桌面更新加速（2026-08-28）

## 决策

热更新慢的主因是每次都下整份 Electron 安装包（约 450MB：Chromium + 壳 + runtime），不是 updater 超时。本轮做四件事，国内镜像只走免费路径：

1. **发版纪律**：壳没变不打 `v*`；desktop-owned 六包仍必须跟桌面走；旧 Release 的 zip / `.blockmap` / runtime tar **禁止删**。
2. **Mac 差分保持打开**：`autoUpdater.disableDifferentialDownload = false`。`MacUpdater` 只认缓存里名为 `update.zip` 的上一版完整 zip。DMG 首装没有这份文件，第一次热更整包是预期。成功一次后 `copyFile` 成 `update.zip`，之后才有差量。日志进 `~/.dsh-desktop/logs/updater.log`。
3. **updater zip 剥未变的 `runtime.tar.gz`**：DMG / NSIS 仍自带（离线首装）。瘦 zip 与「缺 tar 时用 `.ok` / 按 sha 补拉」同 PR 发布。补拉资产名 `runtime-<sha>-<platform>-<arch>.tar.gz`，挂在该次 desktop Release 上。
4. **免费加速**：`HTTPS_PROXY` / 系统代理；可选 `DSH_UPDATE_MIRROR` 只重写 `/releases/download/` 大文件。`latest-mac.yml` / `latest.yml` 仍从 GitHub 拉（带 sha512）。没有长期稳定、还适合 450MB 的免费国内 CDN；不接阿里云 OSS；Cloudflare R2 免费额度记在这里当后手（electron-builder 26 无官方 `r2` provider）。

## 不做什么

Mac 公证 + hardened runtime 下不能只热换 `app.asar` 还保持签名。不拆 Electron 版本通道、不上 electron-delta、不禁用库验证。Chromium 不进下一次 OTA 的可行手段就是 zip blockmap 在第二次起跳过未改块。

## 迁移

从「带 runtime 的旧 zip 缓存」升到瘦 zip，第一次差分会很差或整包。再下一版（两份都是瘦 zip）才明显变小。整包路径也会少约 115MB。

## 验收指针

- DMG 首装离线能起 sidecar。
- 缓存里已有 `update.zip` 后再发壳-only：updater.log 显示差分。
- `HTTPS_PROXY=http://127.0.0.1:7890` 时检查/下载走代理；镜像 4xx 回落 GitHub。
