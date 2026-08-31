# 2026-08-31 mac 重启更新失败根因与运行时预置

## 事故现象

mac 上点击「重启以更新」后应用没有重启更新，用户只能从 GitHub 手动下载 DMG 重装。更新弹窗图标块在下载期间一直转圈（应展示静态 app logo）。

## 时间线还原（2026-08-31，rc.8 → rc.9）

- 12:47:13 updater.log：`update-downloaded`（zip 108MB 下载+Squirrel 缓存完成）。
- 12:47:13.377 ShipIt：`Detected this as an install request` —— 然后**闲置 78 分钟**。
- 14:05:16 ShipIt 才 `Beginning installation`（用户手动退出应用后才执行交换），交换成功并 relaunch。
- 14:05→14:14 新版首启**无窗口静默下载 371MB runtime**（slim zip 不带 `runtime.tar.gz`，`.ok` 缓存未命中走 Release 补拉），14:15 sidecar 才起来；用户早已认定失败并从 GitHub 装了 DMG。

## 根因一：keep-alive 的 close veto 拦截了更新退出序列

electron-updater 文档明确：`quitAndInstall()` **先关闭所有窗口，之后才在 app 上发 `before-quit`**。我们的 macOS 后台保留只在 `before-quit` 里 `setAppQuitting(true)`，于是更新序列的关窗被 `window.on('close')` veto 成 hide，进程永不终止，ShipIt 一直等不到退出。

**修复**：`main.ts` 监听**原生** `autoUpdater` 的 `before-quit-for-update`（在关窗之前发出）提前 `setAppQuitting(true)`。普通 Cmd+Q 路径不变。

## 根因二：slim zip 的运行时下载发生在重启后的盲区

slim zip 设计（剥 `runtime.tar.gz`）把 371MB 运行时推迟到新版首启时下载：主进程 `spawnSync curl` 阻塞、无窗口无进度，慢网络下数分钟「装死」，用户必然强退。

**修复（运行时预置）**：`dsh_desktop_download_update` 在宣告 `ready` **之前**完成运行时落盘——从下载 zip 读 `runtime-revision.json`（`unzip -p` 单条目），`.ok` 未命中则**异步**预拉 runtime tar 到 `runtime-tarballs/` 缓存并校 sha256：

- 相位保持 `downloading`，按 `.part` 字节上报进度（total 未知 → 弹窗不定态），UI 全程可见；
- 预置失败 → 整体 `failed`：留在能用的旧版上可重试，**绝不带着缺失运行时重启**（同样网络条件下 boot 期 curl 也必然失败，早失败优于重启后失败）；
- 取消下载会同时 abort 预拉 curl，状态回 `available`；
- 重启后首启命中本地 tar 直接解压，不再联网。Windows NSIS 自带 tar，不预置。

备选方案「OTA zip 不再瘦身」（每版热更 ~480MB）被否：瘦身正是为避免大流量，预置保留了瘦身的全部好处且消除了盲区。

## 弹窗图标

弹窗头部图标块各相位恒为静态 app logo（`update-logo.tsx`，从 `src/icons/icon-src.svg` 内联，与 Dock 图标一致）；忙碌旋转只保留在 22px 标题带按钮上。

## 影响面与验证

- `src/main.ts`（before-quit-for-update）、`src/updater.ts`（预置 + 取消 abort）、`src/runtime-artifact.ts`（`readBundledRevisionFromZip` / 异步下载）、桥 `update-indicator.tsx` + 新增 `update-logo.tsx`。
- 壳 94/94 测试通过（新增 revision-zip 读取用例）；桥 88+7 测试通过、build 通过；两侧 typecheck 干净。
- 热更链路实证需下一次 rc 发布后在 mac 上走一遍完整 OTA。
