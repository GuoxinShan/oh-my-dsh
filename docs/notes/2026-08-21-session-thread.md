# Session Thread：跨 Agent 会话交接

日期：2026-08-21

状态：核心链路与会话内 Thread 胶囊已实现；直接确认后的完整用户旅程待继续实机回归

## 决策摘要

Thread 描述普通会话之间的承接关系。用户不创建 Thread 对象；当“在 Thread 中继续”的交接已提交到另一个普通会话时，关系自然形成。首条 Link 由根 Session ID 确定性派生稳定 `threadId`，后续从连通 Session 发起的 Link 自动继承；它是关系元数据而非用户容器。中文界面保留英文产品名 Thread，不再使用“脉络”。

每个会话继续保持单一工作类型、单一 Agent preset 和单一主要产物。Thread 只传递经过用户确认的有限交接，不复制完整历史，不实时共享可变上下文，也不改变工作区分组和单列表的排序语义。

Thread 的承接会话是新的普通顶层 Session + Agent：无 seed、无 `parentSession`、无 `seedLength`，固定运行用户 preset `standard-thread`（显示名“Thread 模式”）。现有 Fork 继续表示“复制稳定历史前缀并继承原能力”；Subagent 继续表示由父 Agent 驱动和拥有的委派运行，两者均不承担 Thread 语义。

只有直接 Client 确认可以调用现有 `session.create` 和 `activateContinuation()`，随后导航到承接会话。模型 Tool 只能持久化无副作用的结构化 Draft；Cordis lifecycle listener 只能重建已持久化关系与 Inbox 状态，不能创建、投递、唤醒或推断用户意图。

能力以独立 `dsh-thread` 双面插件交付，不进入 `dsh-desktop-bridge`，不依赖 Tauri，也不修改 Harness 源码。共享关系和承接 saga 属于 Host composition；模型 Tool 属于 Agent preset；Web 交互属于 Client composition。Host 从 `workspaceRegistry` 权威解析来源 Session membership，把 exact `workspaceId`（未分组来源则为 exact `cwd`）写入不可变 Link/create plan；Client 确认后把该 plan 原样交给现有 `connection.api.sessions.create`，因此模型默认值、Workspace attach 和 Agent ownership 继续由普通会话创建链负责。

## 问题

用户常以一个会话完成一种思考和一种产物，例如技术预研、交互原型、代码实现或评审。这样可以让系统提示、工具集和上下文保持集中，但这些会话往往服务于同一个最终意图，并且后续工作依赖前序结论。

当前选择都不完整：继续原会话会混合不同 preset 和工具；新建普通会话会丢失前序结论；Fork 会复制稳定历史前缀并要求能力兼容；Subagent 是运行时委派而非用户长期导航；显式 Goal/项目分组又给一句话开始的工作增加了不必要的管理动作。

问题不是“会话太多”，而是 Harness 缺少一种受控的跨会话交接：保持执行环境隔离，同时让来源、输入和结果可追溯。

## 目标

- 用户从一句普通对话开始，不需要先创建 Goal、项目或 Thread。
- 用户可以从当前会话或一个已完成回合启动固定使用 Thread 模式的承接会话。
- 目标 Agent 只收到用户确认的交接摘要、引用和下一步指令，不收到父会话系统提示、Tool schema 或完整聊天历史。
- 完整 Thread 关系在会话 Header 右侧 utility 打开的对话栏内大胶囊中可见、可导航；不占用系统 `details` 列，也不改变既有工作区/单列表投影或普通行 DOM。
- 关系、草稿和投递状态跨进程重启持久化；模型可见交接进入标准 Session 日志并可重放。
- UI 与模型 Tool 共享一个 Thread Service 的 Draft/Link 语义；只有 Client 确认路径调用普通 `session.create`。
- 插件停用后普通 Session 仍可恢复，不因下游自定义事件变成不可读日志。

## 非目标

- 不提供所有相关会话实时共享的全局记忆。
- 不自动把来源会话新增内容同步到后续会话。
- 不在用户未确认时根据意图推断自动切换 Agent 或创建会话。
- 不替代 Goal、Workflow、Subagent、Fork 或 Workspace。
- 不把 Thread 做成工作区下的第二层持久分组，也不建立任意深度的侧栏树。
- v1 不支持把两个既有脉络合并，也不支持一个承接会话拥有多个 membership 来源。

## 术语与用户心智

| 概念 | 含义 | 用户是否显式创建 |
|---|---|---|
| Session / 会话 | 一次专用 Agent 工作环境及其日志 | 是，沿用现有行为 |
| Thread | 由承接链接连通的一组普通会话 | 否，第一次承接时自然形成 |
| Handoff / 交接 | 从来源会话提炼出的有界、不可变输入 | 用户确认后生效 |
| Continuation / 承接 | 从一个稳定来源点启动新的普通会话 | 是，通过“在新会话继续” |
| Delivery / 投递 | 交接、补充上下文或结果回传的一次定向传递 | 是，显式触发 |

界面使用“Thread”作为关系视图名称，使用“来源”“当前”“后续”描述位置，使用“在 Thread 中继续”描述动作。界面不出现“创建 Thread”“加入 Thread”或“管理 Thread”。

内部模型把 Session 当作节点，把 Continuation Link 当作边。Thread 是连通分量，不是另一个必须维护的容器节点。

## 与现有概念的边界

| 能力 | 历史 | preset | 生命周期所有者 | 适用场景 |
|---|---|---|---|---|
| Fork | 复制来源稳定前缀 | 继承来源 preset | 普通会话 | 同能力下探索另一条思路 |
| Thread | 不复制；只投递有限交接 | 固定 Thread 模式 | 普通会话创建平面 | 不同工作类型之间承接 |
| Subagent | 由父任务提供 prompt/context | 由 provider 决定或继承 | 父 Agent/Provider | Agent 自主委派子任务 |
| Workflow | 由脚本和阶段组织 | 每个 worker 独立 | Workflow runtime | 预定义或大规模自动编排 |
| Goal | 在一个会话内持续自动推进目标 | 当前会话 preset | Goal driver | 同一会话的长时间自主执行 |

Thread 不复用 `SessionHeader.parentSession`。该字段属于 seed/fork lineage；给无 seed 的承接会话写入它会让持久化和 UI 对历史来源作出错误解释。

## 承接会话触发权

| 入口 | 能否启动承接会话 | 原因 |
|---|---|---|
| Header“在新会话继续” | 用户确认后可以 | 直接的 Client 人类操作 |
| 已完成 Assistant 消息 Action | 用户确认后可以 | 用户选择了一条来源消息，Host 再解析稳定回合 |
| `thread_handoff` Tool | 不可以 | 模型只能准备无副作用 Draft；Card 本身负责询问用户 |
| Tool Card“在 Thread 中继续”按钮 | 用户确认后可以 | Card 按钮是直接 Client 操作 |
| `agent/session-start` listener | 不可以 | 只重建目标 published/resumed 与 Inbox 状态，不投递或唤醒 |
| `agent/turn-stopping` 等 listener | 不可以 | 不根据模型行为猜测用户要切换会话 |

这里的授权边界只约束 Session 创建、唤醒和导航。Tool 自主产生一个 inert Draft 不会改变任何 Session，可以允许；Host 不把 Draft 的存在解释成用户已经同意承接。

## 用户旅程 A：自然语言承接

1. 用户主动进入 Thread 模式完成当前阶段。该 preset 的 system prompt 明确说明：同阶段 follow-up 留在当前 Session；依赖已有结果但属于不同阶段、环节或主要产物的工作应提议新 Session。
2. 边界可由用户新输入触发，也可在 Agent 刚完成一个有意义阶段且已知明确依赖的下一阶段时主动触发。边界含糊时只追问一次；边界清楚时直接调用 `thread_handoff`，不先要求一次重复的文本确认。
3. Tool 从 `exec.agent` 派生来源 Session，将稳定 `callId` 作为来源锚点，持久化包含阶段完成情况、产物/结论、约束、待确认问题和下一步指令的 inert Draft，然后 `concludeTurn()`。它不创建、不打开、不唤醒 Session。
4. 当前 `turn/end` 提交后来源边界才封口。Tool Card 本身就是“是否在新会话继续”的直接问题，显示目标和 carried-context 摘要；唯一 action 是“在 Thread 中继续”。
5. 用户点击后，Host 校验 exact `draftId + version + actionId`、固定 `standard-thread` preset 和来源 Workspace membership，预分配目标 ID，并写入 Link、稳定 `threadId` 与 exact `workspaceId`/`cwd` create plan。
6. 首次 Link 的 `threadId` 从根 Session ID 确定性派生；后续从该连通分量任一 Session 发起时自动继承。多个 ID 出现在同一分量时 fail closed，用户不创建或选择 Thread 容器。
7. Client 先调用 `beginCreation(actionId)` 固化 single-flight intent，再把 Host plan 原样传给 `sessions.create`。目标固定运行 Thread 模式，并通过 `workspaceId` 附着到来源的同一 Workspace；未分组来源只继承 exact `cwd`。
8. 可选标题只经公开 `sessions.rename` 写标准 event。Host 随后要求目标 live、idle、pristine 且 Workspace/cwd 与 Link 一致，同步 `inject(handoff) + followup(instruction)`，`sessions.flush()` 成功后才提交 relation。
9. Client 等目标出现在普通 Session list 后打开它。目标 Thread 模式继续执行下一阶段，并能用相同规则提议再开下一 Session，形成自动关联的阶段链。

### 交接卡

```text
Thread 交接
设计一个可交互原型
携带 11 条上下文，在同一工作区的 Thread 模式中继续     [分支图标 在 Thread 中继续]
```

卡片状态为 `waiting-turn / draft / authorizing / awaiting-create / creating / applying-title / awaiting-activation / activating / activation-incomplete / replacing-old / abandoning / delivery-uncertain / created-not-visible / active / partial / delivery-attention / failed / cancelled / abandoned`。首次主按钮仍为“在新会话继续”，一次点击授权当次 create + activation；中断后的动作不复用这个泛化文案：`awaiting-create` 是“创建承接会话”，`awaiting-activation` 是“启动交接”（会 inject 并 wake），`activation-incomplete` 是“继续启动交接”，已发布但未 committed 时另有“放弃交接（保留会话）”。

`creating/applying-title/activating` 禁止重复提交；title failure 作为独立 warning 不阻止 activation；`replacing-old/abandoning` 显示 exact intent checkpoint，并只提供“继续重新启动 / 继续放弃”或纯状态收尾；`created-not-visible` 显示目标标题/ID、重新检查/重新载入和返回来源；`partial` 表示关系已提交但 Workspace 未附着；`delivery-uncertain` 明示“提交可能已影响旧进程但未持久化”，只能预览后用新 attempt；`delivery-attention` 区分 canceled 与 consumed-without-entry，预览原 attempt 和将重发内容后才允许“重新投递”；`active` 不暗示模型已完成或页面已打开。`abandoned` 保留 target ID 和“打开空会话”：未发生 `turn/start` 的目标仍遵守 Harness blank 语义，普通列表可隐藏、Workspace 新会话可复用；Thread 不为占位伪造 user message/空回合。

## 用户旅程 B：查看 Thread

工作区分组和普通 Session 列表继续作为全局主投影。plugin-only v1 不改变普通侧栏行：相关会话不自动相邻、不改变归属、不增加嵌套层级，也不通过标题匹配或 React internals 做 DOM 注入。

会话 Header 的 Thread 图标只负责打开关系视图，不再提供一套手写 Handoff 表单。自然语言阶段识别和 `thread_handoff` Tool Card 是承接的唯一主入口，避免两套 Draft 语义发生漂移。

Client 把入口注册在 `conversation.session.header.utilities`，把可见面注册到加性的 `shell.overlay`。浮层读取当前 `[data-conversation-scroll]` rect，固定在正文窗体右上角内缩 16px，宽度上限 460px、最大高度不超过正文窗体；`ResizeObserver` 和 viewport resize 只更新这个几何，因此它不是 Header 按钮下拉，也不改变对话列网格宽度。表面完全复用 Settings 的 `--dsw-alias-bg-layer-2`、24px radius 与 `--dsw-shadow-lv3`；不注册 `details` occupant，也不读取 `layout` Service。只有再次点击 Header Thread 图标才关闭，Escape 和外部 pointer press 均不改变可见性。可见状态由插件级小型 external store 持有，因此 Session 切换导致 Header subscriber 替换时仍保持展开；插件卸载/HMR 关闭 store，并由 Slot/React lifecycle 回收 overlay、observer 和 resize listener。

Thread 胶囊投影当前 Session 所在的完整 Link 连通分量，显示稳定 `threadId`、根 Session 标题和按根到后续排序的 Session 列表。每行优先使用 `ctx.sessions` 的实时 `displayTitle` 和运行状态；点击可寻址行只调用 `ctx.sessions.open(id)`。Session-scoped props 在导航后重新注入，当前行和产物视图随之切换，而 external visibility store 让胶囊保持展开。缺失于 Client session projection 的历史目标保留 ID 但不可点击。

Thread 仍然只是关系元数据：胶囊是导航和产物投影，不提供创建、改名、分组、拖拽、排序或 Workspace 管理操作。

## Session 产物投影

Handoff 只接收 Agent 明确报告的阶段产物，不从任意文件读写、Tool history 或 transcript 猜测。`ThreadArtifact` 是有界 owned JSON：

```ts
interface ThreadArtifact {
  kind: 'file' | 'directory' | 'url' | 'note' | 'other'
  label: string
  uri: string | null
  summary: string | null
}
```

单个 Handoff 最多 24 条；`label`、`uri`、`summary` 分别限制为 200、2000、1000 字符。旧 Draft/Link 通过 schema default 读取为 `artifacts: []`，不迁移、不制造历史产物。

面板按 Session 投影产物：有 outgoing Handoff 时显示该 Session 已经产出的去重 artifact；尚无 outgoing Handoff 的叶子 Session 显示 incoming Handoff 携带进来的 artifact，并标记为“承接产物”。这样列表随着当前 Session 切换，而不是把整个 Thread 的产物混成一个全局仓库。

## 后续旅程 D：补充上下文（非 v1）

来源会话在第一次交接后继续产生新结论时，不自动更新后续会话。用户选择“补充到后续会话”，选定目标和新的稳定来源点，生成一条新的 Delivery。

目标 Agent 已 live 时，用户确认后的 Service 把稳定消息入队；目标为 cold session 时，Client 先走现有 `session.create` 幂等 resume，再调用 Delivery activation。`agent/session-start` 只重建状态，不自动投递。`agent.inject()` 不强行打断当前请求，它在最近的后续 step 或下一轮消费。

每次补充都是不可变快照。“来源已有新内容”只是后续建议性提示，不属于 v1。

## 后续旅程 E：回传结果（非 v1）

目标 Agent 可以通过未来的 `thread_publish` Tool 生成结果草稿；该 Tool 同样不直接投递。用户确认“回传到来源”后，Thread Service 创建 `result` Delivery，将结果摘要注入来源会话。

回传不会创建反向 membership Link，避免形成 Thread 环。脉络结构仍由最初的 continuation 边决定；结果、补充上下文和其他引用是有方向的 Delivery。

## 交接确认面板

Tool 行使用一个紧凑、无嵌套 Card 的确认面板：左侧依次显示 `Thread 交接`、目标和“携带 N 条上下文，在同一工作区的 Thread 模式中继续”；右侧只有一个带分支图标的 primary action“在 Thread 中继续”。不显示 preset 下拉、Workspace 下拉、统计碎片或“新会话尚未创建”等重复状态。

目标 preset 固定为 `standard-thread`。Client 没有可控 selector，`authorizeRequestSchema` 同时用 literal 在 Host transport 边界拒绝任何其他 preset。目标 Workspace 也不由 Client 选择：Host 从 durable 来源 Session 的实际 membership 解析并持久化 exact `workspaceId`；来源未分组时只持久化 exact `cwd`。create plan 永不同时携带两者，Client 不能提交任意 Workspace ID。

目标标题、下一步 instruction、目标、结论、约束、待解决问题和显式阶段产物已由 inert Draft 固定；direct confirmation 绑定 exact `draftId + draftVersion + actionId`。v1 不提供“附带完整会话”开关，也不在确认 Card 内提供编辑器。

主按钮为“在 Thread 中继续”。提交时 Host 重新校验 Thread preset、来源 Workspace、已固定来源边界和目标 placement；preset/Workspace 已删除、来源日志失效或目标不在预期 Workspace 时 fail closed，不创建关系。

提交期间按钮显示忙碌状态并保持稳定尺寸。Tool 与手动路径都先有持久 Draft，编辑用 versioned autosave；保存仍在进行或发生 version conflict 时，关闭需要确认丢弃本地差异。每个 Draft 提供显式“丢弃草稿”，普通关闭只收起。`authorized` 但目标尚未创建的 Card 显示“等待创建”，取消只在尚无 creation checkpoint 且 Host 证明预分配目标仍不存在时把 Link 标为 `cancelled`；`creating` 可检查/同 ID 重试或记录“停止等待” intent，但不能撤销已发出的 API 请求，目标已 published 则显示“启动交接 / 放弃交接（保留会话）”，此时尚没有脉络关系。页面重载后只能由新的直接点击重试 create，Provider 不自动继续。

## 目标会话首轮

目标会话的模型输入分成两个不同角色：

1. Handoff 作为插件注入的 Context，来源为 `dsh-thread`，只表示不可信的背景材料。
2. `nextInstruction` 作为普通 `source.kind = 'user'` 消息，表示用户对目标 Agent 的当前指令。

不得把来源摘要拼进系统提示，也不得把来源会话中的命令性文本提升为目标用户指令。目标 Agent 只把 Handoff 当作背景事实，防止来源对话中的提示注入跨会话升级权限。

推荐使用现有消息来源：

```ts
{
  kind: 'plugin',
  plugin: 'dsh-thread',
  form: 'snapshot',
  sections: [
    { name: '目标', text: '...' },
    { name: '已确认结论', text: '...' },
    { name: '约束', text: '...' },
    { name: '待解决问题', text: '...' },
    { name: '产物', text: '...' },
  ],
}
```

该 Context 通过标准 `user/message` 进入目标日志，满足 “model-visible means logged”，并由现有 Context Injection Row 折叠展示。插件无需自定义 Chat Node 即可获得可重放的基础呈现。

## 持久数据模型

v1 使用 `storageDomain` 打开插件自有 `dsh_thread` domain。关系跨越多个 Session，不属于某一个 SessionHeader，也不应依赖扫描所有 JSONL 日志重建。

```ts
interface ThreadLink {
  id: string
  threadId: string
  idempotencyKey: string
  sourceSessionId: string
  sourceBoundarySeq: number
  targetSessionId: string
  targetCreatedAt?: number
  draftId: string
  handoff: SealedThreadHandoff
  revision: number
  activationAttempts: ThreadActivationAttempt[]
  creationAttempts: ThreadCreationAttempt[]
  targetPresetId: string
  targetTitleSnapshot?: string
  titleState: 'not-requested' | 'pending' | 'applied' | 'failed' | 'skipped'
  titleFailure?: { code: 'title-apply-failed'; message: string }
  workspaceId?: string
  targetCwd?: string
  createdAt: number
  state:
    | 'authorized'
    | 'creating'
    | 'session-published'
    | 'activation-incomplete'
    | 'active'
    | 'delivery-attention'
    | 'failed'
    | 'cancelled'
    | 'abandoned'
  relationCommit?: {
    at: number
    reason: 'activation-flushed' | 'irreversible-impact'
    attemptId: string
  }
  pendingOperation?:
    | {
        kind: 'abandon-creation'
        actionId: string
        requestedAt: number
      }
    | {
        kind: 'abandon'
        actionId: string
        phase: 'canceling' | 'flushed' | 'rejected'
        messageIds: string[]
        requestedAt: number
      }
  workspaceState: 'pending' | 'attached' | 'unattached' | 'not-requested'
  workspaceFailure?: { code: 'workspace-attach-failed'; message: string }
  failure?: {
    code:
      | 'create-rejected'
      | 'create-outcome-unknown'
      | 'activation-failed'
      | 'submission-outcome-unknown'
      | 'durability-unavailable'
      | 'target-not-live'
      | 'target-identity-conflict'
      | 'target-not-pristine'
    message: string
  }
}

interface ThreadHandoffDraft {
  id: string
  version: number
  sourceSessionId: string
  sourceAnchor:
    | { kind: 'tool-call'; callId: string }
    | { kind: 'assistant-message'; messageId: string }
    | { kind: 'latest-completed-turn' }
  sourceBoundarySeq?: number
  sourceTitle: string
  objective: string
  decisions: string[]
  constraints: string[]
  openQuestions: string[]
  artifacts: ThreadArtifact[]
  nextInstruction: string
  suggestedPresetId?: string
  createdBy: 'user' | 'tool'
  createdAt: number
  state: 'waiting-boundary' | 'editable' | 'source-invalid' | 'discarded'
}

interface SealedThreadHandoff {
  draftId: string
  sourceSessionId: string
  sourceAnchor: ThreadHandoffDraft['sourceAnchor']
  sourceBoundarySeq: number
  sourceTitle: string
  objective: string
  decisions: string[]
  constraints: string[]
  openQuestions: string[]
  artifacts: ThreadArtifact[]
  nextInstruction: string
  createdBy: 'user' | 'tool'
  sealedAt: number
}

interface ThreadCreationAttempt {
  actionId: string
  state: 'started' | 'published' | 'rejected' | 'outcome-unknown'
  startedAt: number
  finishedAt?: number
  failure?: ThreadFailure
}

interface ThreadActivationAttempt {
  id: string
  actionId: string
  phase: 'prepared' | 'replacing-old' | 'submitting' | 'flushed' | 'uncertain' | 'failed'
  intent:
    | { kind: 'initial' }
    | { kind: 'replace-pending'; priorAttemptId: string; messageIds: string[] }
    | { kind: 'redeliver'; priorAttemptId: string }
  handoff: ThreadDelivery
  instruction: ThreadDelivery
  createdAt: number
}

interface ThreadDelivery {
  id: string
  linkId: string
  fromSessionId: string
  toSessionId: string
  kind: 'handoff' | 'instruction'
  messageId: string
  sourceBoundarySeq?: number
  state:
    | 'prepared'
    | 'queued'
    | 'claimed'
    | 'entered'
    | 'canceled'
    | 'consumed-without-entry'
    | 'failed'
  enqueuedAt?: number
  claimedTurn?: number
  createdAt: number
}
```

Draft 投影固定为 `waiting-boundary → waiting-turn`、`editable → draft`、`source-invalid → failed`，`discarded` 不再进入 pending。Tool 执行期尚未存在其回合的 `turn/end`，因此 Draft 先保存来源锚点并处于 `waiting-boundary`；只有 Host 能把 tool call、assistant message 或“最新完整回合”解析为 `sourceBoundarySeq`。只有 `turn/end.reason.kind` 为 `completed / blocked / max-tokens` 的边界可进入 `editable`；`aborted / error / interrupted` 进入 `source-invalid`，用户可改从更早完整回合新建 Draft。Client 永远不提交自己计算的 seq。

`authorizeContinuation()` 把当时表单内容复制为不可变 `SealedThreadHandoff`；此后修改只能产生新 Draft 或后续 Delivery，不原地重写目标 Agent 已见过的上下文。初始 activation bundle 建立两条 identified Delivery：plugin-sourced `handoff` 和普通用户 `instruction`，两者分别 reconcile queue/surface 状态。

v1 的 `drafts` table 保存 inert Draft；编辑通过 `ifVersion` 乐观并发控制递增 `version`，Link 已存在后原 Draft 只读，改动要克隆新 Draft。`links` table 的一个 KV value 聚合 sealed Handoff snapshot、Link checkpoint 和初始 activation attempt 的两条 Delivery。`authorizeContinuation()` 以 Draft ID 派生确定性 Link key，在一次 `links.put()` 中发布完整 aggregate；Draft 的 consumed 呈现由 Link 是否存在派生，不依赖另一次跨表写。这样 crash 只会留下“无 Link”或“完整 authorization”，不会暴露半条 activation bundle。

Link 同时承担 idempotency 和 saga checkpoint，不再增加泛化的 `ThreadRequest` 表。两个窗口确认同一 Draft 命中同一个 Link/idempotency key 和 `targetSessionId`；后续 read-modify-write 在 per-Link operation chain 内使用 `links.update()`，整体递增 `revision`。

`actionId` 对一次直接点击及其 transport retry 稳定，新的人类点击必须生成新 ID；Host 在 per-Link chain 内按它单飞。Attempt phase 只按 `prepared → submitting → flushed/uncertain/failed` 或 `replacing-old → submitting → flushed/uncertain/failed` 推进。Initial attempt 随 authorization 处于 `prepared`；直接 activation 在第一次 Inbox append 前写 `submitting`。恢复性点击则原子追加一个 `phase: 'replacing-old'` 的新 attempt，携带 `actionId`、prior attempt 和要取消的 exact message IDs；只有旧 cancellation flush 后才进入 `submitting`，随后 append 新消息并再次 flush。这样任一 crash 都能区分“尚在取消旧消息”和“正在提交新消息”。Cold restart 若看到 `submitting` 却找不到完整 persisted insertion，必须转成 `uncertain`：旧进程可能已把输入交给 policy/model 但尚未 flush，不能复用同 IDs 或宣称没有副作用。UI 预警后只能由新点击追加 `redeliver` attempt/new IDs，或放弃未形成 durable relation 的目标。

Abandon 也必须在第一次 `Inbox.remove()` 前写入 `pendingOperation: { kind: 'abandon', phase: 'canceling', actionId, messageIds }`；cancellation flush 后推进 `flushed` 再完成 `abandoned`；若 exact message 已 claim/enter 则推进 `rejected` 并提交 irreversible relation。Provider 可以根据 persisted exact IDs 完成纯 Link 状态收尾，但没有新的点击时，绝不能执行尚未发生的 remove/insert、调用 `session.create` 或唤醒 Agent。

Editable Draft、`authorized`、`creating` 和 `session-published` 都不是 Session 关系，不进入 `neighborhood()` / `counts()` 的边或关系数字。它们通过 `pending(sessionId?)` 出现在独立的“待继续” Header Popover；无参数返回全局未完成动作，按来源或目标过滤时用于就地高亮；用户可按状态执行“继续编辑”“创建承接会话”“检查创建结果”“启动交接”或“放弃交接（保留会话）”。`abandoned` Link 留作审计但不进入关系投影。

Editable Draft 和未创建目标的 authorization 在 v1 都不自动过期：前者只能显式丢弃，后者只在仍为 `authorized`、尚无 creation checkpoint 且 Host 证明目标不存在时可显式取消；进入 `creating` 后不得与可能仍在飞行的普通 create 竞态；可按同一 ID reconcile/retry，或记录 `abandon-creation` intent 停止后续 activation。晚到的 target 只保留为空白普通 Session。长期清理策略留到 P4，避免 TTL 与仍在飞行的普通 create 产生竞态。

关系提交点不是 Session publication，并显式记录两种 reason：

- `activation-flushed`：同一 attempt 的 Handoff 与 instruction insertion 都已被一次返回 true 的 `ctx.sessions.flush(targetSession)` 覆盖，或冷启动 fold 在 persisted log 中同时看到二者。Link 进入 `active`，但后续 canceled/consumed warning 仍可转成 `delivery-attention`。
- `irreversible-impact`：正常双消息条件尚未成立，但 persisted log 已包含某条 Thread message 的 claim splice 或相同 ID `user/message`，模型/policy 侧影响不能撤销。Link 提交关系并进入 `delivery-attention`，另一条 Delivery 保留真实的 `prepared/failed` 状态，不能伪装成完整 activation。

“Durable claim/enter”只指 activation 操作调用 flush 返回 true 后再次 fold 的证据，或 cold persisted-log fold 的证据；live `agent/inbox/claimed` / `session/event` 通知本身绝不提交关系。若只完成 Handoff insertion 且仍 pending，Link 保持 `activation-incomplete`，用户可继续 instruction，或通过有 intent checkpoint 的 abandon 取消它。

Workspace attach 是独立轴：`workspaceState = 'unattached'` 时 Client 把 committed Link 呈现为 `partial`，不在持久 Link state 中制造与 delivery 状态互斥的 `partial` 分支。模型完成、Client list projection 和导航成功也都不属于 relation commit 条件。

每个已提交的承接会话最多有一个 incoming continuation Link；一个来源可以有多个后续。v1 的目标总是新会话，因此提交后的关系天然无环；泛化图合并和完整环检查留到未来。

Popover 只投影当前 Session 的一跳邻接：`来源` 是唯一 direct predecessor，`后续` 是 direct children，多个后续按 `relationCommit.at` 倒序；`counts(sessionIds)` 返回相同邻接行数，不返回 connected-component 总量。打开某行后，新 Session 的 Header 再显示它自己的一跳邻接，从而逐边浏览深层分支，不用缩进树或根标题制造新分组。

持久状态与 Client 投影固定映射：

| Link state / axis | Client 状态 | 进入脉络关系 | 直接操作 |
|---|---|---|---|
| `authorized` | `awaiting-create` | 否 | 创建承接会话 / 取消 |
| `creating` | `creating / create-outcome-unknown` | 否 | 检查 / 同 ID 重试 / 停止等待（记录 abandon-creation intent） |
| `session-published` | `awaiting-activation` | 否 | 启动交接 / 放弃交接（保留会话） |
| `activation-incomplete` | `activation-incomplete` | 否 | 继续启动 / 安全时放弃 |
| `active` + attached/not-requested | `active` | 是 | 打开会话 |
| `active` + unattached | `partial` | 是 | 打开会话 / 重新附加 Workspace |
| `failed` + attempt `uncertain` + no commit | `delivery-uncertain` | 否 | 预览警告后 new-ID 重投 / 放弃 |
| `delivery-attention` | `delivery-attention` + commit reason | 是 | 查看各 Delivery 实态；确认后重新投递 |
| `failed` | `failed` | 仅当 `relationCommit` 已存在 | 按 failure code 恢复 |
| `cancelled` | 终态记录 | 否 | 从快照克隆新 Draft |
| `abandoned` | 终态记录 | 否 | 打开保留的 blank target / 克隆新 Draft |

## 为什么独立插件不写 `thread/*` Session Event

当前 Harness 的 `KNOWN_SESSION_EVENT_TYPES` 在构建时生成，下游 event type 注册面尚未开放。未知事件只有在 envelope 明确带 `ignorable: true` 时才能被不认识它的 Runtime 跳过；ignorable 事件不能拥有恢复所必需的关系或模型语义，required 下游事件则可能让插件停用后的基础 Runtime 拒绝恢复日志。

因此 v1 的关系权威放在 storage domain，模型可见内容使用已知的 `user/message`，模型 Tool 使用已知的 `tool/*` 生命周期。这样插件卸载后关系 UI 消失，但普通会话日志仍可读取。

如果 Thread 将来进入 Harness in-repo 包族，可以再评估正式 `thread/*` event 和 Session Projection；不能在出树版本里先写入不可移除的 required event。

## Host 能力结构

Thread 不是 UI、Tool、Listener 三套实现，而是一个持久关系 Service、一个 Client orchestration 和多个受限 Consumer。它复用现有普通 `session.create`，不在插件内复制创建链。

```text
thread_handoff Tool ─────► Thread Service.prepareHandoff（inert Draft）
                                      ▲
                                      │ Thread Remote
用户确认 ─► Client Thread UI ─────────┤ authorize / begin / activate / reconcile / neighborhood / pending / counts
                    │                 ▼
                    │          storageDomain aggregate
                    │          Draft / Link / Delivery checkpoints
                    │
                    ├─► connection.api.sessions.create / rename
                    │             │
                    │             ▼
                    │    现有 Host api-proxy
                    │    preset / model / Workspace policy
                    │             │
                    │             └─► ctx.agents.create()（Thread 不驱动）
                    │
                    └─► Thread Service.activateContinuation
                                  │
                                  ├─► ctx.agents.get(targetSessionId)
                                  ├─► inject(handoff), followup(instruction)
                                   └─► ctx.sessions.flush(target)

Cordis listeners 只折叠 session/inbox 状态，不创建、不自动唤醒
```

### Thread Service

定义 `ctx.thread` Service Definition，Provider 使用 storage domain。Consumer 不直接操作表。

```ts
interface ThreadService {
  prepareHandoff(agent: Agent, input: PrepareHandoffInput): Promise<ThreadHandoffDraft>
  prepareManualHandoff(input: PrepareManualHandoffInput): Promise<ThreadHandoffDraft>
  updateHandoffDraft(input: UpdateHandoffDraftInput): Promise<ThreadHandoffDraft>
  cloneHandoffDraft(input: CloneHandoffDraftInput): Promise<ThreadHandoffDraft>
  discardHandoffDraft(input: DiscardHandoffDraftInput): Promise<ThreadHandoffDraft>
  authorizeContinuation(input: AuthorizeContinuationInput): Promise<{
    linkId: ThreadLinkId
    targetSessionId: SessionId
    create:
      | { sessionId: SessionId; agentPreset: string; workspaceId: WorkspaceId }
      | { sessionId: SessionId; agentPreset: string; cwd?: string }
    rename?: { sessionId: SessionId; title: string }
  }>
  beginCreation(input: BeginCreationInput): Promise<ThreadLink>
  activateContinuation(input: {
    linkId: ThreadLinkId
    actionId: string
    createOutcome: 'ready' | 'workspace-partial'
  }): Promise<ThreadLink>
  failCreation(input: {
    linkId: ThreadLinkId
    actionId: string
    error: ThreadFailure
  }): Promise<ThreadLink>
  recordTitleOutcome(input: RecordTitleOutcomeInput): Promise<ThreadLink>
  reconcileContinuation(linkId: ThreadLinkId): Promise<ThreadLink>
  cancelAuthorization(input: LinkActionInput): Promise<ThreadLink>
  abandonContinuation(input: LinkActionInput): Promise<ThreadLink>
  redeliver(input: RedeliverThreadInput): Promise<ThreadLink>
  neighborhood(sessionId: SessionId): ThreadNeighborhood
  pending(sessionId?: SessionId): ThreadPendingAction[]
  counts(sessionIds: readonly SessionId[]): Record<SessionId, number>
  presets(): Promise<ThreadPresetOption[]>
}
```

Tool 只获得并调用带 live `Agent` 的 `prepareHandoff()`。Client Header/Assistant Action 调 `prepareManualHandoff()` 固定来源边界并取得 inert Draft，表单 autosave 只调用带 `ifVersion` 的 `updateHandoffDraft()`；这些方法都不能创建或唤醒。`authorizeContinuation()` 只经 Client Remote 暴露：它解析稳定来源、校验 preset/Workspace、预分配目标 ID，并以单条 Link aggregate 持久化授权，但绝不创建 Session。Client 必须在发出普通 create 前调用 `beginCreation(actionId)`；它按 `actionId` 幂等追加 `creationAttempts` 并把 Link 置为 `creating`，让取消与一个或多个 in-flight create 互斥，本身仍不创建。此后“停止等待”只能由 `abandonContinuation()` 写 `abandon-creation` intent；Client/create observer 看到该 intent 应跳过 rename/activation，且 Host `activateContinuation()` 必须再次拒绝该 intent；竞态中已发生的 title event 不驱动模型，晚到目标做 state-only `abandoned`。若用户填写目标标题，Host 另外返回 owned `rename` plan；Client 在 create 后调用现有 `connection.api.sessions.rename()`，再用 `recordTitleOutcome()` 记录结果。标题失败只设置 `titleState/titleFailure`，不阻止 activation；activation 的 pristine check 允许这个预期 `session/title` event。

`activateContinuation()` 必须从 `ctx.agents.get(targetSessionId)` 取得 live Agent；persisted-only 目标返回 `target-not-live`，Client 必须先用同一 create plan 走普通幂等 resume。首次 publication reconciliation 要求 Header creation time 不早于 Link authorization，并把它钉为 `targetCreatedAt`；后续 resume/activation 要求 exact match。Host 还校验 preset/cwd 与预期相容、Workspace registry 与 reported outcome 一致，不能把同 ID 的不相关 Agent 当作承接对象。

Activation 还要求 Agent 当前 idle，且 persisted/live log 只含 Session 创建结构、exact expected `session/title` 和当前 Link 可解释的 Thread events，Inbox 也只含当前 Link 消息；任何额外 command/plan/user/assistant/tool/plugin event 都视为非 pristine。所有异步校验和 attempt checkpoint 完成后，Service 在第一次 Inbox mutation 前再做一次无 await 的 live/pristine revalidation。目标被其他 plugin 或用户驱动时返回 `target-not-pristine`，不把 Handoff 混进进行中的回合。通过后在 per-Link operation 内先推进 attempt phase，再同步 `inject()` / `followup()`，随后 `await ctx.sessions.flush(agent.session)`；返回 `false` 视为 `durability-unavailable`，只有至少一个 durability listener 成功参与才 `links.update()` 写 relation commit。`failCreation()` 只更新匹配 `actionId` 的 creation attempt；任何 live/persisted target existence 都优先于晚到 rejection，不能让 stale response 把已 published 目标退回不存在。

### 复用现有普通 `session.create`

Client 的公开 `ctx.connection.api.sessions.create` 已接受 `{ sessionId, workspaceId?, cwd?, agentPreset? }`。现有 api-proxy 已拥有这条生产政策：

- 按用户/部署默认值选择 provider 与 model；
- 在 Session publication 前 resolve 并 mount 目标 preset，同时把 resolved id 写入 header；
- 用调用 api-proxy 的 Host Context 拥有 `AgentHandle`；
- 对预分配 `sessionId` 做幂等 create/resume 与 cwd/preset 冲突校验；
- 在 publication 后 attach Workspace，并把 partial publication 编码为结构化错误。

`beginCreation()` 只用于 Host 尚未证明 target 存在的 publication attempt。已钉 `targetCreatedAt` 的 cold resume 或 Workspace attach repair 仍复用同一个 RPC，但它们是新的直接恢复动作，不会重新开放 authorization/cancel 竞态；RPC 后必须验证 exact target identity。

因此 `ctx.agents.create()` 的准确触发者不是 Tool、Thread Service 或 listener，而是用户确认后由 Client 调用的现有 `session.create` RPC handler。Thread 插件在调用前持久化授权和 `creating` checkpoint，在 create outcome 后由同一次 Client orchestrator 显式调用 `activateContinuation()`；`agent/session-start` 只观察 published/resumed 状态，不投递或唤醒。

Client 不通过 outward `ctx.sessions.create`，因为该 feature face 没有公开 create 且不接受 `agentPreset`；它使用已经公开的 Connection API。Direct create 绕过 `SessionRuntime.create()` 的同步本地 upsert，direct rename 也不走 feature runtime 的本地 title settle；activation 依据 Host response/event，不等待 Client title projection。Client 仍必须等待 Host frame 使 `targetSessionId` 出现在 `ctx.sessions.list` 后再调用 `ctx.sessions.open()`，不得对未知 ID 强开。

这种组合使目标 Agent 始终由现有普通 Session Host owner 持有。只重载独立 Thread rows 时，HMR 只移除关系 UI、Remote 和 listeners，不停止 api-proxy row 创建的 Agent；若共同 bundle parent 或 api-proxy 自身重载，则遵循其原有 lifecycle。插件停用后目标 Session 仍按 header 中的 preset 由基础 Runtime 恢复。

## 承接 saga

Thread storage、Session persistence 和 Workspace domain 之间没有跨域事务。`storageDomain` 只保证本 domain 写链有序，因此 Client 编排必须建模为带 checkpoint、幂等键和补偿策略的可恢复 saga，不能承诺原子提交。

```text
Client Thread UI                 Thread Service                 现有 session.create / api-proxy
  │                                   │                                      │
  │ authorizeContinuation(key, draft) │                                      │
  ├──────────────────────────────────►│                                      │
  │                                   │ one aggregate links.put()            │
  │◄──────── linkId + create plan ────┤                                      │
  │ beginCreation(actionId)             │                                      │
  ├──────────────────────────────────►│ links.update(creating)               │
  │◄──────────────── acknowledged ─────┤                                      │
  │                                                                          │
  │ connection.api.sessions.create(plan)                                    │
  ├─────────────────────────────────────────────────────────────────────────►│
  │                                                                          │ resolve/mount preset
  │                                                                          │ ctx.agents.create() publish
  │                                                                          │ attach Workspace
  │◄──────────────────────────── normal or partial create result ────────────┤
  │ connection.api.sessions.rename(renamePlan?) ────────────────────────────►│
  │ recordTitleOutcome(result)          │                                      │
  ├──────────────────────────────────►│                                      │
  │                                   │                                      │
  │ activateContinuation(linkId, outcome)                                    │
  ├──────────────────────────────────►│                                      │
  │                                   │ require live + pristine target       │
  │                                   │ attempt phase → submitting           │
  │                                   │ inject(handoff), followup(instruction)│
  │                                   │ sessions.flush(target)               │
  │                                   │ links.update(relation commit)        │
  │◄──────── active / UI partial ─────┤                                      │
  │ wait list projection, then open   │                                      │
```

步骤与恢复规则：

1. 每次实际 create 尝试都来自直接 Client 点击。`authorizeContinuation()` 要求 `ifDraftVersion`，冲突时不写 Link；随后按确定性 Link key 查询 aggregate，已有记录只在确认参数一致时返回同一个 `targetSessionId` 和 plan，否则返回 authorization conflict。
2. Host 把 tool call、assistant message 或已固定“最新完整回合”锚点解析为一个 policy-accepted `turn/end`。解析失败不写 Link。
3. Host 过滤 roster 中 `broken` 的 preset，校验 Workspace/cwd，构造稳定 Handoff/instruction `UserMessage`。create plan 是 `workspaceId` 或 `cwd` 的互斥 union，只含 owned JSON。
4. Host 用一次 `links.put()` 持久化 sealed Handoff snapshot、`authorized` Link 和一个含两条 `prepared` Delivery 的 activation attempt，再返回 plan。至此直接人类确认已经 durable，但仍没有 Session。
5. Client 先用同一 action ID 调 `beginCreation()`；CAS 成功后才把 plan 原样传给现有 `connection.api.sessions.create()`。请求不传 seed、不写 fork lineage；api-proxy 在自己的 Host Context 内触发 `ctx.agents.create()`，负责 preset mount、模型默认值和 Workspace attach。普通 create 本身不发送输入，但其他已组合的 `agent/session-start` listener 可能驱动 Agent，因此 Thread 不无条件宣称目标 idle。
6. 普通或 `workspace-attach-failed` result 都证明目标已 published。Client/observer 先用 `reconcileContinuation()` 校验 target identity 并 re-read Link；若已有 `abandon-creation` intent，只标 `abandoned` 并停止。否则若存在 rename plan，Client 先调用公开 `sessions.rename()` 并记录 outcome；失败不阻止 activation，response 未知时先由 `reconcileContinuation()` 检查 exact expected title event，不盲目追加重复 rename。publication 前错误调用 `failCreation()`，timeout/断线则先按预分配 ID reconcile。若目标只 persisted 而不 live，Client 必须由新的直接动作以同一 create plan 幂等 resume，再调用 activation。
7. Activation 要求 live Agent `status === 'idle'`，Inbox 只含当前 Link 可解释的消息，且日志满足 structural + exact title + Thread event allowlist。随后 full fold 通过 `turn/start` 跟踪 open turn，把无 `outcome` 的 claim splice 关联到该 turn；在相同 ID 的 `user/message` 或对应 `turn/end` 出现前，状态一直是 `claimed`，不能提前归类。
8. 两条都为 `prepared` 时，Service 先用 `links.update()` 把 initial attempt 从 `prepared` 推进为 `submitting`，再同步 `agent.inject(handoff)`、`agent.followup(instruction)`。Handoff 已 pending 而同 attempt 的 instruction 仍 prepared 时只 followup。每次发生 Inbox mutation 后必须 `await ctx.sessions.flush(agent.session)`；flush 前不得把 Link 标成 committed。
9. 如果恢复时旧 attempt 的两条消息都 pending、Agent idle 却没有 wake，不能 remove+reinsert 同一个 ID。用户点击“重新启动交接”后，Host 原子追加 `phase: 'replacing-old'` 的新 attempt，写入 prior attempt 与 exact old IDs；再 remove 仍 pending 的旧消息并 flush，推进 `submitting` 后才插入新 IDs 并再次 flush。崩溃后 Provider 只 fold/标态，用户再次点击才继续 `replacing-old` 中尚未发生的 Inbox mutation；若已到 `submitting` 却无完整 persisted evidence，则转 `uncertain`，只能以新 attempt/IDs 重投。
10. `claimed` 后出现相同 ID 的 `user/message` 才进入 `entered`。只有 successful flush 后重新 fold 或 cold persisted-log fold 看到的 claim/entry 才是 durable；claim 所属回合关闭仍无相同 ID 的 `user/message` 时进入 `consumed-without-entry` 并保留 reason。重新投递确认必须预览内容，并提示“上一 attempt 未形成同 ID 的日志表面，但可能已触发 policy/回合副作用”；确认后以 `intent: 'redeliver'` 追加新 IDs，不覆盖旧 attempt。
11. 两条 insertion 被 Session flush 后，Service 用 `links.update()` 把 attempt 置为 `flushed`，写 `relationCommit.reason = 'activation-flushed'` 并进入 `active`。如果 aggregate update 前崩溃，Provider 可从 persisted 双 insertion 做纯状态补写；若只有 persisted claim/entry，则写 `irreversible-impact` + `delivery-attention`，绝不宣称完整 activation。Workspace attach 独立投影为 `partial`。
12. 只有 Handoff insertion 成功时，flush 后记录 `activation-incomplete`。执行“放弃交接”先持久化 exact-ID `pendingOperation`，再 remove + flush；崩溃后只有这个 intent 能让 reconciler 纯状态完成 `abandoned`，没有 intent 的 canceled splice 不能被解释成放弃。若消息已由 persisted claim/entry 证明产生影响，则拒绝放弃并提交 `irreversible-impact` 关系。
13. authorization 后、`beginCreation` 前退出时 Link 保持 `authorized`；checkpoint 后、publication 未知时保持 `creating`，可检查/同 ID 重试或记录停止等待 intent；create 后、activation 前是 `session-published`。三者都不构成关系，只在新的直接点击后继续。

v1 只保证 retained durable Session log 内同一个 message ID 最多有一次 insertion、最多一次 `user/message`，并保证不自动重投；它无法对“模型调用已发生但 Session 尚未 flush 时进程崩溃”提供跨系统 exactly-once。该窗口进入 `uncertain`，只有用户看到警告并确认后才能用新 attempt/IDs 重投。关系提交仍以 successful flush 或 cold persisted evidence 为界。

## Tool

`thread_handoff` 是模型可见 Consumer，挂在需要自然语言承接能力的 Agent preset 中，不放在共享 Host 平面偷偷改变全部工具集。

Tool 输入使用有界结构：

```ts
interface ThreadHandoffArgs {
  objective: string
  decisions: string[]
  constraints: string[]
  openQuestions: string[]
  artifacts: ThreadArtifact[]
  nextInstruction: string
  suggestedPresetId?: string
}
```

Tool description 要求只在用户直接表达换 Agent、换工具环境或在新会话继续时调用；该描述是模型行为约束，不是安全授权。即使模型误调用，Host 也只接受一个 inert Draft，不创建或唤醒 Session。

Tool 执行从 `exec.agent` 和 `exec.callId` 派生来源，校验数量、单项长度和总字节，调用 `ctx.thread.prepareHandoff()`，成功后调用 `exec.concludeTurn()`。canonical value 在 Harness 中不是 durable Tool Event 的一部分，因此 `output.presentationMeta()` 必须把有界 `draftId` 和卡片摘要写入 durable meta；专属 `tool.call.toolview` 以该 key 渲染，并按 `draftId` 查询 domain 获取 active/failed 等后续状态。

Tool 不调用 `authorizeContinuation()` 或 `session.create`，不拥有 Client 导航，也不触发审批对话。未来可选的 `thread_publish` 遵循同一原则，但不属于 v1。

## Cordis lifecycle listeners

设计中统一称为 Cordis event listener，不称 Hook；Claude Code/Codex 的 shell-hook bridge 与本功能无关。

- `agent/session-start`：同步读取已打开 domain 的内存索引和当前 Session events，标记目标 published/resumed，并把异步 checkpoint 排入 per-Link operation chain；它不读异步 storage、不 create、不 activate、不 inject、不 wake。
- `session/event`：观察已提交的 `agent/inbox/spliced`、`user/message` 和 `turn/end`。`turn/end` 先把同回合 Tool Draft 封口；对 splice removal，observer 在 Inbox projection mutation 前按 `target/start/removedCount` 重建被移除 message ID；每次 checkpoint 和重启都从完整相关日志 fold，而不是把单个通知直接当状态转移，推进 `queued/claimed/entered/canceled/consumed-without-entry`。flush 前的 live Delivery 状态只是 provisional cache，重启后允许按 durable log 回退；它绝不能单独设置 `relationCommit`。
- `agent/inbox/claimed` / `agent/inbox/discarded`：只加速 live UI；durable authority 仍是 splice + turn + `user/message` fold。
- `agent/disposed`：只清理 live 索引，不删除 durable Link。
- `domain/changed`：刷新 Host 查询缓存；Client push 属于后续优化，不驱动 Agent。

所有 listener 返回 `void` 并 containment failure；需要写 domain 的部分只排入串行 operation chain。Provider 初始化时先打开 domain、重建 Link/Inbox read model，再暴露 Remote。对 phase 已是 `submitting` 且目标仍 live 的记录，它可以调用 `ctx.sessions.flush()` 固化已经 append 的 events 后再 fold；这不是 Inbox mutation，也不 wake。cold 目标只读 persisted log。卸载时先关闭 mutation admission、等待 per-Link tails，再 close domain。它不使用 `agent/turn-stopping` 自动生成 Thread，不使用 `tools/post-execute` 猜测产物完成，也不使用外部 Hook bridge 启动会话。

## Client 插件

现有可复用 Slot：

| Slot | Thread 用途 |
|---|---|
| `conversation.session.header.utilities` | 最右侧 Thread toggle；唯一显隐入口 |
| `shell.overlay` | 按正文窗体 rect 定位的持久大胶囊，不拦截浮层外 pointer |
| `tool.call.toolview` | 以 `thread_handoff` 为 key 完整接管该 Tool 的原子行 |

所有注册通过 `ctx.slots.inject(...)` 等待声明生命周期，不能假设 Slot owner 已先启动。`tool.call.toolview` 的 keyed occupant 会替换该 key 的 generic Tool Row，不是叠加在 generic row 内。

`conversation.chat.turnTail` 是 chain，不适合注册一个匹配所有完成回合的通用按钮，否则会遮挡其他 chain contributor。Thread 使用加性的 `assistant-actions`。

Thread 图标按钮使用 Tooltip 与 aria-label；胶囊作为 non-modal persistent surface 不做 focus trap，样式对齐 Settings 的 layer-2/lv3 surface，并提供层级与 `aria-expanded`/`aria-controls`。外部点击和 Escape 不关闭，用户只从相同 Thread 图标切换显隐。目标 Handoff 复用现有 `user/message` Context Node 和 `ContextInjectionRow`，不新增 Chat Node。

### plugin-only 导航与创建状态

当前 `sidebar.workspaces` 是 single Slot，`ui-workspace` 的一个 occupant 拥有分组、单列表、搜索、拖拽、菜单和弹窗；普通 Session row 也没有可映射 `sessionId` 的 additive DOM seat。Thread 插件既不替换整个 Slot，也不按标题匹配行或读取 React internals。

因此 v1 在 `conversation.session.header.utilities` 增加 Thread toggle，在 `shell.overlay` 增加按正文 rect 定位的对应胶囊。胶囊在打开及 Session 导航后调用 package Remote 的 `state()`，再对 committed Link 做纯投影；它不对 sidebar 每行发 Remote，也不要求通用 Host push。

Client confirmation 使用明确状态机：`editing → authorizing → awaiting-create → creating → (rename plan 时 applying-title) → awaiting-activation → activating → syncing-list → opening → active/partial`，并具有 `activation-incomplete`、`replacing-old`、`abandoning`、`delivery-uncertain`、`delivery-attention`、`abandoned`、`created-not-visible`、`open-failed` 和分类 `failed` 分支。`authorizing` 后拿到的 plan 只在 `beginCreation` 成功后原样传给 `ctx.connection.api.sessions.create`；只有普通/Workspace-partial create result 或按目标 ID reconciliation 证明 published 后，才调用 `activateContinuation()` 和尝试打开。

直接 Connection API 不会调用 `SessionRuntime.create()` 的同步本地 upsert，rename 的本地 title projection 也只随 Host event/frame 到达。Client 订阅 `ctx.sessions.list`，只有目标出现在 snapshot 后才调用 `ctx.sessions.open()`。超过 Config `listSyncTimeoutMs` 或连接断开时进入 `created-not-visible`，展示目标快照标题/ID、重新检查、重新载入页面、返回来源和取消自动打开。重新检查只调用公开 `ctx.connection.api.sessions.list({})` 确认 Host 仍有目标，不写本地 store；真正恢复依赖 `host/session-added`、reconnect baseline 或用户明确 reload，绝不调用 outward `ctx.sessions` 中不存在的 `refresh()`。目标已投影但 `open()` 失败时进入 `open-failed`，不回滚已创建 Session，也不伪造本地 Session summary。

`SessionSummary.parentSessionId` 继续只代表 fork/spawn lineage。未来若 Harness 自己增加通用 session-row Slot，Thread 可作为可选增强消费它；本插件不依赖该改动。

## Cordis 组合与包落点

插件落在独立目录 `plugin/dsh-thread/`，目录名等于 package name；一目录、一安装单元、多行组合：

```text
plugin/dsh-thread/
  package.json              exports: . / ./tool / ./client
  dsh.bundle                Host Provider row；Client half 由 dsh.client 发现
  cordis.patch.yml
  src/
    index.ts                Host surface / Service Definition + Provider apply
    service.ts              storage-backed business service
    lifecycle.ts            non-driving Cordis listeners
    inbox-fold.ts           pure durable Inbox/turn reconciliation
    remote.ts               owned JSON contract
    typert.host.ts           Host strict Remote descriptors
    tool.ts                 thread_handoff Consumer
    domain.ts               zod schemas and storageDomain spec
    types.ts                owned JSON contracts
    client/
      index.ts              Client apply + create orchestrator
      typert.client.ts
      ThreadHeaderActions.tsx
      HandoffDialog.tsx
      HandoffToolView.tsx
      ThreadPopover.tsx
      PendingPopover.tsx
      store.ts
  tests/
```

Web profile 的 bundle layer 只挂载共享 Host Provider；`package.json.dsh.client` 发现 Client half。需要自然语言交接能力的 Agent preset 显式挂载 `dsh-thread/tool`。Tool 不放进共享 Host tool catalog；非 v1 Command 在决定实现时再增加 export 和 composition row。

出树 Remote 不依赖装饰器 marker 跨物理模块实例发现。Host half 按本仓 `dsh-web-search-toggle` 的既有姿势，用 `ctx.typert.register()` 注册与 Client 共享的 strict descriptors，并返回 disposer；Client 通过生成/共享的 owned JSON codec 调用。服务定义、Provider 和 Consumer 虽在同一安装单元内，跨行仍只走 `ctx.thread` Service 和 Cordis events，不 import Provider 实现。

所有可调策略进入插件 Config 并由 schema fail loud，包括 `listSyncTimeoutMs`、`badgeDisplayCap`、Handoff 总 UTF-8 字节、各数组/字符串长度和 Artifact 数量上限；实现不散落硬编码阈值。

Harness 依赖遵守仓库 npm 纪律，提交态钉 registry 版本；源码 link 只经受管 `link:source` 调试姿势。插件不进入 desktop bridge，也不加入 Tauri IPC。普通 `dsh web` 与桌面 sidecar 使用同一 Web profile 时行为一致。是否随桌面 Release 捆绑是实现成熟后的独立分发决策，初版按普通插件安装。

## Harness 本体改动：无

v1 不修改 Harness `master`，也不维护 runtime fork patch。它只消费当前已发布契约：

1. Client `connection.api.sessions.create({ sessionId, workspaceId?, cwd?, agentPreset? })` 与 `connection.api.sessions.rename({ sessionId, title })`；
2. Host `ctx.agents`、`ctx.sessions.flush()`、`sessionPersistence.inspect()`、`ctx.agentPresets`、Workspace、`storageDomain` 与已知 Inbox/Session events；
3. Client `conversation.session.header.actions`、`conversation.chat.assistant-actions`、`tool.call.toolview`、`shell.overlay` 和 `ctx.sessions`；
4. 出树 strict Typert registration 与标准 plugin/profile 安装面。

缺少普通 sidebar row additive Slot 只缩小 v1 呈现范围，不阻塞功能；插件不以 DOM hack 绕过。未来的 row Slot、幂等 inbox 原语或通用 domain push 都只能作为可选上游增强，不能成为当前实现或发布的前置条件。

## 失败与恢复

| 条件 | 行为 |
|---|---|
| 来源正在运行 | Header 只锚定最近完整回合；当前未完成回合不可选 |
| preset/Workspace 在提交前失效 | Host revalidation 拒绝 authorization；目标不发布，字段保留并要求重选 |
| 重复点击/网络重试 | 同一 Draft 的 deterministic Link key + `idempotencyKey` 返回同一目标，不创建第二个会话 |
| authorization 后、`beginCreation` 前退出 | `authorized`；listener 不创建，Card 显示 awaiting-create，可取消或再次点击 |
| `beginCreation` 后、publication 前退出 | `creating`；可检查/同 ID 重试，或写 abandon-creation intent 阻止晚到目标 activation |
| create 请求超时、outcome 未知 | 先按预分配 ID 查 live/persisted Session；存在则进入 published reconciliation，不存在才允许再次直接点击同一幂等 create |
| creating 时用户“停止等待” | 先写 `abandon-creation` intent；不取消 Host RPC，晚到 target 标 `abandoned`、不 activate；极窄竞态最多已写 title event，仍是普通 blank Session |
| create 被 preset/cwd policy 拒绝 | `create-rejected`；确认目标不存在后，从快照克隆新 Draft 再 authorization，不复用失效 plan |
| 预分配 ID 命中更早/不相容 Session | `target-identity-conflict`；不 rename/activate，从 sealed snapshot 克隆新 Draft，再开新 Link/target ID |
| create 成功后、activation 前退出 | Link 是 `session-published`；Card 要求新的“启动交接”，cold 时先幂等 resume；若其他 listener 已驱动则 activation 拒绝 |
| rename 失败或 response 未知 | 标题是独立 `titleState`；未知先查 exact expected title event，不重复追加；失败不阻止 activation |
| 目标 persisted 但不 live | `target-not-live`；“启动交接”先以同一 create plan resume，再重新做 pristine check |
| 两条消息 pending 时退出且 wake 丢失 | 用户确认后先写 `replacing-old` + prior/exact IDs；旧 cancel flush 后才进 `submitting`，新 insert flush 后才进 `flushed` |
| 消息已 claim、尚无 `user/message` 时退出 | live fold 关联 open turn 并保持 `claimed`；只有 persisted claim/entry 可触发 `irreversible-impact`，`turn/end` 后才归类 consumed |
| 输入被 pre-step 拒绝或显式删除 | 前者是 `consumed-without-entry`，后者由 canceled splice 归类 `canceled`；两者都预览警告后才能用新 IDs 重投 |
| activation 前目标出现 allowlist 外事件/输入 | 返回 `target-not-pristine`，不注入、不形成关系；可放弃交接保留目标，或从快照开另一承接会话 |
| activation 中只有 Handoff 入队 | flush 后进入 `activation-incomplete`；继续同 attempt，或先写 abandon intent、取消 exact pending ID、flush 后 abandoned |
| `submitting` 时进程退出且 persisted insertion 不完整 | `submission-outcome-unknown` / `delivery-uncertain`；不复用 IDs，不自动重投，用户预警确认后开新 attempt |
| Session flush 缺席/失败 | `durability-unavailable` / `activation-failed`；不得写 relation commit，重启后以 durable log fold 决定下一步 |
| Workspace attach 失败 | 保留普通未分组 Session；activation committed 后 UI 呈现 `partial`，同一 create plan 可幂等重试 attach |
| 目标已创建但 list 未同步 | 进入 `created-not-visible`；公开 API list 只做存在性检查，等待 frame/reconnect baseline 或用户 reload，不再 create |
| 来源归档、日志删除或不可读 | Link 与快照标签保留；list 可寻址时可打开，否则显示“不可用”，v1 不承诺恢复 |
| 插件停用 | Thread UI/Tool 消失；标准 inbox/user events 仍可恢复，普通会话不损坏 |
| 多窗口同时操作 | storage domain operation chain、deterministic Link key 和 idempotency key 保证同一 Draft 单飞；Client 最终重新拉取 |
| 只 HMR 卸载 Thread rows | 不影响 api-proxy owner 持有的普通 Agent；重载后从 aggregate 和标准日志 reconcile |

## 安全与预算

- Handoff 是不可信背景，不是系统提示；下一步指令单独作为用户消息。
- Handoff 所有字符串、数组长度、产物数量和总 UTF-8 字节必须有 schema 上限。
- Artifact 只保存 URI、相对路径、标题和类型等 owned JSON，不缓存文件内容或 live Service 对象。
- 跨 Workspace 文件仍受目标 Agent 的 fs/sandbox policy；Thread 不提升权限。
- v1 不注入完整来源会话；未来若启用，必须扩展 Session Reference 接受明确 capture boundary，并沿用其预算与 untrusted framing。
- Tool 建议 preset 不构成授权；Host 只接受 roster 中当前可挂载的 id。
- “直接 Client 确认”是当前 loopback Web composition 的产品授权边界，不是密码学 user-presence 证明：任何被部署方信任并组合进页面的 Client 代码本来就能调用公开 `session.create`。Thread Remote 校验来源、Draft ownership、状态和幂等键，但不虚构当前 Harness 尚不存在的多租户认证或 CSRF capability。
- Client 只把 Host 返回的预分配 ID/preset/Workspace plan 交给现有 `session.create`；Thread 关系写入仍全部经过 Host Service，Host-side Tool 没有 Client `connection` Service，也无法调用创建 orchestrator。未来若 Web 获得认证/gesture token，Thread 必须绑定同一机制。

## 分阶段实施

### P0：插件契约探针

- 在 `plugin/dsh-thread` 做最小 Host/Client probe，验证 strict Typert Remote 能跨安装树工作。
- 用 Host-owned create/rename plans 调现有 `connection.api.sessions.create/rename`，确认标题落标准 event 且 Thread 自身不驱动 Agent；随后 Remote 能按 ID 取得 live Agent，且对被其他 listener 驱动的目标 fail closed。
- 验证普通/partial create result、Host frame 到 `ctx.sessions.list` 的到达顺序，以及只重载 Thread rows 不停止 api-proxy 创建的 Agent。

#### 当前 GUI 动态探针结果（2026-08-21）

本轮先在真实用户 Home 的 Web GUI 上用 Session-owned dynamic Cordis Package 做临时探针；它不替代下述 out-of-tree P0/P2，也不构成 v1 实现：

- Runtime 基线与设计审阅基线同为 `1de422d998dc769156dcc8788fb9f76d4e9b842c`。Header Action、`tool.call.toolview` keyed Slot、`agents`、`sessions`、`apiProxy`、`agentPresets` 和所需 Session/Inbox Events 均存在；dynamic Host/Client 可同时进入 running。
- 现有 HTTP RPC 实测接受预分配 `session-thread-*` ID 和显式 `cordis` preset；同 ID/同 cwd 幂等返回，同 ID/异 cwd 返回带 `requestedCwd`/`existingCwd` 的 `session-conflict`。空白目标初始日志恰有 `permission/preset`、`sandbox/mode`、`approval/policy` 三个结构事件，`sessions.rename` 返回 `{ title, seq }`。这验证了 pristine 基线与 identity-conflict 输入。
- P1 首包把 roster 的可选 `broken` 等字段以 `undefined` 放进 Package-private RPC 结果，`harness.handle` 的 lossless-JSON guard 正确拒绝；P2 改为省略可选字段或显式 `null` 后 Host/Client 均恢复 running。正式 Remote 和所有 presentation meta 必须把同类边界纳入测试。
- Dynamic Client Guard 不提供 `connection`，所以临时 Header 原型只能让 Package-private Host handler 调与 HTTP gateway 同一个 `ctx.get('apiProxy').sessions.create/rename` 对象。它能验证现有 create owner/preset mount 语义，但不能验证最终包的“直接 Client `connection.api`”transport；out-of-tree P0 仍必须按本设计实现该 transport。
- P3 成功把 `thread_handoff` 登记进 Host `Tool.listTools`，并以 active occupant 注册到 `tool.call.toolview`；Header 入口也实际可见。但当前 Agent 的实际模型调用命名空间没有同步暴露该动态 Tool，故没有产生真实 `tool/call → tool/result.presentationMeta`，专属 Draft Card 未得到运行证据。一次误用 Subagent 得到的文本草稿是 parent-owned delegated runtime，不是 Thread、不得计入证据。
- Durable `session.list` 多次复核始终只有预检用 `session-thread-preflight-1787289245`，且为 `blank: true`；没有普通 continuation target。因此本轮没有证明 `authorize → beginCreation → create → rename → activateContinuation` 的端到端 UI 点击、`inject + followup + flush`、relation commit 或 Inbox fold。此前仅看到 Header 按钮不能视为全链成功。
- Web runtime 随后从 `127.0.0.1:60779` 重启到 `127.0.0.1:53748`；`thread-1/pkg-1..3` 定义随进程消失，而真实 Home 中的预检 Session 仍可查询。这实证了 dynamic Package 的 process-local 生命周期，也说明 restart/reconciliation 只能由真实 out-of-tree 包和 scratch `DSH_HOME` 测试承担。

#### 真实 out-of-tree 实现进展（2026-08-21）

- `plugin/dsh-thread/` 已建立独立 npm posture 包：Host gateway、preset-owned `dsh-thread/tool`、strict Typert Host/Client descriptors、Client Header/ToolView、Storage Domain、tests 与双面 tsdown bundle 均在包内；未修改 Harness 或 Tauri 源码。
- `thread_handoff` 返回有界 strict object，presentation meta 与 canonical result 为同一 owned Draft；`execute` 先经共享 Thread Service 持久化 inert `waiting-boundary` Draft，再调用 `concludeTurn()`，始终不 create、不 deliver、不 wake。正式 Tool row 通过用户 preset `standard-thread` 明确挂载，shipped `standard` 未改。
- Client 的唯一创建/命名路径是 `connection.api.sessions.create/rename`；Host gateway 只返回预分配 target/preset/title plan并持久化 Link。激活在 durable `activating/submitting` checkpoint 后重新执行 live/idle/pristine 检查，再同步 `inject → followup`，`sessions.flush()` 返回 true 后才写 `active + activation-flushed`。
- `dsh_thread` Storage Domain 以向后兼容的 v1 additive table 持久化 Draft，并继续持久化 Link、attempt、trace、relation commit 和 Inbox fold；`session/event` listener 只投影 owned leaf fields，不序列化 live Session/Agent。Tool Draft 只有在 Host 找到 exact `tool/call.callId` 与同 turn 的 `turn/end` 后才从 `waiting-boundary` 封口为 `editable/source-invalid`；Client 不提供 seq。
- registry posture 下 `typecheck`、22 个 node:test 和 Host/Client bundle 已通过。测试覆盖 Draft 数量/长度/版本与无 `undefined`、completed/aborted exact turn boundary、确定性 SHA-256 Link/target/thread root、连通 Session 的 `threadId` 继承与冲突拒绝、`actionId` create single-flight、固定 `standard-thread` authorization、旧 Link thread/workspace 字段兼容默认、Remote 输入上限、`active+flushed ↔ activation-flushed` 双向 durable invariant、fold lossless JSON，以及胶囊 visibility 的幂等切换和 Session subscriber 替换后保持展开。
- real Home 已通过公开 `agentPreset.copy` 创建用户 preset `standard-thread`，roster 返回 `trust:user` 且无 `broken`；Web Profile 已用当前 rc.8 runtime CLI 安装本地包。最初复制 `cordis` 的候选在当前创造模式会话仍挂载时重复注册 Inspect Provider，实机 mount fail loud；该用户副本已删除，改为复制 `standard`，shipped preset 均未改。Desktop 冷启动到 `127.0.0.1:58602` 后正式 Client bundle 返回 200，strict `/api/thread/state` 可读，dynamic Package 已随旧进程消失。
- scratch `DSH_HOME` 冷启动先后发现并修复两个普通 build 未覆盖的问题：Node 24 不解析保留在 gateway 产物中的 `@Remote` token（strict descriptor 已是权威，删除 marker decorator）；Storage Domain 名不接受连字符（backend unit 改为 `dsh_thread`，package/plugin id 仍为 `dsh-thread`）。修复后 Client bundle 200、strict `thread/presets` 成功，最小用户 preset 能实际创建普通顶层 Agent。
- scratch 正式链路完成 `authorize → beginCreation → session.create → session.rename → recordTitle → activate`：authorize 后 Session list 只有来源，Link 为 `authorized/prepared`；activate trace 严格为 `agent-live → agent-idle → target-pristine → inject → followup → flush`，最终为 `active/flushed` 且 commit reason=`activation-flushed`。fold 收到 4 条 Inbox splice、3 条 user entry、turn start/end 和 exact title；在停止 server、同一 `DSH_HOME` 冷启动后 Link/fold 完整恢复。
- 当前 GUI 另建 `standard-thread` Session `thread-gui-natural-language-20260821`，发送精确话术“我们准备搞一下深圳周末的旅行，我们交给下一个会话吧。”；history 得到 canonical `tool/call(name=thread_handoff)`、`tool/result(isError=false, meta.kind=thread-handoff-draft)` 和 `turn/end(completed)`。Draft 含目标、已确认结论、约束、待确认问题、标题与下一会话指令，Tool 回合未自行创建目标 Session。该测试源随后经公开 `workspace.archiveSession` 归档，未物理删除 Session 文件。
- 正式冷启动后用户再次直接点击 Card，产生唯一 target `session-thread-9aa0b97f-a8ee-4765-ac6d-98d6077f6753`；Link 为 `active/flushed`，commit reason=`activation-flushed`，trace 严格为 live/idle/pristine/inject/followup/flush，fold 含 4 条 splice、Handoff/instruction entries、turn start 和 exact title。来源 preset 为 `cordis`，正式 Client 按 `suggestedPreset → source Session agentPreset → global default` 正确预选 `cordis`。
- 首次功能探针 UI 被实机判定过于粗重：Header 是大号文字描边按钮，Card 是满宽 select + 满宽描边按钮；第二版仍把 heading/status/三段统计/select/action 分散成多层。当前版删掉所有 preset 读取和 selector，Tool Card 收敛为一行可换行布局：Thread 标签、目标、单句 carried-context 摘要和固定 primary action“在 Thread 中继续”。Header utility 使用 ui-primitives 的 `IconBranchOutline16`、`Tooltip` 和固定 `28×28` Button，未修改 sidebar DOM。
- P1 首个可靠性切片已实现：`drafts` table 保存 version/source anchor/boundary/status/content；Link/target 由 immutable Draft ID 的 SHA-256 确定性派生并兼容查找旧随机 Link；authorize 要求 exact `draftVersion + actionId` 并比对 durable content；`beginCreation` 持久化 `creationActionId`，同 action transport retry 幂等，另一直接点击在 `creating` 时 fail closed 为 `creation-in-flight`。Header 使用组件生命周期内稳定 Draft ID；完整 autosave/edit/discard 仍是下一切片。
- 固定目标、自动 Thread 关系与 Workspace 继承切片已实现：`authorizeRequestSchema.agentPreset` 是 `z.literal('standard-thread')`，Client 硬编码同一常量；Host 首次从根 Session ID 派生 `threadId`，后续沿 Link 连通分量继承并拒绝冲突；同时通过 `workspaceRegistry.list().sessionIds` 权威解析来源 membership，把 `targetWorkspaceId` 或未分组 `targetCwd` 持久化到 Link，并在 activation 前再次验证目标 membership/cwd。旧 Link 缺少这些字段时以 `null` 加载。广州 Draft 在该 Host 改动重启前已被点击并形成 active Link，因此只算修复前样本。
- 最终 real Home 验证使用 `dsh-desktop` Workspace 内的新 `standard-thread` 来源 `session-571a981c-132f-4564-aa58-9e9ee320b490`。Agent 先完成露营选址阶段，再主动生成下一阶段 inert Draft；用户看到无 preset selector 的 Thread Card 后直接确认。Host 产生 Link `thread-880c60e3e2cfd72d803baa25fb5a8dfd`、`threadId=thread-root-ad13a50161ba8fa648bef9cf7c3e3354` 和目标 `session-thread-f542d2325002c84921ad35349cbbd7c3`，固定 `agentPreset=standard-thread`。Link 持久化 `targetWorkspaceId=d44cf607-80c3-4861-96f3-51cd94274054`、`targetCwd=null`；该 ID 在 workspace storage 中是 `dsh-desktop`，其 membership 前两项分别为目标和来源。activation trace 含 `target-workspace: ok` 后再 pristine/inject/followup/flush，最终 `active/flushed + activation-flushed`。固定 Thread 模式、主动阶段识别、direct confirmation、stable threadId、同 Workspace 创建和有界 Handoff 全链通过。
- 2026-08-22 按用户反馈把原生右栏改为对话正文右上角的持久大胶囊。冷 Host 加载 Client rev `581c49de6de2` 后，`dsh-desktop` 的 committed 两会话 Thread 实测：按钮位于 `header.utilities` 最右侧；正文 rect 为 `top=76/right=1470` 时，胶囊 rect 为 `top=92/right=1454/width=460`，四边严格位于正文内且不再锚定按钮；computed background=`rgb(44,44,46)`、shadow=`--dsw-shadow-lv3` 的展开值；系统 details 轨道全程 `0px`；目标→来源导航后胶囊保持展开并切换 `aria-current`；外部 pointer press 与 Escape 保持显示，只有再次点击 Thread 图标关闭。480×700 下正文只剩 200px 时，胶囊仍收缩为 168px 并完整落在正文 rect 内。

结论：动态探针钉死 Slot/Service/API/JSON/pristine 契约；真实包、显式用户 preset、正式 Client transport、自然语言与主动阶段边界 Tool、direct-confirmation activation/fold、stable threadId、同 Workspace 创建、跨冷启动恢复、正式 UI 与 P1 第一段 durable Draft/create single-flight 均已有证据。下一焦点是 versioned Draft autosave/discard、`session-published/activation-incomplete` 与完整 Delivery fold。

| 动态探针验收面 | 状态 | 证据或偏差 |
| --- | --- | --- |
| Header Slot 与入口渲染 | 通过 | Slot contract 存在，Package Client running，用户确认入口可见。 |
| Host Service/Event 契约 | 通过 | `agents`、`sessions`、`apiProxy`、preset roster、Session/Inbox 事件均已探测。 |
| create/rename 与预分配 ID | 通过 | HTTP RPC 接受自铸 ID/preset；rename 返回标准 `{ title, seq }`。 |
| create identity reconciliation | 通过 | 同 ID/同 cwd 幂等；异 cwd 返回 `session-conflict` 和双 cwd 详情。 |
| pristine 初始事件集 | 通过 | 新目标只有 permission/sandbox/approval 三个结构事件；可选 exact title 为第 4 个。 |
| Package-private JSON 边界 | 通过（修复后） | P1 的 `undefined` 被 guard 拒绝；P2/P3 归一化后两端 running。 |
| 最终 Client create transport | 通过 | 正式 Client 用 Host plan 调用 `sessions.create/rename`，目标进入来源 Workspace。 |
| `thread_handoff` Tool 注册 | 通过 | `standard-thread` 模型实际调用 Tool；系统提示覆盖输入跨阶段与完成阶段后的主动提议。 |
| inert Draft durable Card | 通过 | exact tool/call/result 与 completed boundary 生成 editable Draft；确认前无目标。 |
| authorize/create/rename/activate UI 全链 | 通过 | 新 Link 有 stable threadId、fixed preset、exact workspace，最终 active/flushed。 |
| `inject + followup + flush` 与提交理由 | 未验证 | 无目标 Session 日志可审计。 |
| Inbox/turn fold | 未验证 | 没有 spliced/claimed/entered 运行样本。 |
| 动态包跨重启 | 不支持（符合预期） | Runtime 重启后 Package 定义丢失；真实 Session 日志仍保留。 |
| Harness/Tauri 源码零修改 | 通过 | 探针只使用 dynamic Package 与公开 API；设计 note 落在 desktop feature worktree。 |

### P1：手动 Thread MVP

- 完成 storage domain、Host Service、Remote、Header Action、Assistant Action、Handoff Dialog 和 Header Thread Popover。
- 实现 `authorizeContinuation → beginCreation → session.create → rename? → activateContinuation` Client orchestrator；不复制创建 policy。
- Thread 不在 create/start listener 驱动目标；只有显式 activation 才按顺序入队 Handoff 和 waking instruction，非 pristine 目标拒绝。
- 实现 authorization aggregate、Session flush → relation commit、new-ID recovery attempt、abandon/cancel checkpoint、完整 Inbox/turn fold 与 restart reconciliation。

### P2：自然语言草稿

- 增加 `thread_handoff` Tool、durable presentation meta 和专属 Tool View。
- 将 Tool row 显式组合进选择的 Agent presets，验证未挂载 preset 中工具不可见。
- 验证 Tool 误调用最多产生 inert Draft，不能启动 Session。

### P3：导航与可靠性补全

- 完成独立 Header create/relation/pending Actions、全局 pending 找回、一跳跨 Workspace 脉络 Popover、批量 count 和 unavailable 标记。
- 验证插件不改变 workspace/flat 的 DOM、排序、拖拽、搜索或 ARIA。
- 加入断线后的 `syncing-list` 恢复和 partial Workspace attach 重试。

### P4：后续双向投递

- 增加 `thread_publish`、结果确认和 context-update Delivery。
- 增加“来源已有新完整回合”的建议性提示，不自动同步。
- 评估归档投影、长期 Thread 数量、domain 清理和导出需求。

## 验证计划

### Host 单元测试

- Link relation commit、incoming/outgoing neighborhood 投影和一对多分支。
- Handoff/Delivery schema 的数量、字符、UTF-8 字节和 JSON 边界。
- idempotency key 单飞、`links.put` authorization commit、`links.update` RMW、失败重试和并发写链。
- tool call / assistant message / latest turn 来源锚点只接受 completed/blocked/max-tokens turn/end，拒绝 aborted/error/interrupted。
- `authorizeContinuation()` 单次发布完整 aggregate；`beginCreation(actionId)` 在普通 create 前单飞，进入 `creating` 后 cancel 必须拒绝，`abandon-creation` intent 必须让 stale Client activation fail closed，late reject 不能覆盖另一 attempt 已证明的 publication。两者都不能创建或唤醒 Agent。
- 现有 `session.create` 的 preset resolve/mount failure 发生在目标 publication 前，并被 `failCreation()` 正确映射。
- 完整 splice fold 通过 open turn 区分 pending、claimed、entered、canceled 和 consumed-without-entry；mid-pre-step snapshot 在 `turn/end` 前保持 claimed。
- Attempt phase 覆盖 replacing-old 前/中/后与 submitting 前/中/后；abandon intent 覆盖 remove/flush/finalize 三个 crash window。
- Session flush 缺席/失败、flush 成功但 Link update 前崩溃和 Handoff-only activation 分别恢复为无 commit、`activation-flushed` 或 `irreversible-impact`；live provisional claim 不能提交关系。
- Workspace 继承、改选、现有 attach partial result 和重试路径。

### Agent 集成测试

- 目标 Session `seedLength`、`parentSession` 均缺席，events 不含来源前缀。
- 目标 SessionHeader 记录目标 preset，实际 Tool catalog 与该 preset 一致。
- Thread 的 `agent/session-start` listener 在 create response 前只标记 published，不入队；其他 listener 若驱动目标，`activateContinuation()` 必须以 `target-not-pristine` 拒绝。
- 显式 activation 只接受 live/idle/pristine 目标，同步先 inject、再 followup，并在 relation commit 前等待 `ctx.sessions.flush()` 返回 true；首轮模型消息顺序稳定。
- pre-step rejection、显式 cancel 和 claim 后崩溃不被伪装成 entered；恢复性 attempt 使用新 IDs；retained log 中每个 ID 最多插入/进入一次，pre-flush crash 覆盖 uncertain warning。
- 来源 Tool schema、系统提示和命令历史不进入目标请求。
- 只 HMR 重载 Thread rows 不停止 api-proxy Host owner 持有的普通 Agent；插件停用后持久化 Session 可由基础 Runtime 恢复。

### Client 测试

- Header 在运行中固定最近完整回合并排除当前回合；Assistant Action/Tool Draft 只在来源回合 finalized 后可确认。
- Handoff Dialog 的 preset、工作区/未分组、草稿编辑、丢弃、busy、失效字段和分类恢复。
- Tool View 覆盖 awaiting-create/activation、activation-incomplete、replacing-old、abandoning、delivery-uncertain、abandoned、active/partial、delivery-attention 和 failed 状态以及点击单飞。
- Client 每次直接 create 尝试只传一次 Host plan，可选 title 只走 Host `rename` plan，并正确处理 response/frame 任意顺序、partial、unknown outcome、activation 和 `created-not-visible`。
- Header 的 create、direct-relation badge 和 global pending 三个 Action 语义独立；`0 relations + pending`、不可用邻接和目标侧 awaiting activation 都可发现。
- Workspace/flat 行 DOM、尺寸、排序、拖拽和菜单完全不变；Sidebar 收起时 Header 仍可查看脉络。
- Popover 只显示一跳邻接并逐边导航；文本在中英文、窄主栏和长 preset/session title 下不溢出。

### 组装快照与 e2e

- 添加 Web GUI 无密钥旅程：预研会话准备交接 → 选择另一 preset → 新会话首轮 → 返回来源。
- 快照断言目标请求只包含有限 Handoff，不包含来源完整 transcript。
- 使用 scratch `DSH_HOME` 在 authorized、creating、session-published、Handoff-only、replacing-old、submitting、abandon-canceling、mid-pre-step claimed、flush-before-Link-update 和 entered 窗口重启，验证 relation commit 与 new-ID recovery。
- Playwright 截图覆盖桌面/窄主栏下三 Header Actions、Dialog、两个 Popover 的无重叠/无溢出；同时覆盖普通浏览器 `dsh web` 和桌面 sidecar，Tauri 不需要新增 IPC。

## v1 验收标准

- 用户不创建 Thread 对象即可从普通会话启动承接会话。
- 没有直接 Client 确认时，不会调用现有 `session.create` 或 `activateContinuation()`；Tool 和 listener 都无创建/投递/唤醒路径。
- 目标会话是普通顶层会话，无 seed、无 fork lineage，并运行所选 preset；目标标题只经公开 `sessions.rename` 应用，Thread 本身在 create 与 activation 之间不发送模型输入，非 pristine 目标不激活。
- 交接内容有界、可预览、可编辑；入队后写入标准 inbox event，进入模型时写入标准 `user/message`。
- Session publication 本身不形成脉络；正常路径在两条 activation message flush 后以 `activation-flushed` 提交，Handoff-only 只有 persisted claim/entry 才以 `irreversible-impact` 提交。未受影响的目标可带 intent 安全放弃，并继续遵守普通 blank Session 的隐藏/复用语义。
- 关系和 saga checkpoint 跨重启保留；完整 Inbox/turn fold 保证 retained log 中同一 message ID 最多插入一次、进入一次；pre-flush crash 明示 `uncertain`，恢复/重投只在用户新确认后以新 attempt/IDs 执行。
- Workspace attach partial 会返回可打开的目标 ID；它与 relation/delivery state 独立，不丢失或静默删除已启动 Session。
- 工作区分组与单列表的行为和普通行 DOM 不变；v1 只从 Header 局部导航。
- `thread_handoff` Tool 只准备 inert Draft，Cordis listener 只重建 lifecycle/Inbox 状态；唯一创建调用是确认动作发出的现有 `session.create`，唯一初始投递调用是确认编排发出的 `activateContinuation()`。
- 只 HMR 重载 Thread rows 不停止 api-proxy owner 的普通 Agent；插件停用不使普通会话日志不可读。
- 不替换 `sidebar.workspaces`，不修改 Tauri 壳，不把功能塞入 desktop bridge。

## Post-v1 附录：Human Command

本节不属于 v1 package、Remote contract 或验收面。`/thread` 若以后实现，只是快捷入口，不是 Web 主路径。plugin-only 方案不让 Host Command 自行创建 Session，因为普通创建权位于 Client 的现有 `session.create` 调用链。

- `/thread`：返回用法或待确认 Draft，不尝试从 Host 打开 Client 弹层。
- `/thread <preset> <instruction>`：生成已填好 preset/instruction 的 inert Draft；用户仍需在专属 Command Row 点击“在新会话继续”。
- `/thread related`：返回当前会话脉络摘要。

Client 可在 `conversation.chat.commandview` 为 key `thread` 注册专属 Command Row，并从按钮进入同一 Client orchestrator。Command 本身不发布 Session，取消时只留下或丢弃 Draft。
