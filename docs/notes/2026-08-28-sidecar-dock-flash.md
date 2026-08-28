# 打开桌面时 Dock 图标跳一下马上消失（2026-08-28）

## 现象

0.3.0-rc.2 已挡住 Bash 工具的常驻 `exec` 图标，但一点 Oh My DSH，程序坞仍会闪一颗图标（或让现有图标跳一下）随后立刻没。不是没更新。

## 原因

sidecar 复用 `Oh My DSH.app` 这份 Mach-O（`ELECTRON_RUN_AS_NODE=1`），壳侧 `spawn(..., { detached: true })` 让 libuv `setsid`。子进程成为 **session leader** 时，Launch Services 按 GUI `.app` 再登记一颗 Dock。随后 sidecar `--import` hide-dock 才 `TransformProcessType` 降后台，所以表现为「跳一下马上消失」。

Bash 工具走 spawn-guard → `dsh-pgrp` 的修法没套到 sidecar 自己身上。

## 修法

- `planSidecarSpawn`：macOS 且守卫可用时，命令改为 `dsh-pgrp <electron> --import hide-dock …`，`detached: false`。pid 仍是 sidecar，`setpgid(0,0)` 后 `kill(-pid)` 不变。
- `dsh-pgrp` 入口先 `TransformProcessType`，避免这个无 bundle 的辅助二进制自己冒成绿字 `exec`。
- hide-dock `--import` 保留：Electron 启动后若再抢前台，仍能降回去。

编译失败则退回原来的 unix `detached`（观感与 rc.2 相同）。
