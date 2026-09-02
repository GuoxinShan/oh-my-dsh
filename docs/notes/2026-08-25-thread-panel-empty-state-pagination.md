# Thread 胶囊：空态重设计、blank 门控与列表分页

日期：2026-08-25

状态：已实现（实机回归待用户在浏览器刷新后确认）

## 决策摘要

三处用户可见问题一次收敛，全部只动 `dsh-thread` 插件的 Client 半（外加一个纯函数模块），不改 Host 契约、不改 durable schema：

1. **空态重设计**：会话不属于任何 Thread 时，胶囊正文从「左上角一行小字 + 大片留白」改为居中引导块——`IconBranchOutline16` 图标圆盘（`bg-layer-1` + `border-l1`）、主标题「尚未加入 Thread」、一行 12px secondary 说明，最大宽度 300px 居中。加载态（「正在读取 Thread…」）复用同一居中容器。表面 token 不变，仍纯 `--dsw-*`。
2. **blank 会话门控**：入口按钮（`conversation.session.header.utilities`）与胶囊（`shell.overlay`）双双以 `SessionSummary.blank`（host 投影的空日志位）为门——blank 或 summary 未到时按钮不渲染、胶囊不渲染也不测量几何。可见性 store 不自动关闭：从已开启会话切到 blank 会话时胶囊只是不渲染，切回已开始会话后原样恢复，保持「跨会话切换不塌」的既有语义。判定读取走 selector hook 返回布尔，不订阅整个 summary 对象。
3. **分页**：胶囊内会话列表每页最多 8 行、当前会话产物列表每页最多 5 卡，超出部分折叠进紧凑 `‹ 页 / 页数 ›` 翻页行（仅多页时渲染，ChevronLeft/RightOutline14 + tabular-nums 页码，禁用端点降透明度）。会话页码在导航后自动跳到包含当前会话的页（`pageOfIndex`），产物页码在切换查看会话时重置回第 1 页；列表收缩时页码经 `paginateList` 钳位，不留空页。纯函数分页器独立成 `src/pagination.ts`（`paginateList` + `pageOfIndex`，1-based、pageSize 非正整数 fail loud），node:test 覆盖边界。

## 备选与理由

- **行数取值**：会话 8 行 ≈ 360px、产物 5 卡 ≈ 350–450px，加头部与 identity 段仍落在常见视口的 `maxHeight`（正文高度 − 32px）内；再多的行数会让翻页失去意义，再少则频繁翻页。常量在 `panel.tsx` 顶部导出（`THREAD_SESSION_PAGE_SIZE` / `THREAD_ARTIFACT_PAGE_SIZE`），后续调整单点。
- **blank 判定用 `blank` 而非消息数**：`SessionSummary.blank` 是 host 日志投影的官方「空日志」位，与侧栏/工作区浏览器的 blank 语义同源；Client 侧数消息会引入第二个事实源。
- **不自动关闭 store**：决策记录 2026-08-21 明确「Session 切换导致 Header subscriber 替换时仍保持展开」；blank 门控只挡渲染，不篡改用户显式切换过的可见性状态。

## 影响面

- `src/client/panel.tsx`：空态/加载态重排、两处分页、Pager 组件。
- `src/client/index.tsx`：HeaderUtility 与 ThreadCapsuleOverlay 的 blank 门控。
- `src/pagination.ts`（新）+ `tests/pagination.test.ts`（新）：纯函数与边界测试。
- Host 半（gateway/tool/draft/identity）零改动；已持久化的 Link/Draft 数据不受影响。
- 已构建 `lib/client.js` 随 profile link 即时生效，浏览器刷新即得新 rev。

## 补充（同日）：去掉胶囊内顶栏 + 收紧纵向间距

实机回看后续两条审美修正：

1. **删除胶囊自带 header**（图标 +「Thread」标题行，52px）：开关本就由会话 Header 的 Thread utility 承担（决策记录 2026-08-21：只由该图标关闭），胶囊内再画一条标题栏是重复信息且吃掉内容高度。`aside` 保留 `aria-label="Thread 面板"`，可访问性不丢。去掉 header 后，末位 section 的底部分隔线会贴在 24px 圆角底边上，artifacts section 改用无边线的 `sectionLast`。
2. **纵向密度整体收紧**：identity/section padding 16/14 → 12/10，session 行 minHeight 42 → 36、padding 7 → 5，列表 gap 3 → 2，产物卡 padding 10 → 8、gap 7 → 5，sectionHeading marginBottom 9 → 6，pager marginTop 8 → 6，空态 padding 34/38 → 12/14（含图标 marginBottom 12 → 8）。横向 padding 与字号不动。
