# one-node bash 在 Dock 里冒出通用 `exec` 图标（2026-08-26）

打包桌面的 sidecar 是 `Oh My DSH.app` 这份 Electron 二进制 + `ELECTRON_RUN_AS_NODE=1`。harness 的 bash 在 POSIX 上 `spawn(..., { detached: true })`，libuv 会 `setsid(2)` 让子进程成为 **session leader**。从已经向 Launch Services 登记过的 `.app` 里再长出一个 session leader 时，macOS 会把它当成独立前台应用；可执行文件没有自己的 bundle，Dock 就画出系统那枚绿字 `exec` 的 Unix 通用图标。命令里再走 `node-shim`（`exec` 回同一份 Mach-O）会再挂一颗。

这和红灯关窗保活、当年通知 applet 刷 Dock 不是一条路。孤立的 `ELECTRON_RUN_AS_NODE` 进程（不是 GUI 的子进程）`setsid` 后不一定进 Dock——要和正在跑的壳同 coalition 才稳定复现。

## 做法

不改 harness 的杀树契约（`kill(-pgid)` 仍要求子进程是自己那组的 leader）：

1. sidecar `--import` 一层 spawn 守卫：把 `detached: true` 改写成先跑 `dsh-pgrp`（只 `setpgid(0,0)` 再 `exec`），同一 pid，故 `kill(-pid)` 仍成立。
2. 同一进程 `dlopen` 一个 constructor dylib，对 **当前进程** 调 `TransformProcessType(..., kProcessTransformToBackgroundApplication)`，让 one-node 的 Electron 自己也不去抢 Dock。
3. `node-shim` 同样 `--import` hide-dock，挡 `#!/usr/bin/env node` 那条。

实现在 `src/darwin-dock-guard.ts`，sidecar `--import` 与 `node-shim` 由 `src/runtime.ts` 接线。clang / 加载失败则 warn、行为与改前相同。Windows / two-node 不走这条。

## 非目标

不为此改回 two-node（打包 runtime 的 native 是 Electron ABI）。不把 bash 改成非独立进程组。
