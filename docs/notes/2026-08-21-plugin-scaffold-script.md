# 2026-08-21 · new-plugin 脚手架：新插件目录一条命令生成

## 需求

每次写一个 out-of-tree DSH 插件，都要手工复刻一整层样板：`package.json`（`exports` 三件套、`dsh.bundle`/`dsh.client` manifest、peer ranges、devDeps 钉）、`cordis.patch.yml` 行、`tsconfig.json`、`tsdown.config.ts`（client 面还带 ModuleLoader 闭包契约 + 纯度门）、`src/` 骨架、node:test、README，外加根 `.gitignore` 的 `lib/` 行。仓里已有 8 个插件，第 9 个（dsh-model-image-input）仍是纯手工产物（未跟踪态）——样板之间已出现 pnpm 版本、锚策略、manifest 字段三处漂移。要么脚手架一条命令生成，要么每次手抄 + 漂移。

## 方案

`scripts/new-plugin.mjs`（根别名 `pnpm run plugin:new -- <dsh-name>`）：

```
node scripts/new-plugin.mjs <dsh-name> [--face host|client|dual]
                             [--id <rowId>] [--description <text>]
                             [--preset-owned]
```

- **三形态从仓内在售插件蒸馏**，而不是凭空发明模板：
  - `host`：host-only 行，蓝本 `dsh-fs-observation-log`（type-only harness import、零运行时 `@deepseek-ai/*`、erasableSyntaxOnly）；
  - `client`：browser-only surface，蓝本 `dsh-branding`（空 host apply + `exports["./client"]` 浏览器半 + `dsh.client` 声明）；
  - `dual`：双面同包，蓝本 `dsh-web-search-toggle`（client tsdown 契约与 branding 逐字一致，host 骨架同 host 形态）。
  - `--preset-owned`（host 专属）：install-only 空 patch `[]` + `preset-snippet.yml`——行归 agent preset 的 fs-observation-log / compaction-hierarchical 形态。
- **行 id 默认**：host 面 = 包名去 `dsh-` 前缀（fs-observation-log 先例）；client/dual 面 = 完整包名（entry id 兼作 client bundle id，loader 才能服务 `/plugins/<name>/client.js`）。`--id` 可覆盖。
- **devDeps 钉读自蓝本包**：生成时解析 `plugin/dsh-fs-observation-log` / `plugin/dsh-branding` 的 `package.json` devDependencies，fallback 表仅在蓝本缺失时兜底（单点维护在脚本内）。基线 bump（rc.1 → rc.8 → …）时脚手架自动跟随，无需改脚本。
- **根 `.gitignore` 自动追加** `plugin/<name>/lib/`——历史遗漏点（model-image-input 至今没有）。
- 生成 node:test 骨架（断言 name/apply/inject 存在）与 README 骨架（Install/Client half/Config/Design notes 分节）。

## 边界（刻意不做）

- **不代写 roster 行与决策记录**：AGENTS.md 成员清单和 `docs/notes/` 需要人类/agent 的散文判断，脚本只在收尾 checklist 里提示（含决策记录的日期文件名）。
- **不跑 `pnpm install`**：保持脚手架零副作用、可离线；下一步命令由收尾清单给出（install → typecheck → build → test）。
- **不生成 vitest/jsdom 链**：模板只带 node:test；需要 DOM 组件测试时按 branding/web-search-toggle 的先例自行加（`vitest.config.ts` + jsdom devDeps），避免给 host-only 插件塞无用依赖。
- **不碰 prepare-desktop-bundle / Tauri resources**：桌面分发链是显式契约（AGENTS.md「发版」），必须人工同 PR 更新，脚手架不得给出"已接好"的错觉。

## 防御

- 名字必须 `^dsh-[a-z][a-z0-9-]*[a-z0-9]$`（目录名 === 未加 scope 包名的仓规前置强制）；
- 目标目录已存在即拒绝（脚手架永不覆盖）；
- `--face` 枚举校验；`--preset-owned` 只许配 `host`；
- 模板输出前自检：恰一个行尾换行、无连续空行（write 前断言）。

## 验证

- 四个冒烟包（host / client / dual / host+preset-owned）经脚本生成后各自走 `pnpm install → typecheck → build → test` 全绿（typecheck 依赖 registry devDeps 解析，tsdown 产物含 client 面的 `window.__ModuleLoader__.load` 闭包与纯度门）。
- client 形态的 tsdown 产物与 `dsh-branding` 的归一化 diff 仅剩注释措辞（externals/banner/footer/纯度门逐字一致）。
- 防御路径（坏名字 / 重复目录 / 坏 face / preset-owned+client）exit 1 且报错可读。

## 文档落点

- AGENTS.md「插件 monorepo 规范·落点」首条：新插件目录一律经脚手架生成，手搓 manifest 禁止；Commands 区新增 `plugin:new` 条目。Agent（人类同理）读 AGENTS.md 即可发现该命令——仓内事实上的唯一入口文档。
- 本决策记录住 `docs/notes/`（仓根），不跟包走。
