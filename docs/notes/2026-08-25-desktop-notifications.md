# 桌面消息通知接到 bridge

日期：2026-08-25

## 为什么

注意力通知一直在桥插件里，但只在 `document.hidden` 时发。切到别的应用而窗口仍可见时不响；点击横幅也只聚焦窗口，打不开对应会话。

## 做法

不新开插件包，在 `dsh-desktop-bridge` 内收成 `src/client/notifications.ts`：

- 门控：窗口隐藏、失焦、或边属于非当前会话 → 发系统通知；当前会话且窗口聚焦不发。
- `dsh_desktop_notify` 带 `sessionId`。
- Electron preload 增加 `on('dsh-desktop-notify-click')`；点击横幅聚焦主窗并 `sessions.open(id)`。
- 归档 Tauri 没有 `on`，只发横幅。

进程内通知中心挂在标题带（macOS）或右上角（其他平台）：最多 30 条、不落盘、未读圆点、点一条打开会话。系统横幅仍按门控发。

桥升 `0.2.0-rc.6`。

## 后台保留

关窗若顺带 `app.quit()` + `killSidecar()`，通知中心和系统横幅一起没了。macOS 红灯改为 hide：壳与 sidecar 留在后台，Dock 点回来；Cmd+Q 才退出。Windows/Linux 仍关窗即退。
