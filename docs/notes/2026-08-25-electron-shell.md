# Electron 壳（0.3.0-rc.1）

把桌面宿主从 Tauri 2 / WKWebView 换成 Electron + 独立 sidecar。产品身份
`dev.dsh.desktop` 不变；`dsh web` 仍是独立进程。打包态 sidecar 用
`ELECTRON_RUN_AS_NODE=1` 跑同一份 Electron 二进制，runtime tarball 不再带
`tools/node`，native 模块在 prepare 时按 Electron ABI rebuild。

同进程跑 harness 已否决（崩溃隔离、杀树、环境泄漏）。已装的 0.2.x Tauri
客户端不能经 `latest.json` 热更新到 Electron，必须下载新安装包。归档 Tauri
若发现 0.3.x 或 `latest.json` 404，确认安装只会打开 Releases 下载页。

开发启动走 `scripts/launch-electron.mjs`，会清掉误设的 `ELECTRON_RUN_AS_NODE`，
否则 Electron 会当 Node 跑、`app` 为 undefined。该变量只出现在 sidecar 子进程。
每次启动会重建桥插件 client；其余桌面自有插件若缺 `lib/index.js` 也会尝试构建。

`runtime/revision.json` 钉的 sha 若本机没有组装树，且 `runtime/build/` 里恰好只有
一棵完整 runtime，开发启动会用那棵并 warn。一份 Node（`ELECTRON_RUN_AS_NODE`）
看的是**实际选中那棵树**上的 `.electron-abi`（prepare 写入），不是钉死 sha 的路径。

打包态 runtime tar **不含** `tools/node`，也不含 `tools/node_modules/.bin/node*`：
pnpm 的 `.bin/pnpm` 会优先 exec 同目录 `node`，若留下指向已省略二进制的 stub，
Profile `plugin add` 会 127 死循环。壳在 one-node 启动时再 `neutralizeToolsNodeShims`
兜底删除；PATH 上 Electron `node-shim` 排在 tools/.bin 之前。

