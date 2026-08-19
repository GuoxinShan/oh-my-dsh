# DSH 插件行级 UI：slot 方案退役，DOM 注入成为唯一路径

日期：2026-08-19。背景项目：dsh-provider-balance（设置 → 模型页每行供应商配额徽标）。

## 结论

要在 DSH Web 界面里往**别人的页面行内**塞 UI（比如 Models 设置页每个供应商行），有三条路，我们三条都走了，最终落在第三条：

1. **fork 加 slot**（`settings.models.provider`，PR #1）：能用，但让插件依赖 fork 专有源码，上游 harness 上徽标静默消失。维护成本：fork 要持续同步 upstream，槽位补丁每次都可能冲突。**已 revert（ffffaf39）**。
2. **settings.section 兜底**：宿主没槽位时注册一个独立的设置分区页。形态差异太大（页面级 ≠ 行内），被否。
3. **纯插件 DOM 注入**（最终方案，插件 v0.4.0）：MutationObserver 监听页面，在行操作区前插外源容器，把徽标组件经独立 `react-dom/client` root 挂进去。**宿主零改动，上游原版 harness 直接跑**。

## 关键技术事实（下次直接用）

- **冻结模块表有 `react-dom/client`**（`packages/client/web/src/platform.ts` 的 SHARED_SPECIFIERS 还含 `react`、`react/jsx-runtime`、`react-dom`、`@deepseek-ai/dsh-client-ui-primitives` 等）。`__ModuleLoader__` bundle 里 `require('react-dom/client')` 可用 → 注入的 UI 可以挂**真正的 React root**，组件级复用宿主同款组件，像素级一致，不用手写 vanilla DOM 复刻。
- **行→业务实体的稳定映射来自无障碍名，不是 class**：宿主 class 是 hash 的（CSS modules），但编辑按钮 `aria-label` = `编辑 {displayName} ({provider})` / `Edit ...`，路由 id 内嵌其中，双语前缀可枚举。解析不出就不注入；无适配器的行徽标渲染 null，误判零视觉成本。
- **外源容器在宿主 React 树里的存活策略**：只插兄弟节点（绝不改 React 管理的节点内部）；MutationObserver 扫描合并为 50ms 一次；每轮重申容器位置（宿主 reconcile 可能移动子节点）；行消失（按钮 isConnected=false）即卸载对应 root；关闭设置面板后 DOM 零残留。
- **门控（若保留双路径）**：`ctx.slots.spec(key)` 探测声明是否存在；`ctx.slots.inject` 回调在声明生命周期开/关时各跑一次——可做双路径互斥翻转。我们最终删掉了双路径，DOM 注入单路径更简单。

## 踩坑清单（验证环境相关，复用价值高）

- **新版 Chrome `/json/new?url=...` 忽略 URL 参数**：开的标签页停在 about:blank，评估永远是空页面——必须 `Page.navigate`。假阴性害我白查一轮。
- **profile 的 `file:` 依赖是 pnpm 硬链副本**：编辑器原子替换写文件后副本与仓库脱钩，进程一直跑旧代码。开发用 `ln -sfn` 软链替代（`~/.dsh/profiles/web/node_modules/<pkg>`）。
- **`dsh-desktop-bridge` log-sink 的 `logger-latest.log` 软链是排他资源**：同一 DSH_HOME 并发起第二个 web 服务器会 EEXIST 崩树。要么杀掉旧服务器后删残留软链，要么用独立 DSH_HOME。
- **纯净 stock 验证环境搭法**：`git worktree add /tmp/dsh-stock upstream/master --detach` → `pnpm install` → `pnpm run build`（PATH 要带上 npm）→ 独立 DSH_HOME 目录放最小 profile（bundles: `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` + 插件；`web/` 子目录是独立 pnpm 项目，不是 workspace 成员）→ 拷 `settings.yaml` + `.credentials.yaml` 拿真实数据。directory-picker 报缺包时在 `profiles/node_modules/@deepseek-ai/` 手动软链对应源码包。

## 追加：desktop 打包版出现「一行三套徽标」的根因与修法（插件 v0.4.1）

现象：desktop 重新打包后 Models 页每行渲染三套相同徽标，web 端正常（一行一套）。根因：**desktop 的 client-HMR 接收器在插件文件变化时就地重放 apply，但不销毁上一个实例插入的外源 DOM**；fiber dispose 不可靠，apply 几次就叠几套（当天改了三次 → 三套）。教训：**DOM 注入必须幂等，不能假设宿主只 apply 一次**——去重键用「行里是否已有 `[data-dpb-row-seat]` 座位」，而不是本实例 entries 里的按钮元素（实例间 entries 不共享）。存量重复座位需一次整页重载清除；之后无论 HMR 重放多少次都恒为一套。另注意：不要去「回收」别的实例的座位——活实例的 re-assert 会把它插回来，两个活 watcher 会互相拔插打乒乓。

## 流程教训

**兜底 UI 必须保持原形态**——页面级替换（独立分区）不是行内需求的兜底，用户要的是“显示一模一样，只是不改源码”。先明确验收形态再选实现路径。
