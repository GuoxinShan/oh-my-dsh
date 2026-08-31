# 2026-08-31 dsh-question-rail：问题刻度尺插件

## 背景

用户在长会话里需要一个快速回看自己提问的入口。先在会话内以动态 Cordis 插件
（`qnav-1`，pkg-1 → pkg-10）迭代了十轮定稿，再把最终行为固化为仓内正式插件
`plugin/dsh-question-rail`，并纳入 desktop-owned 分发（七包事务）。

## 形态决策

- **browser-only**（client 面）：空 host apply + `exports["./client"]`，与
  dsh-branding / dsh-send-while-running 同形态；client bundle 零 `@deepseek-ai/*`
  值导入（纯度门），ui-conversation / ui-locale 仅 type-only import。
- **挂载点 `conversation.input.dock`**（加性 list 槽，order 30）：这是迭代中
  最关键的一次转向。此前挂 `conversation.session.header.actions` + `position:
  fixed` + JS 轮询追踪，侧栏收起展开时尺身必然滞后/漂浮（fixed 元素不在列的
  布局运动里）。改挂 dock 后，0 高度锚点（负 margin 抵消 composerStack 6px gap）
  随 sticky 输入区一起参与列的布局运动——大位移零 JS 追踪；120ms 轮询只校准
  锚点与 `[data-conversation-scroll]` 的边距差（一次 getBoundingClientRect，
  sameRailGeometry 未变不 setState）。

## 行为决策（十轮动态迭代的结论）

1. **数据源**：dock 槽 owner share 的 `session`（ConversationSnapshot 时点快照，
   owner 重渲染驱动，组件内不订阅）；收集 `chat.nodes` 里 `kind === 'user' |
   'steering'` 的节点，文本块拼接折叠空白，纯图片/附件回退文案（locale 双语）。
2. **显示阈值 `MIN_QUESTIONS = 6`**：短会话不出现，避免常驻噪音。
3. **刻度等距**：第 i 条在 `(i+0.5)/N` 处。早期版本按消息真实滚动距离等比映射，
   消息长短不一导致刻度挤散难看，用户明确要「相对位置等距」。
4. **尺身无背景、垂直居中、≤220px**：早期全高带底条版本被指「太长」，最终
   只剩悬浮刻度线；悬停才出现面板。
5. **展开面板 = stock Menu 观感**：`--dsw-specific-menu` 底、inverted 细边、
   `--dsw-shadow-lv3`、dense 行（34px/r10/interactive hover）、tertiary 辅助字、
   l2 滚动条 rebinding——全部照抄 `ui-primitives/Menu.module.css` 的 token 契约
   （带 Theme.listTokens 外 token 的 fallback）。条目无序号、文字顶格、右侧时间。
   去掉 `title` 属性（浏览器原生白底 tooltip 违和）。
6. **`overflow: hidden` 在尺身上是负载承重**：pkg-8 重写时丢失过一次，展开面板的
   滚动条和滚动文字双双溢出圆角盒；tests 里有断言防回归。列表另加
   `overscroll-behavior: contain` 防滚轮链到正文。
7. **跳转**：按聊天视图自带的 `data-chat-anchor-key`（ChatView 自己的锚点机制，
   dataset 等值匹配而非 CSS 转义）定位消息行，`scrollIntoView` smooth + 1.6s
   flash 高亮（timer Service 的 ctx.timeout 回收 class）。
8. **timer 类型**：cordis-client-runner 的 client timer Service 把
   `interval/timeout` merge 进 cordis Context；本包不 import runner，在自己的
   `declare module '@deepseek-ai/cordis'` 里结构性重declare 同签名成员
   （inject 含 `timer`，运行时 mixin 由 runner 提供）。

## 分发决策

- 纳入 desktop-owned 集合（六包 → 七包）：prepare 记录 tarball hash、revision
  manifest 增版本字段、壳首启同一事务幂等 `plugin add`。tag 走
  `dsh-question-rail-v<semver>`；npm 双通道**不**开（allowlist 不含本包）。
- 安装面同其他插件：`dsh plugin --profile web add <repo>/plugin/dsh-question-rail`。

## 已知边界

- DOM 锚点依赖 ui-conversation 的 `data-conversation-scroll` /
  `data-chat-anchor-key` 接缝（与 send-while-running 的 `data-slot` 锚点同性质）；
  失配时 fail-invisible（测不到几何/消息行即不显示/不跳转），绝不 crash。
- 早于当前窗口的历史（hasMore 未加载）没有消息行，对应条目点击不跳转——
  与聊天视图的分页契约一致。
