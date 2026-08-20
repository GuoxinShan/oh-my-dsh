# 2026-08-20 · npm 依赖纪律：源码依赖降级为显式调试 posture

## 背景

用户决策：后续 fork harness 的任何插件/能力若基于源码修订，必须**明确依赖 fork 发布的具体 npm 版本**，不得依赖源码；该纪律同时写进 fork 仓（FORK.md）与本仓（AGENTS.md）。收紧一档后的最终形态：**npm 依赖是唯一常态；源码依赖仅限本地调试，且必须经专门命令进出**。

## 事实核查（决策依据）

- 上游 `@deepseek-ai` scope 在公共 npm（`@deepseek-ai/dsh@0.1.0-rc.7` 可拉，含 `lib/types`）→ 未修改包今天就能走 registry。
- `@deepseek-ai` scope 归官方所有，fork 无法以原名 publish → fork 修改面包需换自有 scope，安装侧用 `pnpm.overrides` 的 `npm:<scope>/<pkg>@<ver>` 别名（对任意 registry 通用）。
- **npm 版本不能用 build metadata**（`0.1.0-rc.7+zw.1`）：npm 视 build metadata 不参与版本序，同版本无法重发，zw 层一多即堵死 → npm 版本用预发布段 `<上游版本>.zw.<N>`（例 `0.1.0-rc.7.zw.1`）。git 标签维持 `v<基线>+zw.<N>`（revision.json 钉 ref 字符串，不受影响）。
- fork 真实改动面（`git diff upstream/master..master --name-only` 排除 docs/tests）：`dsh-client-modules`、`dsh-client-ui-model-selection`、`dsh-agent-default-model`、`dsh-tool-cordis`、`dsh-todo-completion-guard`（fork 新增包）、`dsh-host-apiproxy`、`dsh-mcp-client`、`dsh-session-persistence`、CLI `dsh`。原 `FORK_MODIFIED` 名单里 `dsh-client-ui-settings-models` 在 ffffaf39 revert 后已过期。
- npm 未登录（E401）——首个 fork 包发布前的账号/scope 决策挂起；期间插件依赖暂以官方版本 + fork runtime 兜底。

## 落地内容

1. **fork 仓 FORK.md** 新增「发布纪律（npm 是唯一分发形态）」节：改名换 scope、`zw.N` 预发布段版本、改动面即发布面、下游源码依赖仅限显式调试、未修改包不重发。
2. **本仓 AGENTS.md**：
   - 新增「npm 依赖纪律」一节（默认 registry / 调试 link:source / 禁止事项 / 遗留迁移——bridge 与 mcp-settings 待迁入受管）。
   - 「迁入既有插件仓」的值依赖条目改写为 npm 常态表述。
   - 「发版」安装面与「运行时分发决策」开头不再说「不发 npm」——runtime **整树**仍不发 npm（自包含安装产物），但对 fork 修改面的消费走 npm。
   - Commands 补 `link:source` / `unlink:source`。
3. **`scripts/source-deps.mjs`**（新）：posture 切换器——`link` 把受管插件的 `@deepseek-ai/*` devDeps 重写为 `link:../deepseek-harness/<subpath>` 并重装，`unlink` 恢复 registry 版本；映射表（registry 版本 ↔ 源码子路径）单点维护在脚本内；锚缺失 fail loud；link 后打印「不可提交」警示。根 package.json 注册 `link:source` / `unlink:source`。
4. **两个新插件切 registry**：`dsh-reasoning-efforts`、`dsh-web-search-toggle` 的 devDeps 全部钉 registry 版本（cordis 4.0.1 / timer 1.1.3 / dsh-* 0.1.0-rc.7），`dsh-reasoning-efforts` 的 `dsh` 锚删除。
5. **`prepare-runtime.mjs` FORK_MODIFIED 校正**：删过期 `dsh-client-ui-settings-models`，补 `dsh-session-persistence`、`dsh-todo-completion-guard`、`dsh`，注释指向 FORK.md 为事实源。

## 验证

- 两插件 registry posture：typecheck + 全部单测（9+10）+ build 全绿。
- 往返验证：`link:source` → 源码 posture typecheck 通过 → `unlink:source` → registry 恢复、双插件 typecheck 复绿。

## 待办（后续 PR）

- bridge / mcp-settings 迁入 source-deps 受管，删各自 setup 锚。
- 首个 fork 包的 npm scope 决策 + 发布流水线（fork 仓内）；发布后本仓对应依赖从「官方版本兜底」切自有 scope 版本。
- CI 增加 posture 守门（检测提交态含 `link:` 即 fail）。
