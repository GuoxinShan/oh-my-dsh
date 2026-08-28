# 发版流水线压到几分钟（2026-08-28）

## 目标

`v0.3.0-rc.4` 成功墙钟约 23 分钟（Mac 主路径 ~21，publish 再下载/上传 400MB artifact ~2）。用户要「几分钟」。Apple 公证两张 ticket（约 3–8 分钟）和 electron-builder 打带 Chromium 的 `.app`/DMG（约 2–4 分钟）不能砍。缓存全命中的地板大约 **6–10 分钟**，不是 2 分钟。本变更把能跳的重活和 400MB 往返拿掉，逼近这块地板。

## 四刀

1. **跳过重复重活**（`scripts/prepare-desktop-bundle.mjs`）
   - `.electron-abi` 已等于当前 Electron 则跳过 `electron-rebuild`。
   - 六包 `build` 并行。
   - CI 在 plugin lib cache **精确命中** 时设 `DSH_DESKTOP_USE_CACHED_PLUGIN_LIBS=1`，见 `lib/index.js` 则跳过该包 build。不用宽 `restore-keys`，避免旧 lib 被当成命中。

2. **扩大 GHA cache**
   - 另缓存已签名的 `src/resources/runtime.tar.gz` + `.sha`。key 带 `-signed`，无 restore-keys（防「签过名的树 + 未签名旧 tar」错配；prepare 的 tar cache key 已含 `signed|unsigned`，这是第二道）。
   - 六包 `plugin/<name>/lib`（key = 各包 src + package.json + tsdown，不含 node_modules）。

3. **electron-builder Mac 只打 DMG**
   - `electron-builder.yml` `mac.target` 去掉 zip。胖 zip 打完再剥 runtime 是白烧几分钟。
   - `scripts/slim-mac-updater-zip.mjs` 从已签 `.app` 用 `ditto` 复制（Frameworks 有 symlink，禁止 `cpSync`）、剥 `runtime.tar.gz`、重签、打瘦 zip、写 blockmap，并 **自己写完整** `latest-mac.yml`（`src/runtime-artifact.ts` `latestMacYml`）。builder 在只打 DMG 时可能把 yml 指到 dmg，沿用即断更新。

4. **平台 job 直传 draft Release**
   - 公证/打包后 `scripts/upload-draft-release.sh`：`gh release create --draft || 已存在` + `gh release upload --clobber`。
   - `desktop-publish` 不再 download 400MB artifact；校验两侧附件齐全后上传 `latest.json`，`gh release edit --draft=false --latest`。一侧失败则不揭稿，draft 留着下次 `--clobber`。

`v0.3.0-rc.5` 在 slim 重打 blockmap 时炸了：`require('app-builder-bin')` 在 pnpm 隔离树里解析不到，而且 electron-builder 26 已经改成 `app-builder-lib` 的 JS Rabin blockmap，那个 CLI 不再随依赖安装。修法：经 `electron-builder` → `app-builder-lib` 调 `buildBlockMap(zip, 'gzip', zip.blockmap)`。

`v0.3.0-rc.6` 第一次跑 slim 过了，随后 DMG 校验用 `pip install --user` 撞上 macos-latest 的 PEP 668（Homebrew Python externally-managed）。改回临时 venv。没发出去不加号，同一 `0.3.0-rc.6` 重打 tag。

## 不做

- 一张 ticket 盖 zip + DMG（已炸过）。
- 公证同一份 DMG 的同时 `hdiutil attach`（同文件读写会抢）。校验在公证前、串行。
- 本 PR 不 bump 桌面版本。流水线合进 main 后，下一次 `v*` 才用上加速。
