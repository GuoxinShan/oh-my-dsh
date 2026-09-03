# dsh-thread 0.2.0-rc.5：对齐 0.1.2-alpha.3 的 Session 创建通道（connection.api 移除）

## 背景与故障

2026-09-02 桌面运行时升到 fork `v0.1.2-alpha.3+zw.2` 后，Thread 卡片点击「在 Thread 中继续」报
`Cannot read properties of undefined (reading 'sessions')`。

根因：上游 0.1.2 把浏览器端 `ctx.connection` 的 `.api` 门面整体移除（`ConnectionHandle` 只剩
`isLoopback / generation / state / rpc / reconnect / start`），Session 创建/改名迁到 typed Remote
命名空间 `ctx.remote.session.create / rename`；`dsh-client-runtime` 包同时下线，`ClientContext`、
`ISessions`、`SettingsScope`、slots 标准 props 的 `useSessions`/`sessionId` 合并全部改换宿主包。
dsh-thread rc.4 的 devDeps 仍钉 0.1.1-rc.2，typecheck 对着旧类型世界全绿，于是这个破坏性变更
漏过了编译期，直到运行时才以 TypeError 炸出（peer range `>=0.1.0-rc.8 <1` 不挡 0.1.2-alpha.3）。

故障现场：Host 侧 `authorize`/`beginCreation` 已落盘（Link 进 `creating`），TypeError 发生在
`connection.api.sessions.create` 之前，目标会话从未创建、无孤儿残留。但 Link 卡在 `creating`
后该草稿被 `creation-in-flight` 楔死（重试换新 actionId 被拒），需手工从
`~/.dsh/storages/dsh_thread.json` 删除卡住的 Link 行才能重试。

## 决策

1. **创建/改名走 `ctx.remote.session.*`**（`@deepseek-ai/dsh-api-session-controller/remote` 的
   生成命名空间），不走新的 outward `ctx.sessions.create()`——后者签名
   `{workspaceId, cwd, sessionId}` 仍不接受 `agentPreset`，而「承接会话继承来源 preset」是
   Thread 0.2.0 的既定契约。Remote 的 `SessionCreateRequest` 保留 `agentPreset` 字段，语义不变。
2. **devDeps 全面对齐 0.1.2-alpha.3 基线**，让 typecheck 重新成为运行时契约的诚守门员：
   - fork 修改面 `dsh-api-session-controller` 按 npm 依赖纪律走
     `npm:@crazx/dsh-api-session-controller@0.1.2-alpha.3.zw.2` 别名；
   - 删除已下线的 `dsh-client-runtime`、不再使用的 `dsh-client-connection`；
   - 补全类型闭包（`dsh-client-store`、`dsh-subagent`、`dsh-api-remotes` 等 20 余个）——
     `@crazx/dsh-api-session-controller` 的 `.d.ts` 引用这些包但它们不是任何包的正常依赖，
     不显式钉版会被 pnpm 自动 peer 安装拖入 0.1.0-rc.8/0.1.1-rc.2 的旧副本，
     造成两份 `Context.remote` 声明冲突、类型静默塌缩成 any（skipLibCheck 挡住了报错）。
3. **类型新家**：`ISessions`/`SessionListState` → `dsh-api-session-controller/client`；
   `SettingsScope` → `dsh-client-ui-settings/client`；`useSessions`/`sessionId` 的
   `GlobalStandardProps`/`SessionStandardProps` 合并 → `dsh-client-ui-session/client`；
   `ctx.slots` 增强 → `dsh-client-ui-renderer/client`；`ClientContext` 不再需要，
   直接用 cordis `Context`。
4. `dsh.client.inject` 与 peerDependencies 同步更新（去掉两个下线包，加入
   api-gateway / api-session-controller / ui-renderer / ui-session）。
5. apply 时对 `ctx.remote.session` 做存在性探测，缺失即 fail loud（旧运行时上装新版
   会立刻得到可读错误，而不是 undefined TypeError）。

## 影响面

- 只改 client 半的创建链路与类型进口；Host 半（gateway/tool/domain）零改动——今天的故障
  证明 Host 面在 0.1.2 上行为完好。
- 桌面 shipped 清单不变（thread.tar.gz 随 rc.5）；用户侧可见变化仅为「在 Thread 中继续」
  恢复可用。
- 其余插件（branding、send-while-running、model-image-input、model-efforts-editor、bridge）
  的 devDeps 仍钉 0.1.1-rc.2：它们只用稳定的 ctx 服务面孔，运行时未破；统一升基线是
  独立后续项，不在本 PR。
