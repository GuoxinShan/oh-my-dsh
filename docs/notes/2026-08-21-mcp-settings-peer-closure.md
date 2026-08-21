# 2026-08-21 · mcp-settings 基线 bump 后启动即崩：registry posture 的传递 peer 闭包没补齐

## 症状

- 桌面 app（0.2.0-rc.13，runtime v0.1.1-rc.1+zw.1）启动后 UI 报 `Failed to load plugins: failed to import loader entry … (@deepseek-ai/dsh-session-log-export): client-modules: bundle script /plugins/… failed to load`——被点名的插件是无辜的下游症状。
- 真实死因在 `~/.dsh/logs/desktop-20260821-200601.log`：host 侧整棵插件树加载崩溃，`Cannot find package '@deepseek-ai/dsh-subprocess' imported from plugin/dsh-mcp-settings/node_modules/.pnpm/@deepseek-ai+dsh-mcp-client@0.1.1-rc.1_…/lib/index.js`，进程 exit。webview 已拿到的 index 与 in-flight 的 bundle 拉取跟着失败，UI 恰好报了 session-log-export 那条。用 `~/.dsh-desktop/runtime/751aafc…` 手动 boot 可稳定复现。
- 排查小坑：`ls ~/.dsh/logs | tail` 会把按字母序排在前面的 `desktop-*` 截掉，别据此误判「没有 sidecar 日志」。

## 根因

- bump 前插件的 node_modules 处于 link:source 调试 posture（devDeps → `link:../deepseek-harness/…`），peer 全从 checkout workspace 解析；00d67fb 把 devDeps 切回 registry 钉版并重装后，从未显式声明过的传递静态 import peer 不再被物化。
- 闭包共 6 个：`dsh-mcp-client@0.1.1-rc.1` 静态 import `dsh-attachment`/`dsh-subprocess`/`dsh-tools`；`dsh-tools` 又静态 import `dsh-llm`/`dsh-scope`/`dsh-session`。只补第一层 boot 仍会炸。
- 三道防线全部漏放：插件 workspace.yaml 一直 `autoInstallPeers: false`（刻意，与 runtime 组装同理），pnpm 对未满足 peer 仅 WARN；vitest 经 tsconfig project references 在源码 posture 解析（AGENTS.md 已记的遗留），测试全绿；release e2e 跑干净 home，测不出真实 home 的 link: profile。
- 机制面：Node bare import 从发起文件的真实路径逐级上溯，runtime 树不是插件目录的祖先——link: 插件只能靠自己的 node_modules。壳只对 bridge/compaction（desktop-owned、tarball 分发）做「链到 runtime 树同一 physical package」，不替用户插件管依赖（契约：壳不含插件业务；混链正是模块实例分裂的温床）。

## 修

- devDeps 补齐 6 个官方钉版 `0.1.1-rc.1`（六个包均不在 fork 修改面，官方钉版即正确姿势）。补货清单用「从 host 入口出发的静态 import 传递闭包」计算；`pnpm peers check` 的缺失清单含大量非静态路径的假阳性（dsh-brand/invariants/agent/code-runtime/system-prompt/user-approval 等），不能直接当清单用。
- 验证：home 解压树 boot `dsh web`——index 200、原失败 URL 200、进程持续存活；vitest 59/59。
- 不发版：壳不携带 mcp-settings，桌面无需新 Release；插件发布产物 `lib/` 未变，本修复只影响 dev/link: 姿态，无 tag/npm 必要。

## 遗留

- manager 行可跑，但 MCP server 仍报 "no credentials service is mounted"——link: 插件 cordis 实例分裂的已知残留（8/19 起即有，非本次回归）；正解仍是迁入 source-deps.mjs 受管。
- npm 上 `dsh-mcp-settings@0.2.4` 发布元数据带着 `link:../deepseek-harness/…` devDeps（源码 posture 发版，违反 npm 纪律）——npm channel workflow 需核查（疑似 build 前进入 link:source 姿态、publish 前未恢复）。
- 基线 bump 的防回归判据：bump 后必须在装配 runtime 下真 boot 一次真实 home 的 profile（或带 link: 插件的 scratch 副本）；vitest 绿 ≠ 能启动。
