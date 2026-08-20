# 2026-08-21 — rc.8 基线升级（fork v0.1.0-rc.8+zw.4 + 桌面 0.2.0-rc.6）

上游发布 `dsh-v0.1.0-rc.8`（1604 文件、+54k 行；npm `next` tag）。本次把 fork 基线从
`v0.1.0-rc.7+zw.2` 升到 `v0.1.0-rc.8+zw.4`（zw.3 因发布链缺陷作废，见「发布链事故」），桌面随之发
`0.2.0-rc.6`。

## 调查结论（为什么升）

- **Merge 成本极低**：探针实测全树 merge 仅 1 个冲突（`session-persistence-sqlite/tests/sqlite.spec.ts`）。
  上游整文件重写了该 spec（chunk-packing 新测试结构），我们的 fork delta 只有其中一个测试的改写
  （coordinator 并发写守护让旧双 backend 场景走不到 UNIQUE 分支，被迫改成直驱 `appendBatch`）。
  上游新版自带「rejects a stale physical append」等价语义且直驱 `SqliteStore`（不经 coordinator，
  与我们的守护层无交互）——**该文件整体采上游**，fork 语义由自有 coordinator-contract 测试守护。
- **我们的修复无一被上游吸收**：`frontend-static` rc.7→rc.8 零改动（content-length 干净保留）；
  client-modules 的 serveBundle content-length 在 rc.8 里仍是 0 处（fork-only 继续）。
  上游 Discussion #3007 还挂着。10 个 FORK_MODIFIED 包全部继续有效。
- **llm-deepseek 修了 reasoning content 透传**（每回合回传）、SQLite 持久化布局优化（chunk packing、
  写流量大降）、pwsh persistent PTY、LSP seam——都是白捡的。

## 破坏性变更与对策

1. **`dsh web` 默认自动开系统浏览器**（`feat(web,cli): open the ready Web UI by default`）——桌面壳
   spawn sidecar 每次启动会弹浏览器 tab。对策：壳 `spawn_sidecar` 加 `--no-open`（rc.8 新 flag）。
   兼容性：rc.7 CLI 解析器 `allowUnknownOption()`，旧 runtime 对未知 flag 无害且本就不开浏览器——
   壳改动先于 runtime 升级落地也安全。
2. **平台模块表收缩**：rc.8 把 `web-react`/`ui-attachment`/`schema-form` 移出 `PLATFORM_MODULES`
   （改为普通内联库），`schema-form`/`web-react` 包整体改名（ui-renderer/ui-reference/ui-brand-official），
   新增 `PRELOADED_CLIENT_EXTERNALS`（`runtime/client` 解析器预载）与按包 `dsh.client.external`
   声明机制。对策：桥 tsdown 镜像表对齐 rc.8 隐式基线。桥的 client 值引用只有 `ui-primitives`
   （仍在表内），无运行时风险；保留条目恰为 rc.7/rc.8 两表交集，构建产物对两代 runtime 均可解析。
3. **插件锚点全数健在**：`shell.overlay`、`layout.toggleSidebar()`、`workspaces.startSession()`、
   AppFrame.tsx（`nth-child`/`data-sidebar-collapsed` 锚点）rc.8 零改动；Models 设置页仅 CSS 微调
   （我们 revert 的 accessory seat 没进 rc.8，revert 不白做）。`dsh-reasoning-efforts` 契约无恙
   （rc.8 的 pi-ai 变更集中在 compat 开关，不碰 `reasoningEfforts` 声明）。

## 顺带修掉的存量缺口

- **`dsh-tool-cordis` 漏出 FORK_MODIFIED**：zw.2 实发了 10 个包（npm 可查），但 dsh-desktop 的
  `prepare-runtime.mjs` 清单只有 9 个——tool-cordis 的生成目录（api-catalog）随 fork 服务/事件
  漂移，zw.2 起随集发布，runtime 却一直消费 fork-clone tarball 里的同源副本（恰好也是 fork 树，
  行为无差，但违反「fork 修改面走 npm」纪律且 fail-loud 扫描盲区）。本次补进清单。
- **publish-fork 的 `-rc.7` 硬编码**：基线断言写死 `endsWith('-rc.7')`，基线 bump 必炸（注释本就
  预告此场景）。改为 `--base` 可选钉版（workflow 从 zw tag 提取基线传入），无 `--base` 时退化为
  「全集合共享同一基线」漂移检查，保留 fail-loud。
- **`dsh-todo-completion-guard` 版本漂移**：fork 新增包，上游 release bump 碰不到它，版本还钉在
  rc.7——publish-fork 的单一基线断言当场抓住（fail-loud 设计的胜利）。手工对齐 rc.8。

## 环境噪音备忘

本机 Node 25.2.1 import `node:sqlite` 即发 `ExperimentalWarning`，
`session-persistence-sqlite/tests/built-package.spec.ts` 断言 `stderr === ''` 在本机任何树上都会失败
（stock rc.8 worktree 复核：未构建时 skip，构建后同样失败）。上游 CI 钉 Node 24 无此告警。
**这是本地环境噪音，不是 merge 回归**；本地跑该套件时忽略此一项。

## 发布链事故与修复（zw.3 → zw.4）

1. **持久克隆复用炸 checkout**：`prepare-runtime` 的 pack 步骤翻转 tracked manifest 的
   `private` 标记且从不还原，复用 zw.2 克隆时 `git checkout --detach` 拒绝离开脏树。
   修复：`reset --hard <sha>`（同时完成 detach 与清理；untracked 的 SHA 标记幸存）。
2. **vendor 线 workspace 依赖带毒发布（真正让 zw.3 作废的根因）**：`publish-fork` 的
   `rewriteManifest` 把非 fork 的 `workspace:^` 一律改写为 fork 基线版本——但 vendor 线包
   （cordis 4.x、schemastery 3.x、cordis-plugin-* 1.x）在 npm 上有自己的真实版本线。
   于是 `@crazx/dsh-agent-default-model` 声明 `schemastery@^0.1.0-rc.8`、`@crazx/dsh` peer
   依赖 `cordis-plugin-timer@^0.1.0-rc.8`——registry 只有 3.18.1 / 1.1.3，直查即 404。
   **为什么 zw.2 没炸**：runtime 组装时本地 tarball overrides 恰好覆盖了每条带毒边，毒范围
   从未被解析；zw.3 组装时 peer 边（overrides 够不着的路径）第一个撞上。**为什么 standalone
   安装 `@crazx/*` 一直会炸**：npm install 没有 overrides 兜底。修复：改写按**目标包的真实
   workspace 版本**（构建 name→version 全表传入），zw.4 顶替 zw.3。
3. 诊断弯路备忘：`pnpm -r ls --json` 在该克隆里两次返回不一致的包清单（首次查不出 vendor
   包、复跑又正常），差点误判为打包循环缺包——定位 manifest 问题以 npm `view <pkg>
   dependencies` 的发布产物为准，不要只信工作区查询。

## 验证矩阵

- fork：受影响面包测试（1091 通过）+ 全树构建（200 client artifacts）+ `verify-cordis-catalog`
  一致 + publish-fork dry-run（10 包 @ `0.1.0-rc.8.zw.3`）。
- 插件：`pnpm run plugins:check` 全绿（5 包 typecheck/test/build，rc.8 基线）。
- 壳：`cargo check` 通过；`--no-open` 兼容性如上。
- runtime 重组装 + e2e（bundled + 资源解压分支、真实 home 场景）：发版前跑，结果记于发布记录。

## 发版序

1. fork `master` → GitHub（merge + 基线修复 + vendor 依赖改写修复），`v0.1.0-rc.8+zw.4` tag →
   npm-release workflow 发 10 个 `@crazx/*` 包（zw.3 的发布物带毒作废；npm 不支持撤版，消费一律
   钉 `zw.4`+）。✅ 已推送并发布。
2. dsh-desktop `revision.json` → zw.4，`v0.2.0-rc.6` tag → release.yml 签名公证出包。
   （桌面 tag 推送前需用户确认。）
