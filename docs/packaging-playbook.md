# dsh-desktop 打包手册（macOS / M3）

面向「打出一个能在别的 mac 上跑的安装包」的完整操作指引。改流程先改本文件。

## 0. 前置条件（构建机）

- macOS + Apple Silicon（当前只打 aarch64；Intel 需另加 target，见 §7）
- Rust toolchain（rustup stable）
- Node 22+ / pnpm（`packageManager` 钉版本）
- runtime 组装只依赖**公有** fork 仓库（`runtime/revision.json` 的 repo），无需任何私有凭据；本仓库（壳）本身是私有仓库，构建机需要有它的 checkout 权限

## 1. 一键打包

```sh
pnpm desktop:build
```

`tauri.conf.json` 的 `beforeBuildCommand` 会先跑 `pnpm run desktop:prepare`（`scripts/prepare-desktop-bundle.mjs`）：

1. 构建桥插件（typecheck + 单测 + tsdown）；
2. 组装 runtime（`scripts/prepare-runtime.mjs`，SHA 键控缓存，同 SHA 秒级）；
3. 打 `src-tauri/resources/runtime.tar.gz`（`dsh/` + `tools/`，SHA 键控缓存）与 `bridge.tar.gz`（package.json + lib/ + cordis.patch.yml，每次重建），落 `runtime-revision.json` 副本；
4. cargo release 编译 → tauri-bundler 出 `.app` + `.dmg`（无签名证书时为 ad-hoc 签名）。

产物：`src-tauri/target/release/bundle/macos/dsh-desktop.app` 与 `.../dmg/dsh-desktop_<ver>_aarch64.dmg`。

注意：`src-tauri/resources/` 是 gitignored 的再生产物；**裸 `cargo build` 会因 build.rs 校验资源缺失而失败**，必须经 `pnpm desktop:build`（或先 `pnpm run desktop:prepare`）。单独 `cargo check` 前也要先跑一次 prepare。

### 安装窗口外观（DMG 背景与布局）

DMG 窗口的观感由两处共同决定，改任何一处必须同步另一处：

- `src-tauri/dmg/background.png` —— 窗口背景（标题文案 + 拖拽箭头 + 柔和底纹）。**由 `scripts/generate-dmg-background.py` 生成**（PIL；`pip install --user pillow`），不要手改 PNG。画布按 point 布局（660×400）以 2x 渲染（1320×800），保存时写 144 DPI 元数据——Finder 按 DPI 把背景映射回 point 尺寸（与 DropDMG「72/144 dpi」约定一致），Retina 下文字不糊；只画 1x 会糊，只画 2x 不写 DPI 会被放大裁切。
- `tauri.conf.json` 的 `bundle.macOS.dmg` —— `windowSize` / `appPosition` / `applicationFolderPosition`。图标锚点（app 180,196 / Applications 480,196，图标尺寸 128 为 create-dmg 脚本默认值）与背景里的箭头两端严格对齐；改坐标要重新生成背景。

已知现象：挂载窗口里可能看到 `.VolumeIcon.icns`——它是 create-dmg 放的卷图标 dotfile，默认隐藏，只有 Finder 开了「显示隐藏文件」（Cmd+Shift+.）才会现身，属正常现象，所有 create-dmg 系安装包（含 tauri 默认）皆然。

## 2. 包结构与首启解压（原理）

runtime 与桥插件以 **tar.gz 资源**进包（不是散目录拷贝）：runtime 树是 pnpm 安装产物（3k+ 符号链接），tauri-bundler 对目录资源不承诺保链接（解引用拷贝会让 .pnpm store 膨胀到 GB 级）；tar 往返链接感知。此外 tarball 方案还规避两个问题：App Translocation 把 .app 挂到只读卷（解压到 home 后树恒可写）；将来公证时嵌套 node Mach-O 不进 notarytool 扫描（藏在数据 tarball 里）。

首次启动时壳把资源原子解压到 home：

```
~/.dsh-desktop/
  runtime/<sha>/{dsh,tools}     ← runtime.tar.gz 解压，.ok 标记完整
  bridge/{package.json,lib,cordis.patch.yml}  ← bridge.tar.gz 解压
```

解压是「临时目录 + sentinel 校验 + rename 原子晋升」——半截解压不会被当作完整 runtime。缓存是**内容寻址**的：`.ok` 标记存 tarball 的 sha256（哈希写进 `runtime-revision.json`），同 revision 但内容变了（组装变更、桥重建）会自动重解压整目录替换；哈希命中秒过。

桥包解压后壳会补一个 `bridge/node_modules/@deepseek-ai/cordis` → runtime 树 `.pnpm` 的符号链接：桥 host 半（`lib/log-sink.js`）对 cordis 是**值引用**（`Logger.format`），Node ESM 需从桥目录解析 peer；dev 布局靠 devDep 链接，解压包没有（首版实测即栽在这里，见 `docs/notes/2026-08-19-packaging-tarball-resources.md`）。链接在 plugin install 之后建（pnpm 不会碰到）、指向 loader 解析的同一 real path（单一模块实例——**不往包里打 cordis 副本**，副本会造成双实例类身份分裂），并在 runtime 升级后自动重指到新 revision 的 cordis。

sidecar runtime 解析顺序（`find_runtime`）：`$DSH_DESKTOP_RUNTIME` → 包内资源解压树（release）→ 仓库 `runtime/build/<sha>`（dev）→ DSH 源码 checkout（dev 兜底）。桥插件同理（`find_bridge`）。

## 3. 体积参考（aarch64，runtime 734f65…/desktop v0.1.1）

| 产物 | 体积 |
|---|---|
| runtime 树（未压缩） | ~510 MB（dsh 含 tsx + tools） |
| runtime.tar.gz（资源） | ~115 MB |
| dsh-desktop.app | ~121 MB |
| dsh-desktop_0.1.1_aarch64.dmg | ~113 MB |

## 4. 本机验证

```sh
# e2e 冒烟（scratch home，不污染真实 ~/.dsh；探针走 gate→badge DOM→save_file IPC 往返）
DSH_HOME=$(mktemp -d) DSH_DESKTOP_E2E_PROBE=1 DSH_DESKTOP_E2E_EXIT=1 \
  src-tauri/target/release/bundle/macos/dsh-desktop.app/Contents/MacOS/dsh-desktop
echo "exit=$?"   # 0 = 通过
```

**强制走资源分支**（否则构建机的 `runtime/build` 与源码 checkout 会掩盖打包缺陷）：

```sh
mv runtime/build runtime/build.off          # 摘掉 dev 解析路径
rm -rf ~/.dsh-desktop/runtime               # 摘掉已解压缓存，强制重新解压
DSH_HOME=$(mktemp -d) DSH_DESKTOP_E2E_PROBE=1 DSH_DESKTOP_E2E_EXIT=1 \
  src-tauri/target/release/bundle/macos/dsh-desktop.app/Contents/MacOS/dsh-desktop
echo "exit=$?"                               # 0 = 资源分支完整可用
mv runtime/build.off runtime/build
```

**真实 home 场景**（scratch home 是干净世界，测不出 profile 里 `file:` 源码插件（.ts 入口）的加载依赖——0.1.0 就是在这里翻的车，bundled runtime 缺 tsx loader 全树崩溃，见 note 踩坑三）：

```sh
# 不设 DSH_HOME，用真实 ~/.dsh（含本地源码插件与用户 patch 层）：
DSH_DESKTOP_E2E_PROBE=1 DSH_DESKTOP_E2E_EXIT=1 \
  src-tauri/target/release/bundle/macos/dsh-desktop.app/Contents/MacOS/dsh-desktop
```

首次启动会解压 ~500MB（约十几秒），日志有 `extracted bundled runtime <sha>` 一行。真实 `~/.dsh` 手工过一遍：开窗、建会话、下载桥、外链、通知。

## 5. 分发与 Gatekeeper

**签名+公证已落地（0.1.1 起）**：产物为 Developer ID 签名 + Apple 公证版，`spctl -a -vv` 应答 `source=Notarized Developer ID`，用户浏览器下载、双击安装零手工步骤。DMG 本身也单独提交公证（用户挂载 DMG 时 Gatekeeper 同样查 DMG）。

一次完整公证构建的环境变量：

```sh
export DSH_CODESIGN_IDENTITY="Developer ID Application: <团队名> (TEAMID)"   # runtime 内 Mach-O 签名
export APPLE_SIGNING_IDENTITY="Developer ID Application: <团队名> (TEAMID)"  # .app/.dmg 签名
export APPLE_ID="<Apple ID 邮箱>"
export APPLE_PASSWORD="<App 专用密码>"      # appleid.apple.com 生成，非账号密码
export APPLE_TEAM_ID="<TEAMID>"
pnpm desktop:build
# DMG 单独公证（Tauri 只公证 app）：
xcrun notarytool submit src-tauri/target/release/bundle/dmg/dsh-desktop_<ver>_aarch64.dmg \
  --apple-id … --password … --team-id … --wait
```

凭据清单：Developer ID Application 证书（p12 导入钥匙串 + Apple G2 中间证书 `DeveloperIDG2CA.cer` + `security set-key-partition-list -S apple-tool:,apple: -k '登录密码' ~/Library/Keychains/login.keychain-db` 授权 codesign 用私钥）、Team ID、App 专用密码。**ASC「个人 API 密钥」不能用于 notarytool**（Apple 官方限制，实测 401）；团队 API 密钥可以（`APPLE_API_KEY/APPLE_API_ISSUER/APPLE_API_KEY_PATH`）。

公证实测踩过的坑（已固化进构建）：

1. **hardened runtime 强制**：`bundle.macOS.hardenedRuntime: true`；
2. **公证扫描钻进 tar.gz**：runtime 里 node/esbuild/sharp/ripgrep 等 16 个 Mach-O 全要 Developer ID 签名——prepare-desktop-bundle 打 tar 前自动签（`DSH_CODESIGN_IDENTITY` 门控；node 带 allow-jit entitlements，见 `scripts/entitlements-runtime.plist`）；
3. **staple 需要完整 Xcode**（本机仅 CLT，`stapler` 不可用）：不装订只是用户离线首启无法在线校验公证；curl 直链分发（无隔离属性）完全无感。

无证书降级通道仍有效（ad-hoc/仅签名 + `xattr -dr com.apple.quarantine`）。`productName`/`identifier` 已随签名生效，改名等于换应用。

分发通道推荐：curl 直链（最优）> 自建 brew tap > 浏览器直下（已公证，弹窗点「打开」即可）。

## 6. 升级 runtime / 桥版本

1. fork 侧打标签：`git tag desktop/vX.Y.Z <sha> && git push origin desktop/vX.Y.Z`
2. 本仓库更新 `runtime/revision.json`（repo/ref/sha）
3. `pnpm desktop:build`——prepare 检测到新 sha 自动重新组装、重新打 tar；壳按 sha 换解压目录，旧 `~/.dsh-desktop/runtime/<旧sha>` 不再被引用（可手动清理，壳不自动删）

## 7. 已知边界

- **架构**：只打 aarch64。Intel 机器需要 `rustup target add x86_64-apple-darwin` 后 `--target x86_64-apple-darwin` 另打一份（或 universal，体积翻倍）。分发时确认对方机器架构。
- **验证机的「干净」标准**：没有 Rust、没有 DSH checkout、没有本仓库 clone 的机器才是目标用户画像——装了 dev 环境的机器会走 source 兜底掩盖打包缺陷。
- **首启解压窗口**：~500MB 解压约 10–20s，窗口出现前有一段无反馈等待（后续可在窗口加启动进度）。
- **Windows/Linux**：解压用系统 `tar`（macOS 自带 bsdtar；Linux 上一般也有；Windows M3+ 再议）。
- App Translocation：从 DMG 直接拖进 /Applications 不触发；但**直接在 DMG 挂载卷里双击运行**会触发只读随机路径——解压方案对此免疫（写入目标是 home），行为仍推荐拖装。
