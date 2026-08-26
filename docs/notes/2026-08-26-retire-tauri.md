# 2026-08-26 — 删除 Tauri 树，Electron 升为正职 `src/`

`v0.3.0-rc.1` 的 Electron 壳本机启动正常后，不再保留 0.2.x 的可构建面。

## 做了什么

1. `src-electron/` 整树改名为 `src/`（main / preload / sidecar / profile CAS）。
2. 发货仍需要的图标与 DMG 背景从 `src-tauri/icons` / `src-tauri/dmg` 搬到 `src/icons`、`src/dmg`。
3. 删除 `src-tauri/`（Rust 壳、Tauri 配置、iOS/Android 图标集、`ARCHIVED.md`）。
4. 去掉仓根 `@tauri-apps/cli` 与 `desktop:tauri` / `desktop:build:tauri` / `tauri` 脚本；Windows 证书脚本 `windows-import-cert.ps1` 只写 Tauri merge config，Electron 已走 `CSC_LINK`，一并删除。

## 故意留下的

- `scripts/tauri-cutover-latest-json.mjs`：0.2.x 仍轮询 `releases/latest/download/latest.json`。
- 桥插件对 `window.__TAURI_INTERNALS__.invoke` 的兼容探测：已装 0.2.x 不因卸载桥而突然 fail loud。

历史决策笔记不改路径，指向已删除的 `src-tauri/` 时以 git 历史为准。
