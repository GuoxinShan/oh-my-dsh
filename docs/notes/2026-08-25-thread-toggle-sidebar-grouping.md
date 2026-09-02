# Thread：设置开关全局接管 + 侧栏 Thread 分组视图

日期：2026-08-25

状态：已实现（插件侧即启即用；侧栏视图待 fork zw 发布与 runtime 重组装后生效）

## 决策摘要

用户两条指令的落地：(1) 用「设置→通用→Thread」总开关取代专门的 Agent 模式；(2) 侧栏会话列表支持按 Thread 分组。

### 1. 总开关取代 `standard-thread` preset

- **设置状态**：Host gateway 注册 settings 命名空间 `dsh-thread`（schemastery `{ enabled: boolean }`，**默认开**——装了插件即要功能；无 settings 提供方的 headless 组合恒为开）。Client 经 `ctx.settingsScope.bind` 读同一命名空间，镜像推送让所有 UI 即时跟随，无需自写 Remote 方法。
- **工具全局注入**：`dsh-thread/tool` 行从 preset 内部上移到插件 bundle 层（host composition）。tools 注册表是 scope 分层的（root 层对所有 Agent 可见），tool 行在 Host 平面注册即注入每个会话；开关关闭时**动态注销**工具与 prompt section（gateway 的 host 平面 `subscribeEnabled` 驱动），再开即恢复，无需重启。`authorize` 在关闭时直接拒绝（`thread-disabled`），历史交接卡保留摘要但撤掉动作按钮。
- **承接 preset 派生**：`authorize` 不再解析固定 `standard-thread`，改读来源 Session 的 `header.agentPreset`（缺省回落部署默认 preset），stamp 进 Link；`authorizeRequestSchema` 删除 `agentPreset` 字段（Client 不再传），`matchesAuthorization` 的幂等比对不再含 preset（首次授权已 stamp）。工具 guidance/description 同步去掉「Thread 模式」字样。
- **preset 下线**：`~/.dsh/.agent-presets/standard-thread/` 是用户数据，插件不代为删除；代码已不再引用它。该 preset 内仍挂 `dsh-thread/tool` 时与 bundle 层全局注册形成 scope 遮蔽，不冲突，但建议删除该目录。
- **UI 门控**：Header utility、胶囊、侧栏视图都在开关关闭时隐藏/注销（可见性 store 不动，重开即恢复）；设置行本身永远可见（它是开关的家）。

### 2. 侧栏按 Thread 分组

- **fork seam**（`deepseek-harness` fork 的 `ui-workspace`）：新增 `sidebar.workspaces.sessionListView` **list 槽**（root scope、owner 份额为空）——即 `conversation.view` 的视图环惯例：视图选项菜单在内建「按工作区/单列表」之后枚举环内条目（经 inject 面带缓存的 `HostObservable`，`entriesOfSlot` + `resolveSlotLabel`）；选中持久化 `groupBy = view:<条目 id>`（`SessionGroupBy` 扩出 `` `view:${string}` ``，v5 持久化文档兼容）；正文 `renderSlot(..., { only, fallback })` 渲染当选条目，失效模式（插件卸载/关闭）回退 Workspace 分组树，区头标签同样跟随回退。**否决** chain 槽（chain 条目无 id/label 无法枚举）与整体遮蔽 `sidebar.workspaces`（全有或全无、需重实现整个浏览区）。
- **插件视图**：`Thread 分组` 条目（label 即菜单项文案）。连通分量经共享纯函数 `deriveThreadGroups`（union-find；`panel.ts` 重构为消费它，单一事实源）；组头 = 根会话标题 + 计数（点击打开根会话），组内按阶段序（与胶囊一致），组按最新活动倒序；不在任何 Thread 的会话在下方按最近更新平铺。可见性规则镜像 stock（归档隐藏、子代理隐藏、blank 仅当前会话）。行样式全走 `--dsw-*` token，hover 经一次性注入的 4 行 CSS（`dsh-thread-sb-row`）。
- **降级**：旧 runtime 没有该槽声明时 `slots.inject` 永不触发，插件其余功能不受影响。

## 发布次序（fork 面）

1. fork 仓提交 ui-workspace 改动 → `node scripts/publish-fork.mjs` 发 `@crazx/dsh-client-ui-workspace` 等新 zw 层 → 打 `v0.1.1-rc.2+zw.2` 标签。
2. dsh-desktop 仓 `runtime/revision.json` 指到新标签，并把 `@deepseek-ai/dsh-client-ui-workspace` 补进 `scripts/prepare-runtime.mjs` 的 `FORK_MODIFIED`（**不能在发布前补**：名单对当前钉住版本做 npm 存在性 fail-loud 检查，提前补会炸掉现有组装）。
3. 重组装 runtime，桌面壳随之获得侧栏 seam。
4. 插件按 `dsh-thread-v0.2.0-rc.1` 节奏单独发版（Remote 契约已变：authorize 请求不再有 `agentPreset`）。

## 验证

- 插件：`tsc` + 35 个 node:test 全绿（新增 `grouping.test.ts` 5 例；`thread-types` 授权用例改为「请求不带 preset」；`tool-guidance` 跟随新文案）。
- fork：`ui-workspace` tsc + 130 个 vitest 全绿（`workspace-browser.client.spec.tsx` 新增 2 例：菜单枚举插件视图并经 `renderSlot only` 渲染当选条目；失效持久化模式回退 Workspace 树）。测试替身教训：`HostObservable.getSnapshot` 必须引用稳定，每次返回新数组会让 `useSyncExternalStore` 死循环。
- 实机：插件 Host 改动（settings 注册、工具行上移）需重启 `dsh web` 进程生效；Client 改动刷新即生效；侧栏视图在 fork 发布链走完前不出现（静默缺席）。
