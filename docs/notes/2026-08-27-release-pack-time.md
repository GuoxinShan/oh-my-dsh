# 加快桌面发版墙钟（2026-08-27）

## 现象

成功的 `v0.3.0-rc.1` mac job 约 24 分钟、Windows 约 5.5 分钟，墙钟跟 mac 走。发版在 CI 已经 typecheck/test 之后又全量验证五包，并串行等两轮 Apple 公证。

## 原因

- Release 先 `prepare-runtime` + 五包 install，`prepare-desktop-bundle` 再 typecheck/test/build，然后再 `prepare-runtime` 一次。
- CI 用 `--config.mac.notarize=true` 在打 zip/dmg **之前**堵 `.app`，打完再 `notarize-dmg.sh` 堵 DMG。两份文件 hash 不同，必须两张 ticket；串行把墙钟变成相加。

## 修法

- `DSH_DESKTOP_PREPARE_MODE=build`：只 build 五包；该模式下先组装 runtime，再用 `runtime/src` 做 bridge setup。本地默认仍 verify。
- workflow：浅 checkout、五包 install 并行、不再预先 `prepare-runtime`。
- `scripts/notarize-mac-artifacts.sh`：zip 与 DMG 并行 `notarytool submit --wait`，只 staple DMG。electron-builder 保持 `mac.notarize: false`。

## 不做

- 一张 ticket 盖 zip + DMG（`v0.3.0-rc.1` staple-only 已炸）。
- mac/win 共用 runtime 树（native + Electron ABI）。
