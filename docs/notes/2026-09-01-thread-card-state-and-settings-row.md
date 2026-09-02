# 2026-09-01 · dsh-thread：卡片状态持久化 + 设置行样式对齐 + 看板自动展开

## 背景

三个 UI 缺口在同一次变更收口：

1. **交接卡片状态失忆**：`ContinueButton` 的 phase 是纯组件 `useState`——创建成功后按钮仍显示「在 Thread 中继续」且可点击（会以新 actionId 重复建会话），页面刷新后彻底回到初始态。
2. **设置行样式违规**：`settings-row.tsx` 用裸 inline style 自绘 36×20 开关，违反「通用设置页新行照 AppearanceRow/mcp-settings 词汇表」的仓规（见 2026-08-20-rc45 笔记），且文案硬编码中文。
3. **新会话无上下文展示**：从卡片首次跳入目标会话时，Thread 看板保持关闭，用户看不到携带过去的交接内容。

## 决策

- **卡片状态由 gateway 持久记录驱动**：挂载时 `loadState()` 按 `draftId` 查 link——`active` → 「打开 Thread 会话」（点击 `openSession` 跳转）；`failed/uncertain` → 错误 + 「重试」；`authorized/creating/activating` → 进行中禁用；无 link 才是「在 Thread 中继续」。刷新不丢、不重复创建。本地 phase 仍负责本次点击的即时反馈。
- **按钮文案随生命周期换名**：CTA 是动作（继续）与结果（打开）两种语义，一个名字覆盖不了。
- **首次按钮驱动到达新会话即 `panelVisibility.open()`**：看板随导航自动展开；后续手动 toggle 不受影响。
- **设置行复用 Web Search 词汇**：32×18 `label+checkbox[role=switch]`、`state-business-primary` 开启色、inset 细边关闭态、状态文本（已开启/已关闭/应用中…）。CSS 以字符串常量随包内既有 `THREAD_SIDEBAR_CSS` 同一 style 标签注入——**不引入 lightningcss 管线**，包内先例优先于跨包先例。
- **locale**：新增 `dsh-thread` 命名空间（zh/en），仅覆盖设置行文案；会话内卡片文案仍硬编码中文，留待后续统一。

## 影响面

- `src/client/index.tsx`（卡片状态机、face 增 `openPanel`、locale 注册）、`src/client/settings-row.tsx`（重写）、`src/client/locales.ts`（新增）、`package.json`（devDep += `@deepseek-ai/dsh-client-locale`）。
- host 半零改动；持久 schema 零改动（link/draft 记录原样复用）。

## 追加（同日）：开关状态文本闪烁修复

- **现象**：拨动 Thread 开关时状态文本闪「应用中…」→「已开启/已关闭」，两次 key 重挂载各播一次淡入，视觉上即"闪烁"。
- **修法**：引入 `PENDING_NOTICE_DELAY_MS = 300`——pending 提示延迟 300ms 才显示，快提交直接由「已开启」切「已关闭」，「应用中…」只在提交超过 300ms 时出现（dsh-web-search-toggle 的 `PENDING_NOTICE_DELAY_MS` 同款模式）；另加 5s failsafe 防丢失的写入把行卡死在乐观态；镜像折叠回来即清除 pending。
