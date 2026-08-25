# Electron 关窗后台保留

日期：2026-08-25

## 为什么

通知中心和系统横幅都挂在壳进程 + sidecar 上。红灯关窗若 `window-all-closed` → `killSidecar()` + `app.quit()`，后台会话完成也不会响。

## 做法

macOS：关窗 hide，不 destroy；`window-all-closed` 不退出；Dock `activate` 再 show。Cmd+Q / `before-quit` 才允许关窗并杀 sidecar。Windows/Linux 无托盘，关窗仍退出。

判定是纯函数 `shouldRetainBackground`。unpackaged 同时跳过插件 tarball 解压，dev 走仓内 `plugin/`。
