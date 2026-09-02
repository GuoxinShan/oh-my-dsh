# 2026-09-02 · 随包插件一份清单 + packaged dump-config 门

## 需求

rc.24 把 `dsh-thread` 打进 `.app` 并切面 `plugin add`，CI 仍绿：workflow 只 typecheck 三个老插件，且永远在「已 `pnpm install` 的源码树」里跑。用户看到的是解压后的 tarball（无 `node_modules`）对着钉死的 runtime 真 import——缺 `zod`、以及 0.1.2 已删的 `settingsNamespace` 导出，sidecar 直接 exit 1。

每加一个插件再改一回 `ci.yml` / `prepare-desktop-bundle.mjs` / `plugins.ts` peer 表，下一次还会漏。

## 方案

1. **一份发货声明**：`package.json` 的 `dsh.desktop.ship: true`（可选 `tarball` / `dest` / `env` / `pin`）。`scripts/shipped-plugins.mjs` 是唯一扫描点。
2. **链接从 package.json 推**：`dependencies` 必须在 assembled runtime 里能链上，否则 fail loud；`peerDependencies` 缺了（已删的 `dsh-client-runtime`）跳过。不再手写 `THREAD_RUNTIME_PEERS`。
3. **一条冒烟**：`scripts/smoke-packaged-profile.mjs` 打出发货同款 tarball、解压、按上条链接、**import 每个 host `lib/*.js`**（`--dump-config` 只组合 YAML，拦不住缺 zod / 已删导出）、`plugin add` 进空 `DSH_HOME`，再对钉死 runtime 跑 `--dump-config`。`prepare-desktop-bundle` 默认跑它（`DSH_DESKTOP_SKIP_SMOKE=1` 可跳过本地迭代）。CI 的 `packaged-smoke` job 与 `pnpm desktop:smoke` 是同一条。
4. **脚手架**：`plugin:new --ship` 写上 `dsh.desktop.ship`。不要改 workflow。

`dsh-branding` / `dsh-mcp-settings` 等不标 `ship` 的包仍是可选 catalog，切面不会自动装。

## 同 PR

`dsh-thread` host 不再值导入 `settingsNamespace`（0.1.2 已删）；`register` 吃合法字符串，与 `dsh-web-search-toggle` 0.1.4 同一姿势。
