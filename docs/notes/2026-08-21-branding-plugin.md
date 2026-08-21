# 2026-08-21 · dsh-branding：全端一致的品牌字标插件

## 需求与演进

把侧栏 logo 行的默认字标（ui-sidebar fallback "DSH Local Build" + commit hash 徽标）换成 "Oh My DSH" + "Harness" pill，鲸鱼 mark 不动；不改 harness 源码，插件式修改。

第一版落在 `dsh-desktop-bridge`（桌面门控后注册 `sidebar.brand.name`）。用户随即指出：**web端（终端 `dsh web` / 浏览器打开 sidecar 页面）也要同样的字标**——而桥按契约在非桌面环境零注册，这个关注点从一开始就不属于"桌面门控"。按 AGENTS.md「桥插件不能当容器」，第一版整体迁移为独立插件 `dsh-branding`：**始终挂载、无门控**，desktop 与 web 走同一条代码路径。bridge 源码还原（`git checkout`），不留残迹。

## 为什么是独立插件而非塞进桥

- 桥契约（AGENTS.md）：非桌面环境零副作用。把品牌注册挪到门控之前 = 破坏契约的先例。
- single 槽同 priority 只许一个占位者：若 bridge 与 branding 各注册一次 `sidebar.brand.name`，桌面端两个 fiber 叠挂会撞 "already has a registration"。一个关注点一个插件，天然无冲突。

## 实现（plugin/dsh-branding/，0.1.0）

- **侧栏字标**：ui-sidebar 文档化的部署替换点 `sidebar.brand.name` single 槽（README："A deployment package can replace either value…"）。`BrandWordmark`（`src/client/wordmark.tsx`）= "Oh My DSH"（镜像 `.fallbackBrandName`）+ "Harness" pill（镜像 `.buildRevision`，全 `--dsw-*`/`--ds-font-family-code` token）；鲸鱼 mark 不动（`sidebar.brand.mark` 保留 fallback）。注册经声明感知 `ctx.slots.inject`（激活顺序无关、随 fiber 回收）。
- **浏览器标题**：ui-renderer `DocumentTitle` 的产品名是构建期常量（`DSH_CLIENT_TITLE ?? 'DSH Local Build'`），无插槽口。`installTitleRebrand`（`src/client/title.ts`）以 MutationObserver 把 `<title>` 每次落地的 "DSH Local Build" 重写为 "Oh My DSH"（会话前缀形式同处理）；重写幂等（改写后的标题不含源串，observer 收敛不循环）；disposer 还原。纯函数 `rebrandTitle` 独立可测。
- **形态**：host 半空 apply；浏览器半经 `exports["./client"]` 发现（`dsh.client.inject: [runtime]`）；tsdown 双 entry（ESM host + 闭包 client）复刻 bridge 契约，含纯度门；对 ui-sidebar 仅 type-only import（运行时 0 引用，构建验证）。
- **依赖**：devDeps 全钉 registry（`ui-sidebar@0.1.0-rc.8` 等，无 link: 形态）——其 `declare module` 的 SlotMap 类型合并经 pnpm peer 解析生效，typecheck 通过验证。

## 边界

- macOS 窗口悬浮带标题文本由壳的 `NSWindowTitleVisibility::Hidden` 管理，与本插件无关；本插件只管 `document.title`（浏览器 tab / WKWebView 标题）。
- 若部署构建曾设 `DSH_CLIENT_TITLE`（非默认值），标题重写器不命中——重写器只匹配默认 "DSH Local Build"。当前 runtime 未设（vite.config 的替换逻辑只在构建时注入自定义值时生效）。
- single 槽唯一占位：未来另一插件要占 `sidebar.brand.name` 时需按 priority shadow 或先卸载本插件。

## 安装与验证

- 已装进真实 `~/.dsh/profiles/web`（dependencies link: 到本仓目录 + bundles 列表，`pnpm install`）。
- scratch home 实机验证：boot graph 有 `dsh-branding` 行（rev `60749224d9c8`）、`/plugins/dsh-branding/client.js` 200、bundle 含品牌字样；真实 profile 临时端口（3990）验证同过。
- 测试：`tests/rebrand.test.ts`（node:test，纯函数 5 例）+ `tests/branding.client.spec.tsx`（vitest/jsdom，组件 + 观察器 3 例）；typecheck 绿。

## 分发注意

本插件**不在**壳的 desktop-owned 分发清单（bridge + compaction + Web Search toggle）里：终端/浏览器由本仓 link: 安装；正式桌面安装包要带上它，需按 AGENTS.md「发版」节的纪律同步 prepare-desktop-bundle、Tauri resources、壳安装链并发新 desktop 版本——留待需要时做（当前用户两处都是本机 link:）。
