# 打包资源走 tarball + 首启解压（M3 Step 1/2）

日期：2026-08-19。配套手册：`docs/packaging-playbook.md`；契约同步在 AGENTS.md「打包」节。

## 决策：资源为什么是 tar.gz 而不是散目录

runtime 树（`runtime/build/<sha>/{dsh,tools}`，502MB）是 pnpm 安装产物：实测 **3188 个符号链接、两层结构**（顶层 `node_modules/@deepseek-ai/*` → `.pnpm/…`，`.pnpm` 包间又互链），且 `.pnpm` store 占 304M/304M——顶层几乎是空壳。tauri-bundler 对目录资源（`bundle.resources`）不承诺保链接：若按符号链接原样保留则可移植（链接全为相对路径），但若解引用拷贝，3188 个链接实体化后体积膨胀到 GB 级、.app 直接不可用。三选一的赌局不如直接选对三种行为都免疫的方案：**tar 往返天然链接感知**。

附带两个收益：

1. **App Translocation 免疫**：从 DMG 挂载卷直接运行时 .app 被挂到只读随机路径，散目录资源里 harness CLI 以资源树为 cwd 可能在只读卷上写文件炸掉；解压到 `~/.dsh-desktop` 后树恒可写。
2. **公证友好**：notarytool 扫 .app 内所有 Mach-O；node 二进制藏在数据 tarball 里不进扫描，避免「tauri-bundler 只自动签主二进制/externalBin」的坑。解压到 home 的二进制无 quarantine 属性，Gatekeeper 不检查其签名。

## 布局与原子性

资源三个固定名（不随 revision 变，`tauri.conf.json` 不用跟着 churn）：`resources/{runtime.tar.gz, runtime-revision.json, bridge.tar.gz}`，由 `scripts/prepare-desktop-bundle.mjs` 再生（gitignored，SHA 键控缓存：runtime tar 按 revision sha 跳过、bridge tar 每次重建跟 lib/）。

首启解压：`extract_bundle_tar` 解到 `<dir>.tmp` → sentinel 校验（runtime 为 `dsh/node_modules/@deepseek-ai/dsh/lib/bin.js`，bridge 为 `package.json`）→ 写 `.ok` 标记 → rename 原子晋升（同卷）。半截解压（断电/被杀）不会被当作完整 runtime；并发竞态败者丢掉自己的 tmp 保留赢家的。落地 `~/.dsh-desktop/runtime/<sha>/`（按 sha 分目录，升级即换目录）与 `~/.dsh-desktop/bridge/`。

壳解析顺序变更（`find_runtime`/`find_bridge`）：env 覆盖 → **资源解压树（release）** → 编译期 repo 路径（dev）→ 源码 checkout（dev 兜底）。dev 下资源探测自然 miss（无 `runtime-revision.json`），行为不变。

**构建机假阳性陷阱**：编译期路径在构建机上恒存在，会掩盖资源分支缺陷——验证必须 `mv runtime/build runtime/build.off` 强制 miss（playbook §4 固化为流程）。

## 踩坑一：build.rs 编译期校验资源存在

`tauri.conf.json` 声明的资源在 **build.rs 阶段**就要存在（`resource path … doesn't exist` panic）——裸 `cargo build/check` 在没跑过 prepare 的机器上直接失败。这是特性不是缺陷（防止把缺资源的包打出去），但 CI 与本地都要先 `pnpm run desktop:prepare`。

## 踩坑二：桥的 cordis peer 解析（e2e 实测失败后修复）

强制资源分支 e2e 首跑失败：sidecar 120s 未就绪，日志 `Cannot find package '@deepseek-ai/cordis' imported from ~/.dsh-desktop/bridge/lib/log-sink.js`。根因：`lib/log-sink.js` 的 `import { Logger } from '@deepseek-ai/cordis'` 是**值引用**（`Logger.format` 展开 printf 占位），Node ESM 从桥目录向上解析 peer——dev 布局靠 `plugin/dsh-desktop-bridge/node_modules` 的 devDep 链接（`link:dsh/vendor/cordis`，`pnpm install` 装出），解压出的包没有这个锚。

修复：`ensure_bridge_cordis_link`（unix-only）——plugin install **之后**（pnpm pack 遵循 `files` 字段不会带走 node_modules，且不让 pnpm 碰到运行时链接）、sidecar spawn **之前**，把 `bridge/node_modules/@deepseek-ai/cordis` 链到 runtime 树 `.pnpm` 里 cordis 的 real path（canonicalize 后比较）。Node ESM 默认 `preserveSymlinks=false`，经符号链接解析到与 plugin loader 相同的 real path ⇒ **同一模块实例**（不是第二份 cordis 副本——往包里再打一份 cordis 反而是错的：两份副本 = 两个模块实例，类身份分裂）。幂等且自愈：链接已解析到**当前** runtime 的 cordis（readlink + canonicalize 等值比较）则不动；指向别处（升级后旧 revision 目录仍残留——首版缺陷，`exists()` 为真即跳过会静默留用旧 cordis 配新 runtime）或悬空（revision 目录被手删）则重指/重建；真实目录（dev 布局 pnpm install 产物）绝不触碰；runtime 无 `.pnpm`（source 兜底）静默跳过。失败只 warn 不阻断——与日志汇「尽力而为」的契约一致。实测：预置指向旧 sha 的链接 → 启动后自动重指到当前 sha 且 e2e 通过。

## 踩坑三：bundled runtime 丢了 tsx loader（用户实测暴露）

首版包在干净 home 的 e2e 全绿，但用户真实 `~/.dsh` 打开即报错：页面横幅 `Failed to load plugins … dsh-session-log-export/client.js failed to load`，sidecar 日志真因是 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING: … profiles/web/node_modules/dsh-provider-balance/src/index.ts`——真实 web profile 里有 **`file:` 指向本地源码的插件**（.ts 入口直接分发），终端源码 runtime 用 `node --import tsx/esm` 剥类型能加载；打包 runtime 是纯 JS 入口（`lib/bin.js`），首版 `bundled_runtime` 没带 `--import`，Node 拒绝剥 node_modules 下的类型 → 整棵插件树崩溃 → webserver 起不来 → client 侧所有 bundle 404（session-log-export 横幅只是下游症状）。**教训：e2e 矩阵必须含真实 home 场景，scratch home 掩盖了源码插件依赖。**

修复（两层）：

1. **tsx 成为 runtime 一等依赖**：`prepare-runtime.mjs` 的 runtime manifest `dependencies` 加 `tsx`（组装脚本 `SCRIPT_REV` 版本盐，bump 即自失效缓存重建树）；`bundled_runtime` 的 `args_prefix` 与源码 runtime 对齐带 `--import tsx/esm`（从 runtime 树自己的 tsx 解析）。
2. **解压缓存内容寻址化**：sha 同、内容变（组装变更/桥重建）时旧缓存会短路——`.ok` 标记从「存在即有效」改为**存 tarball 的 sha256**（prepare-desktop-bundle 把 `runtimeTarball`/`bridgeTarball` 哈希写进 `runtime-revision.json` 副本，shell 引导时比对，不匹配即重解压整目录替换）；tar 生成缓存键同时加 `sha + scriptRev` 防止树重建后打出陈旧 tar；桥目录同样哈希门控（此前只查 `package.json` 存在，桥更新永不传播）。app 版本随之 0.1.0 → 0.1.1。

## 踩坑四：公证三连（hardened runtime / tar 内 Mach-O / DMG 单独公证）

拿到 Developer ID（团队个人账号的 p12 整套打包提供——免掉网页建证书步骤，导入钥匙串 + G2 中间证书 + `set-key-partition-list` 授权即可）+ App 专用密码后，公证揭出三层：

1. **hardened runtime**：公证强制，`bundle.macOS.hardenedRuntime: true` 一行修复；
2. **公证扫描钻进 tar.gz**（推翻本 note 前文「嵌套 Mach-O 不进公证扫描」的判断——扫描器会把归档整个展开，日志路径 `runtime.tar.gz/runtime.tar/…` 为证）：runtime 树 16 个 Mach-O（node、pnpm 的 .node、esbuild、sharp、ripgrep、fsevents、koffi…）全部要求 Developer ID 签名 + 时间戳 + hardened runtime。修复：prepare-desktop-bundle 打 tar 前按魔数扫出全部 Mach-O 逐个 codesign（`DSH_CODESIGN_IDENTITY` 门控，无证书时跳过但产物不可公证），node 带 `allow-jit`/`allow-unsigned-executable-memory`/`disable-library-validation` entitlements（`scripts/entitlements-runtime.plist`）；`.macho-signed` 标记缓存，tar 缓存键含签名态。签名版 node 跑 JIT 经真实 home e2e 验证正常；
3. **凭据边界**：ASC「个人 API 密钥」不能用于 notarytool（官方文档明说，实测 401）；App 专用密码可用（`notarytool history` 验证，且能看到该团队此前已有用同一身份公证其他产品的先例）。

另：Tauri 只公证 .app，DMG 需自己 `notarytool submit --wait` 一次；staple 装订需要完整 Xcode（CLT 不含 stapler），不装订仅影响离线首启。

**最终态**：`.app` 与 `.dmg` 均 `spctl` 应答 `source=Notarized Developer ID`（Apple 侧 status Accepted）；公证版真实 home e2e 通过（重解压签名 runtime → `DSH_E2E_OK`）。

## 结果（更新）

- 强制资源分支 e2e（摘 `runtime/build` + scratch `DSH_HOME`）：`DSH_E2E_OK`，exit=0（见 playbook §4）。
- **真实 home e2e（含 `dsh-provider-balance`/`dsh-mcp-settings` 两个 .ts 源码插件）**：哈希不匹配自动重解压 → 全树加载 → `DSH_E2E_OK` exit=0（首启 2m53s 含 500MB 重解压；哈希命中后 12.8s）。
- 体积（0.1.1）：runtime.tar.gz 115.1MB，.app 121MB，DMG 113MB。
- 基线对照：改动前裸打的本机包（12MB .app，runtime 走编译期路径）e2e 亦通过——两分支各自验证过。
