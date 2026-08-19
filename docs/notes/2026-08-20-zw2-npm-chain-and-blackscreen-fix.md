# 2026-08-20 · zw.2 发布链路首次全通：npm 消费 + WKWebView 黑屏根因修复

## 黑屏根因（本次修复的缺陷）

`pnpm desktop:dev` 偶发黑屏：host 侧完全健康（webserver 起来、日志干净），webview 页面空白。根因在 `packages/host/frontend-static` 的 `serveStatic`——SPA index（含 `__DSH_BOOT__` 注入）与静态资源响应**全部 chunked（无 content-length）**。WKWebView 对 loopback chunked 响应随机挂死（上游 Discussion #3007 已确认该行为族），挂死 index = boot manifest 都没送达 = 纯黑屏。此前只修了 `/plugins/` bundle 路由，静态路由是同一坑的另一半。

修复（fork `fix/wkwebview-static-content-length`，合入 master）：三条响应路径（index、静态文件、SPA fallback→index）全部显式 `content-length`。

## npm 发布链路首次全通

- fork 侧发布器 `scripts/publish-fork.mjs` + `npm-release.yml` workflow，`v0.1.0-rc.7+zw.2` 标签触发，**10 个 `@crazx/*` 包**发布成功（含 diff 自动推导捕获的 `dsh-host-frontend-static`——手写名单漏了它，发布器比名单准）。
- 踩坑三连（已修）：
  1. workflow tag glob `'v*+zw.*'` 非法（`+` 是量词）→ 放宽 `'v*'` + Resolve 步骤严格校验 `+zw.<N>` 后缀；
  2. `NODE_AUTH_TOKEN` env 单独存在时 npm 不读取 → Publish 步骤显式写 runner `.npmrc`；
  3. 重跑撞已发布版本 E403 → 发布器幂等（registry 已有该版本则 skip）。
- npm token 三换：6 月 granular token 包范围不含新包（404）→ 新 granular token 被 2FA 拦（EOTP）→ **Automation 类型 token**（免 OTP，CI 正解）。secret 已换，两仓就位。

## desktop 侧 npm 消费链切换

`prepare-runtime.mjs`：FORK_MODIFIED 集合的 overrides 从"fork clone 打 tarball"改为 `npm:@crazx/<pkg>@<版本>.zw.<N>`（npm 上不存在时 fail loud），CLI 依赖也走 npm 别名。其余未修改包仍从 clone 打 tarball。组装产物验证：runtime 树内 10 个 `@crazx` zw.2 包全部生效、content-length 修复在发布产物中（grep 命中）。**注意**：FORK_MODIFIED 名单与 fork 的 diff 推导存在漂移风险（本次 frontend-static 就是漏网），后续考虑名单也自动推导。

## 版本与发布

- fork：`v0.1.0-rc.7+zw.2`（npm `0.1.0-rc.7.zw.2` × 10 包）
- desktop：`0.2.0-rc.3`（Cargo.toml/tauri.conf.json 同步 bump；首个走 npm 消费链的 runtime）
- release tag `v0.2.0-rc.3` 已推，流水线跑签名公证版

## 遗留

- `dsh-desktop-bridge`/`dsh-mcp-settings` 迁入 source-deps 受管（npm 纪律的遗留项）
- CI posture 守门（提交态检测 `link:` 即 fail）未做
- upstream Discussion（静态路由 content-length）待提——同 #3007 缺陷族
