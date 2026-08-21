# dsh-branding

一个“始终挂载”的 DSH web 插件：把整套品牌字标带到该 profile 服务的**每一个面**——终端 `dsh web`、普通浏览器、桌面壳——同一条代码路径，无桌面门控。

## 行为

- **侧栏字标**：占用 ui-sidebar 文档化的部署替换点 `sidebar.brand.name` single 槽——"DSH Local Build" + commit hash 徽标替换为 **"Oh My DSH"** + 同位小 pill **"Harness"**（复刻 `.fallbackBrandName`/`.buildRevision` 的几何，全 `--dsw-*` 语义 token）。鲸鱼 mark 不动（`sidebar.brand.mark` 保留外壳 fallback）。
- **浏览器标题**：ui-renderer 的 `DocumentTitle` 产品名是构建期常量、无插槽口，插件以 MutationObserver 把标题里每次落地的 "DSH Local Build" 重写为 "Oh My DSH"（会话前缀形式 "session — Oh My DSH" 同样处理）；卸载时还原。

## 安装

```sh
dsh plugin --profile web add <repo>/plugin/dsh-branding
```

或手动：profile `package.json` 的 `dependencies` 加 `"dsh-branding": "link:<本目录>"`，`dsh.profile.bundles` 追加 `"dsh-branding"`，`pnpm install`。

## 形态

- host 半 `src/index.ts` 空 apply（仅让 Loader 行合法）；浏览器半经 `exports["./client"]` 发现。
- 对 `@deepseek-ai/dsh-client-ui-sidebar/client` 仅 type-only import（拉 SlotMap 声明），运行时零引用——跨包协作只走插槽与服务。
- 注册经声明感知的 `ctx.slots.inject`（激活顺序无关、随 fiber 回收）；标题观察器经 `ctx.effect` 可逆安装。

决策记录见仓根 `docs/notes/2026-08-21-branding-plugin.md`。
