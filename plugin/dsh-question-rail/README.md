# dsh-question-rail

对话左缘的「我的问题」刻度尺：会话里你自己的提问（含 turn 中插话）达到 6 条时，对话滚动区左缘出现一把垂直居中、无背景的刻度尺——每个刻度对应一条提问，按序号等距分布；鼠标悬停即刻度尺展开为可上下滑动的问题列表（原生菜单观感），点击刻度或列表条目平滑滚动跳转到对应消息并短暂高亮。挂载在 `conversation.input.dock` 加性槽（输入框正上方的 0 高度锚点），尺身随正文/输入框一起参与布局运动，侧栏收起展开不割裂；终端 `dsh web`、普通浏览器、桌面壳同一条路，无桌面门控。

## Install

```sh
dsh plugin --profile web add <repo>/plugin/dsh-question-rail
```

The bundle patch mounts the `dsh-question-rail` row for every profile that installs
this plugin.

## Client half

`lib/client.js` is the ModuleLoader closure artifact (window.__ModuleLoader__
.load) with platform modules externalized — the build contract lives in this
package's `tsdown.config.ts`; keep `CLIENT_EXTERNALS` in sync with the
harness `PLATFORM_MODULES` baseline when it moves.

## Behavior

- 显示阈值：`MIN_QUESTIONS = 6`（`src/client/facts.ts`），不足 6 条提问时完全隐藏。
- 刻度：第 i 条提问固定在 `(i+0.5)/N` 相对位置，严格等距。
- 展开面板：stock Menu 同款观感（menu 底色、inverted 细边、lv3 阴影、dense 行高），
  列表 `overscroll-behavior: contain` 不把滚轮链到正文；尺身 `overflow: hidden`
  把滚动条与文字裁在圆角盒内（负载承重，勿删）。
- 跳转：按聊天视图自带的 `data-chat-anchor-key` 定位消息行，
  `scrollIntoView` 平滑滚动 + 1.6s 高亮闪烁。
- 几何：120ms 轮询只校准锚点与滚动体的边距差（一次 `getBoundingClientRect`，
  未变化不 setState）；大位移由布局流承担。
- 历史全量（0.2.0 起）：聊天视图是窗口化分页的（每页 50 条），但刻度尺的契约是
  「我问过的全部问题」——挂载后经公开 `SessionFace.loadOlder()` 在后台逐页载入
  历史直到 `hasMore=false`，刻度随每页落地渐进补齐；stock 的 prepend 锚定保证
  阅读位置不跳。安全上限 `MAX_AUTO_LOAD_PAGES = 40`（2000 条消息），到顶后面板
  标题追加「更早的未载入」。会话切换/卸载即取消循环。

## Config

无 cordis.yml `config` 字段；行为常量集中在 `src/client/facts.ts` 顶部。

## Design notes

- 决策记录：`docs/notes/2026-08-31-dsh-question-rail.md`（仓根）。
- Contracts live in the repo root `AGENTS.md` (plugin monorepo rules, npm
  dependency discipline, client bundle build contract).
