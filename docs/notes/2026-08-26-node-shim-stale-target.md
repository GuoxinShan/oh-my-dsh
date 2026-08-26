# node-shim 死路径打断 yzj-cli 登录（2026-08-26）

## 现象

桌面点「云之家」登录，报：

```
~/.dsh-desktop/node-shim/node: exec /Applications/Electron.app/Contents/MacOS/Electron: No such file or directory
```

工作台说明是复用本机 yzj-cli 登录态。`yzj-cli` shebang 是 `#!/usr/bin/env node`。sidecar PATH 把 one-node shim 排在 Homebrew 之前，所以 `node` 不是 `/opt/homebrew/bin/node`，而是这段 exec Electron 的脚本。

## 原因

`ensureNodeShim` 把所有实例写到同一文件 `~/.dsh-desktop/node-shim/node`。`src-electron/shell.test.ts` 用虚构路径 `/Applications/Electron.app/Contents/MacOS/Electron` 调 `bundledRuntime`，而 `bundledRuntime` 无视测试临时根、落盘 `shellRoot()`。跑 `pnpm desktop:test` 就会把真实 shim 毒成死路径。已启动的 Oh My DSH sidecar 不会重写脚本，下一次 `yzj-cli` 即 ENOENT。desktop:dev 与打包壳互踩是同一机制。

## 修法

- 目标二进制不存在 → 拒绝写 shim
- 脚本按 `electronPath` 的 sha12 分目录，互不覆盖
- 启动时删掉旧的扁平 `node-shim/node`
- 测试传入独立 `shimRoot`，不再碰 `~/.dsh-desktop`

## 现场

已把当前扁平 shim 改回 `Oh My DSH.app` 的二进制；不必先重启即可再点登录。下一版起测试不再能改写打包壳的脚本。
