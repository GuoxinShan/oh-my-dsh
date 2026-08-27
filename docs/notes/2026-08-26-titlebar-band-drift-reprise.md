# 标题带控件"上漂"复现（2026-08-26）

## 问题

8-24 已修过一轮（bridge 0.2.0-rc.3 + desktop 0.2.0-rc.23：建窗钉零 WKWebView content insets + `html,body{overflow:hidden;}`），实机仍复现同一视觉：

- 刚打开对齐；
- 用着用着（会话列表滚到头之后尤其明显），标题带里的侧栏开关相对红绿灯上漂一点点；
- 点一下收起/展开立刻恢复，过一会又漂。

浏览器与终端 `dsh web` 仍不可复现。

## 根因

8-24 的分层判断没有错：**原生红绿灯不动，网页 overlay 在动。** 带内开关是 `position:absolute;top:8px`，定位链锚在文档流上，不是视口；根滚动器出现任何 `scrollY > 0`，整帧（开关、拖拽条、字标）上移，红绿灯是钉死的 NSView——参照物错位即"上漂"。点收起/展开能恢复，是因为 `toggleSidebar()` 触发的 grid 布局把根偏移钳回 0，和当时"双击放大缩小复位"是同一条意外自愈，不是开关自己把位置算对了。

错的是两条"修完就够"的假设：

1. **`overflow:hidden` 挡得住 WKWebView 的根滚动。** 不能。AppKit 给 Overlay 标题栏配的 `automaticallyAdjustsContentInsets` 是 **NSScrollView 自己的 content inset 可滚范围**，和 CSS overflow 不是同一条轴。内部面板滚到头后滚动链仍能把原生 clip view 挪几像素并停住；CSS hidden 只挡住 document 自己的 layout overflow。
2. **inset 钉位只在建窗跑一次就永远有效。** 不能。WKWebView 在 `PageLoadEvent::Finished`（以及窗口重新成为 key）会重配内部 scroll view，AppKit 把 `automaticallyAdjustsContentInsets` 打开并写回 ~28pt inset。8-24 钉的是空文档时期的那一个 scroll view，页面进来之后被改回去，于是"刚打开没问题，用一会才漂"。

## 决策

两层都把"钉一次"改成"反复钉 + 漏网立刻钳"：

- **壳侧**：`disable_webview_auto_content_insets` 在建窗、page load finished、成为 key、以及 `observe_titlebar_layout` 的 redraw（resize / 全屏 / 结束 live resize）都跑。除了 inset 钉零，再关 `NSScrollElasticity`（横竖）和 magnification，并把 `scrollerInsets` 一并清零。日志只在实际从非零/自动态改过来时打，避免缩放动画逐帧刷屏。
- **插件侧**：`titlebarCss` 首条改为 `html,body,#root{overflow:hidden;overscroll-behavior:none;}`（`#root` 是 web 壳的第三层 100% 高盒子；`overscroll-behavior` 断内部面板到根的 chain-scroll）；`installScrollLock` 捕获 document 根（window / html / body）的 scroll，立刻 `scrollTo(0,0)`。内部 `overflow:auto` 面板按 event.target 排除，会话列表照常滚。

不把带内开关改成 `position:fixed`：若根还在滚，字标（侧栏 padding-top:28）会单独漂，开关却钉在灯边上，错位从"整列一起漂"变成"开关和字标互相漂"，更难看。正确的是根偏移本身不准存在。

对应 bridge 0.2.0-rc.4 + desktop 0.2.0-rc.24。

## 行为边界

- 会话内长内容滚动不受影响：那些发生在 `.centerCol` 等内部滚动容器，scroll lock 按 target 放行。
- 门控仍是 `shouldFuseTitlebar`（macOS 桌面）；浏览器/终端零副作用。
- 壳侧反复钉是幂等的：已经是 zero + elasticity none 时不打日志。
- 仍可能有纯原生 clip-view 偏移、JS 看不见 `scrollY` 的残差——elasticity none 就是堵这一条；若再复现，下一步才是读 NSClipView bounds origin 并强制归零。

## 验证

- 桥：`tests/titlebar.test.ts` 覆盖新 CSS 串、root-target 判定、snap 归零（node:test）。
- 壳：`cargo check`（macos）过 `on_page_load` / `DidBecomeKey` / elasticity API。
- 实机：dev 壳启动后 page load 应再打一条 `webview scroll view pinned`（若 AppKit 确有把 auto inset 改回去）；用一会滚会话列表到头，带内开关不再上漂；点收起/展开不再是"对齐复位"的必要动作。
