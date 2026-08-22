# dsh-send-while-running：Agent 运行中保留发送按钮（2026-08-22）

## 问题

stock composer 的主按钮是 Send/Stop 合一的：普通会话（`subagent === null`）
一旦 running，`primaryStops = running && subagent === null` 为真，主按钮翻成
Stop（`InputBar.tsx` onPrimary）。此时指针用户在输入框里打了字（想插入对话/
排队 follow-up），右下角却没有任何可见的发送入口——只能靠键盘 Enter（busy-Enter
策略）。用户要求：运行中且草稿有内容时，Stop 左边应该还有一个发送按钮；暂停/
停止后恢复原样；以插件形式实现，不改 harness 源码。

## 为什么是 additive slot 而不是 DOM 注入或替换

仓里已有两类姿势：dsh-model-image-input 的纯 DOM 注入（目标区域没有声明槽）、
dsh-branding 的 single-seat 占位。这里目标区域恰好有**已声明的加性 list 槽**
`conversation.input.right`（ui-conversation 的 conversation entry 声明，
`replaceRisk: none`，occupants 为空），owner share 就是 `InputZone
{ session, input }` 快照，且 session standard kit 直接给 `inputActions`——
数据与动作全部现成：

- 可见性：`session.running && session.subagent === null && !session.removed
  && (draft.trim() !== '' || imageIds.length > 0)`——逐项对照 stock
  `primaryStops`/`empty` 的定义，恰好是「主按钮已翻成 Stop 且用户有东西可发」。
- 动作：`inputActions.submit()` ＝ SessionInputShell.actions.submit ＝
  `submit('queue')`，与 stock Send 按钮 onPrimary 走的**同一条公共路径**
  （排队进运行中的 turn）。不是绕开机器自建 sink。
- 派生状态（adjudicating/submitting 置灰）镜像 stock `machineBusy`。

加性槽注册即 effect（disposer 随 fiber 回收），HMR/卸载零残留，比 DOM
observer 简单一个量级。continuable 子会话排除——它们的主按钮本来就是 Send、
旁边另有独立 Stop（stock `interruptible` 分支），再插一个就是重复。

## 布局：slot 渲染位置 vs 视觉位置

`conversation.input.right` 在 `.trailing` 行内的**渲染**位置在 model seat 与
ContextMeter 之前，直接渲染会得到 [send][model][meter][stop]。视觉要求是
[model][meter][send][stop]，所以按钮 `order: 1`，再用一条 `:has()` 作用域
规则把 stock 主按钮顶到 `order: 2`：

```css
div:has(> [data-slot="conversation.input.right"] .dsh-send-while-running)
  > button:last-of-type { order: 2 }
```

锚点全部是文档化接缝：`[data-slot=...]` 是 slot 系统的 addressable anchor
（ui-renderer 对每个 render site 恒定暴露）；`button:last-of-type` 成立的
依据是 `.trailing` 的直接 button 子元素只可能是 subagent 独立 Stop 与主按钮，
而前者与本按钮的可见性条件互斥（subagent !== null 时不渲染），故恒为主按钮。
关键性质：**`:has()` 只在本按钮挂载时匹配**——按钮卸载（草稿清空/turn 结束）
后规则失效，布局逐字节回到 stock；其余一切状态（hero、无 session、空闲）不受
影响。不引用任何 stock CSS-module 类名（module hash 更名打不断）。

## 类型与构建

- `@deepseek-ai/dsh-client-ui-conversation` / `dsh-client-locale` 仅
  **type-only** import：前者拉 SlotMap 声明（`conversation.input.right` +
  session standard kit），后者拉 `ctx.locale` 的 Context merge。构建时擦除，
  client bundle 唯一 require 是 `react/jsx-runtime`（平台基线 external）——
  纯度门通过，无需 runtime peer 链接（同 dsh-model-image-input 的
  browser-only 形态）。
- 组件 props 用**本地结构子集**（session/input/inputActions 各取所需字段，
  全部 optional）：公共 client index 并不 re-export `InputState`/`InputActions`，
  而组合契约（ComposedProps）对组件是结构化检查——真 props 必然满足子集，
  typecheck 即验证了「我读的字段真实存在」。
- 文案走自己的 `send-while-running` 字典 namespace（zh/en），注册
  `locale: NS` 拿标准 `t` 席位；不借道 ui-conversation 的 namespace。

## 验证

- 单测（node:test）：可见性谓词全覆盖（未运行/空草稿/纯空白/纯图片/
  continuable/removed）、busy 相位、组件缺 share 渲染 null、CSS 只锚
  文档化接缝、stylesheet installer append/remove。
- scratch home 实机：`dsh plugin --profile web add` → `dsh web --port 3987`
  → boot graph 含本插件行、`/plugins/dsh-send-while-running/client.js` 200、
  CDP headless 打开页面后 `style[data-dsh-send-while-running]` 已注入
  （module loader → fiber apply → effect 全链路）。
- 交互态（运行中 + 草稿非空时按钮出现）先以动态 Cordis 插件（swr-2/pkg-2，
  同一逻辑）在本会话 GUI 里验证通过，再落成出树插件。

## 已知边界

- `button:last-of-type` 依赖 stock 主按钮仍是 `.trailing` 的最后一个直接
  button 子元素；ui-conversation 结构变更需同步重查该选择器（与桥插件
  `nth-child` 锚点同性质的声明性假设，README 已注明）。
- `.row` 在窄卡下 flex-wrap：极端窄宽时 [send][stop] 可能随 `.trailing`
  整组换行——与 stock [model][send] 的换行行为一致，非本插件引入。
- 按钮点击固定 queue 投递（与 stock 按钮一致）；busyEnter=steer 偏好只
  影响键盘手势，这是 stock 语义，本插件不另造策略。
