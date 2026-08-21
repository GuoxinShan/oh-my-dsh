# dsh-fs-observation-log：跨进程修复 fs-observation-policy 的「失忆」

日期：2026-08-21
包：`plugin/dsh-fs-observation-log` 0.1.0

## 问题

`edit requires reading "<path>" first — read the file, then retry` 频繁误伤。机理（读上游源码定案，非猜测）：

- `@deepseek-ai/dsh-fs-observation-policy` 把观察态存 `WeakMap<session 对象, …>`——纯内存、进程级。README 明确列为 deferred limitation："Observed state does not survive a session resume"。
- 会话 transcript 却持久。桌面**每次启动 spawn 新 sidecar**，会话 resume 进新进程；`subagent_fork` 继承父 transcript 但观察态按 session 对象隔离。模型看自己的历史「我读过/刚改过」，无法感知进程边界 → 撞 `FS_NOT_OBSERVED`（edit 一律硬拒）。
- 对模型不可证伪：`tool:edit` 提示写 "unless you just created or edited it in this session"，resume/fork 后模型确实「刚改过」，提示词层修不掉。每次误伤 = 一个纯浪费的 read+retry 往返。

官方 discussions 调研（gh，aka-danielZhang）：fork 维度已有 #275（症状）与 #450（机理分析，无人回应）；**resume/重启维度无任何讨论**。#2148/#2509/#3153 是相邻但不同的问题（bash 读不计观察、结构化 remediation）。

## 方案：出树插件（不动 fork）

之所以不做 fork 补丁：`fs-observation-policy` 刻意无状态、刻意把 session 当不透明 key；在它内部持久化要动 FORK_MODIFIED + zw 发版仪式，而公开事件面已经足够外科手术式修复。

两条公开契约（无任何私有 API）：

1. `fs/observed`（emit，unscoped）——观察记录的出口。policy 自己监听它记 WeakMap；我们也监听，把 `{targetKey, version}` 追加进 `$DSH_HOME/fs-observation-log/<session>.jsonl`（首行 header 带 fork parent，构成自包含血缘链）。
2. `tools/pre-execute`（scoped waterfall，preset 纤维可收）——恢复入口。edit/write 前置：内存镜像证明本进程未观察过 → 查血缘 evidence → `ctx.fs.stat` 活文件 → **版本 token 逐字节相等才补发 `present`**。policy 照常记录、edit 走正常 CAS。

不削弱任何 guard：文件变了（token 不等）/没了（stat miss）/从没观察过（无 evidence）→ 什么都不做，照旧要求 read。`FS_STALE_VERSION`、唯一匹配、sandbox 栈全不动。policy 缺席时插件惰性（无条件 edit 本就不需要观察）。

版本 token 跨进程稳定是修复成立的前提，已核实：本地后端 `dev:ino:size:mtimeNs:ctimeNs`（`fs-local/src/fsio.ts`），未变文件 token 不变。

## 关键决策

- **零 harness 运行时依赖**：所有 `@deepseek-ai/*` import 一律 type-only（构建后 grep 为零），不进 externals 也不给模块实例分裂留门（mcp-settings/web-search-toggle 那一类的教训）。config 校验手写而非 schemastery，同理。
- **挂 preset 平面（agent.cordis.yml 一行），patch 刻意为空**：同 `dsh-thread/tool` 模式。`tools/pre-execute` 是 scoped 事件（按 agent 路由），preset 纤维收得到；`fs/observed` unscoped 冒泡可达 host 侧 policy。不发布任何服务 → 无 realm 需求。
- **evidence 只做参考，不做授权**：sidecar 丢失/损坏/过期的最坏后果 = 回到无插件现状（要求一次 read），永不放大权限。恢复路径每次都对着活 provider 重验。
- **fork 血缘继承**：fork 的 transcript 含父辈全部 read 结果，语义上继承 evidence 是精确的（不多不少）。做成 config（`inheritFork`，默认开）。血缘链自包含在 sidecar header 里（parent 一跳一跳走），深度上限 + 环检测。
- **fail-soft 写盘**：连续 `maxWriteFailures` 次写失败自闭（内存镜像继续服务本进程愈合）；compaction 保留最新一半（header 保留），`at` 每会话严格单调递增防同毫秒排序退化（首版测试踩中：同毫秒 5 条记录把「最新一半」退化成插入序，留下了最旧的一半）。
- **隐私**：sidecar 只记 realpath、display path、version token、时间戳。绝不记内容。目录可随时手删。

## 验证

- 单测（node:test）：config 校验、heal 判定全分支（live-observed/no-evidence/target-absent/version-changed/restore）、lineage（继承/禁用/深度/环/坏 header）、store（重启复活、血缘、compaction、损坏容忍、fail-soft）。
- **集成测试**（`tests/integration.test.ts`，比 boot-graph 冒烟强得多）：真实 `dsh-fs-local` + stock `dsh-fs-observation-policy` + `dsh-tool-fs` + `ToolRuntime`/`SystemPrompt` 组装真实 Cordis Context，两个独立 context + 同一 `DSH_HOME` 模拟进程重启——重启后未变文件 edit 成功恢复；文件被外部改动仍拒绝；fork 子会话经血缘继承恢复；从未观察照旧拒绝。
- 集成测试首跑抓到一个真 bug：heal 路径最初有「store mirror 命中即跳过」的快速通道——mirror 反映的是**持久 sidecar** 而非 stock policy 的内存 WeakMap，新进程 mirror 非空但 policy 为空，同 session id 重启场景被误放行（fork 场景恰好绕过）。已删除该短路，统一走 stat+版本 token 比对（本地 stat 极廉价，重发 `fs/observed` 幂等）。教训：**任何「policy 是否已持有」的推断都不能建立在跨进程持久的数据上**。
- typecheck + tsdown build 通过；产物 15.5kB，`@deepseek-ai` 运行时 import 为 0。
- 真实 profile 登记：`~/.dsh/profiles/web`（runtime pnpm 10 装依赖——profile store 是 v10，shell pnpm 11 会撞 `ERR_PNPM_UNEXPECTED_STORE`）+ bundles 清单登记（空 patch，同 compaction 先例）+ `standard-thread` preset filesystem 段加行。当前运行中的进程不热载 preset 行，下一次桌面/终端重启生效。

## 上游反馈

- 新 discussion（Ideas）：resume/重启维度 + 本插件的设计（evidence log + 版本重验 + 事件面恢复），附机理证据。
- #450 补评论：fork 之外还有重启面，提供实测与插件侧修法。

上游若采纳（observation 持久化或 session-log 重放），本插件可直接退役——它只消费公开事件，不占任何 slot。
