# 同事更新后 Dock 里两颗 Oh My DSH（2026-08-28）

## 现象

同事装上新版后程序坞里一直有两颗 Oh My DSH，不是闪一下。这不是「两个前台产品」，是 sidecar 被 Launch Services 当成了第二份 App。

## 为啥 rc.3 的 hide-dock 挡不住

one-node sidecar 跑的是 `Oh My DSH.app/Contents/MacOS/Oh My DSH`。Dock 身份跟**正在跑的那份可执行文件所在 bundle**走，跟是不是子进程、有没有 `setsid` 只部分相关。

rc.3 用 `dsh-pgrp` + `TransformProcessType` 降后台：

1. 要在用户机器上 `clang` 编 `dsh-pgrp` / `hide-dock.dylib`。没装 Xcode CLT 就编译失败，退回 `detached: true`，第二颗图标常驻。
2. 就算编过，`exec` 进主程序后 Electron 仍按主 bundle 登记；hide-dock 是事后补救，经常来不及或 dylib 加载失败。

## 修法

把 69KB Electron stub **复制**进 `~/.dsh-desktop/sidecar-node/<sha>/DSH Node.app`，Info.plist 写 `LSUIElement` + `LSBackgroundOnly`，`Contents/Frameworks` 软链到壳的 Frameworks（`@rpath` 仍有效）。spawn 这条路径、`detached: false`，不依赖 clang。

`node-shim` 也 exec 这份 helper，避免 `yzj-cli` 的 `env node` 再拉起主程序。退出按 PPID 树杀，不再 `kill(-pgid)`（子进程与窗口同组）。

## 2026-08-28 续：复制后不重签会被 SIGKILL

Developer ID + Hardened Runtime 的 stub 拷进新 bundle、改 Info.plist 之后，`spctl` 报 `invalid resource directory`。`ELECTRON_RUN_AS_NODE` 直接 137，sidecar 日志是空的，壳等满 120s 报 `GET /` 超时。完整 DMG 里有 `runtime.tar.gz`，这次不是在拉 runtime。

修法：写出 helper 后 `codesign --force --sign -`（与 hide-dock dylib 同一姿势）。已有 helper 若仍是 Developer ID / runtime，下一启动重做。签不掉就退回主程序，宁可再闪一颗 Dock 也不能起不来。
