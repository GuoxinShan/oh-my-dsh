# 2026-08-20 · rc.4/rc.5 三连修：runtime 解析优先级 + pnpm 别名盲区 + 插件契约

## 黑屏第二幕：修复在场但没被用（三层连环）

rc.3 装机后仍黑屏。逐层钻取后发现修复其实都在，但**没有一条走到实际加载路径**：

1. **pnpm `npm:` 别名 override 的覆盖盲区**：fork 集合的 overrides 对**普通依赖边**生效（web-app→crazx ✅），但 **`.pnpm/node_modules` 的 hoist 兜底与 peer 解析不受别名约束**——上游新发的 `0.1.0-rc.8` 匹配 `^0.1.0-rc.7` range，组合行加载 `dsh-client-modules` 恰好走根级解析 → 绑到官方 rc.8（无 content-length 修复）→ bundle 路由 chunked → 黑屏。**修**：FORK_MODIFIED 集合作为 runtime manifest 的**直接依赖**（直接依赖必然解析别名，hoist/peer 随之绑定 crazx 副本）；组装后新增 fail-loud 扫描——任何 fork 包在树里残留官方 registry 副本即中止。
2. **壳的 resources 泄漏（dev）**：`tauri dev` 把 `resource_dir()` 解析到仓库里上次 `desktop:build` 残留的 `src-tauri/resources/` → 命中 release 分支 → 优先用 `~/.dsh-desktop` 解压树（旧组装）→ 刚修的 runtime/build 被跳过。**修**：`release_runtime_dir` 加 `cfg!(debug_assertions)` 守卫——dev 构建永不消费 resources/解压树；release 不受影响（.app 内无 repo checkout，resources 命中照旧）。
3. **解压树不自愈**：内容寻址 `.ok` 标记同 sha 复用旧树——同 sha 重组装（修 bug 不动 revision）后旧解压树不会被替换。运维口径：bump revision 或手动删 `~/.dsh-desktop/runtime/<sha>`。

验证方式沉淀：**curl 探测两条路由的响应头**（`/` 与 `/plugins/<pkg>/client.js` 必须都带 `content-length`）比看窗口快且客观；`-D-` 全量头里 `Transfer-Encoding: chunked` 即未修复。

## dsh-web-search-toggle 三处契约修复

1. **client 入口缺 `inject`**：`async apply` 开头 `await ctx.remote.$mount(...)`，但没声明 `inject = ['slots','locale','connection','remote','settingsScope']`——fiber 在 remote 服务到位前执行 apply，`ctx.remote` 读取抛 `cannot get property "remote" without inject`，整个插件行失败。**对照 mcp-settings（同款模式先例）它有这行**。教训：抄模式要抄全，client 入口的 inject 声明是 async-apply 的前置条件。
2. **Typert Remote 手写 descriptor 的参数契约**：gateway 的调用元数检查与 wire `args` 映射**从 `parameters` 列表推导**——`set` 收一个参数就必须声明 `{ name, wire, source:'json', codec }`，空列表 → `expected 0 argument(s), got 1`；且 generated Remote 全链路要求 **strict codec**（带 zod schema），`src-json` 只给源码生成模式 → `field "params" has no strict codec`。
3. **UI 重画**：裸 inline style → CSS Modules（tsdown 内联 style 标签，mcp-settings 的 lightningcss 管线）+ `css-modules.d.ts` shim + tsconfig include 补 `src/**/*.d.ts`。设计语言：AppearanceRow 的行解剖（16px/0 padding、gap 8、hairline）+ mcp-settings 的 32×18 switch（`--dsw-alias-state-business-primary`、120ms 过渡）+ 状态 pill（success/warning token）。**通用设置页新行应照这两个包的词汇表画，不要裸 inline style。**

## 其他

- `dsh plugin add` 的插件装进的是 **web profile**（`~/.dsh/profiles/web`），装完必须重启壳才加载（dev 壳也一样）；host-only 插件不在浏览器 boot graph 里是正常的，验证走 settings.yaml 实效。
- reasoning-efforts 在真实 home 生效验证：grok 模型 17+ 处 `reasoningEfforts` 自动填充。
- 发布 npm 后 registry CDN 索引有分钟级传播延迟，`npm view` MISSING 不等于发布失败，间隔轮询再判。
