# 红绿灯对齐：Electron WindowButtonsProxy 方案

日期：2026-08-19

## 现象

双击缩放时灯排会跳一下。只改按钮 origin、等 Tauri `Resized` 再重施，赢不了 AppKit 的 layout：缩放动画中系统每帧都把 titlebar 还原，Tauri 的 `Resized` 往往只在动画结束才来，所以用户看见「先回默认、再跳回目标」。

## 对照

Cursor / VS Code 走 Electron。Electron 不在 resize 后再 `setFrameOrigin` 三个按钮，而是：

1. 拿到 `titleBarContainer = close.superview.superview`
2. **改容器 frame**：高度 = 按钮高 + 2×margin，`origin.y = 窗口高 − 容器高`（钉在窗口顶）
3. 再在容器里放三钮
4. 订 AppKit 的 `NSWindowDidResize`（缩放动画每一帧）
5. 进出全屏时先 `setHidden` 整个容器，结束后再 redraw（`NotifyWindowWillLeaveFullScreen`）

见 `electron/shell/browser/ui/cocoa/window_buttons_proxy.mm`。

## 决策

照抄这套：`inset_traffic_lights` 改容器再放钮；`observe_titlebar_layout` 订 `DidResize` / `DidEndLiveResize` / 进出全屏；`WillEnter/WillExitFullScreen` 先藏容器。视觉目标不变（中线 y19、红灯左缘 x16）。

## 被否决

- 一次性相对偏移：全屏复位后错位。
- 延迟 400ms 重施：动画结束后跳位。
- 只改按钮 + Tauri `Resized`：动画过程中仍回默认。
- web 对齐系统默认灯位：灯排贴边，和开关/字标线不齐。

## 验证

`cargo check` 通过。实机：完全退出后 `pnpm desktop:dev`，双击缩放过程中灯排应跟着走、结束后不跳。
