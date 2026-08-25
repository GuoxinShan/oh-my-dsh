# 2026-08-25 — Electron DMG 必须同时给 1x 和 @2x 背景

`v0.3.0-rc.1` Release 的 macOS job 在公证后的 `Verify DMG Finder layout` 失败：

```
Finder window size (1320, 800) != (660, 400)
bundled background is missing
```

Windows NSIS 已成功。失败发生在签名公证之后、staple / 上传之前，所以没有附件。

## 根因

换 Electron 后仍复用 Tauri 的单张 `src-tauri/dmg/background.png`：1320×800 @144dpi。create-dmg 按 DPI 把像素映射回 660×400 point。electron-builder 26 / dmgbuild 不读 DPI，用 `sips` 的 **pixelWidth/Height** 当 Finder 窗口尺寸，并且在配置了 `dmg.background` 时忽略 `dmg.window.width/height`。

因此 CI 打出来的窗是 1320×800。背景则被写成 hidpi TIFF / 卷根隐藏文件，不再是 Tauri 的 `.background/background.png`，校验脚本按旧路径判定缺失。

## 修法

1. 生成脚本同时写 `background.png`（660×400 @72dpi）和 `background@2x.png`（1320×800 @144dpi）。electron-builder 发现旁路 `@2x` 后走 `tiffutil -cathidpicheck`，`sips` 读 TIFF 得到 660×400。
2. `verify-dmg-layout.sh` 接受 electron-builder 的几种背景落点（`.background/*.tiff`、卷根 `.background.png` 等），TIFF 只核像素尺寸，不再和源 PNG 做字节比较。

图标坐标未变：（180,196）/（480,196），iconSize 128。失败的 `v0.3.0-rc.1` tag 删掉后钉到含本修的 main 再推，同一版本重跑 Release。
