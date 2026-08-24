# 标题带控件"上漂"与根滚动锁死（2026-08-24）

## 问题

桌面端（仅 macOS）用着用着，标题带里的侧栏开关（`desktop-rail-controls`）相对红绿灯"漂移上去一点点"；双击窗体放大再缩小后复位。浏览器与终端 `dsh web` 不可复现。

根因是两层叠加：

1. **原生层不动，网页层在动。** 红绿灯是原生 NSView，壳的 `inset_traffic_lights` 把它们钉死（圆心 y19、红灯左缘 x16），永不移动；带内开关是网页里的 `position:absolute` 元素，定位链 `[rail-controls](top:8) → .overlayLayer(absolute,inset:0) → .frame(relative,height:100%) → html/body(height:100%)` 一路锚在**文档流**上，不是视口。根滚动器出现任何 `scrollY > 0`，整个 frame（开关、拖拽条、badge、三列内容）就整体上移，而红绿灯不动——参照物错位即"漂移"。
2. **Overlay 标题栏给了根滚动器真实余量。** `fullSizeContentView` 下 AppKit 对 WKWebView 内部 NSScrollView 自动做 contentInsets 调整（`automaticallyAdjustsContentInsets` 默认开），标题栏那 ~28pt 变成根滚动器的可滚动范围。web 壳的 `html/body/#root` 是 `height:100%` 且**没有 overflow 约束**（web 包 base.css），内部滚动容器（会话列表等）滚到头后滚动链传导到根滚动器，文档被真实滚起几像素并停住（不是橡皮筋，不会弹回）。本仓锁定的 wry 0.55.1 源码无任何 contentInsets 处理，AppKit 默认行为原样保留。

"双击放大缩小后复位"的机理：缩放动画每帧发 `NSWindowDidResize`，视口逐帧变化时滚动偏移被钳位回 0；同时壳的 `observe_titlebar_layout` 恰好订阅同一组通知逐帧重钉红绿灯，任何 resize 循环都会把标题带几何归零一次——修复前的"意外自愈"正是这两条现成机制。

## 决策

两层同修，互为保险（对应 bridge 0.2.0-rc.3 + desktop 0.2.0-rc.23）：

- **壳侧（根治 inset 余量）**：`disable_webview_auto_content_insets`（`src-tauri/src/lib.rs`）在建窗后经 `with_webview` 拿 WKWebView 裸指针，按 NSView 子树深度优先（深度上限 6，只防病态环）遍历，把每个 NSScrollView `setAutomaticallyAdjustsContentInsets(false)` 并 `setContentInsets(NSEdgeInsetsZero)`，落位前读旧值打一条 boot 日志。这是 Electron 系壳处理 Overlay 标题栏的标准做法；保留带内空间本来就是页面自己的职责（titlebar.ts 的列 padding），原生侧不应再叠一层 inset。
- **插件侧（消灭溢出余量）**：`titlebarCss` 首条规则 `html,body{overflow:hidden;}`——该 app 是固定视口壳，文档本来就不该能滚。与壳侧修法正交：即便未来出现其它微小溢出（字体回退、渲染取整、`100vh` 抖动），根滚动器也不再有可滚范围，整类"文档滚一点"的漂移都出不来。

## 行为边界

- 布局性滚动（会话内长内容滚回看历史）不受影响：那些发生在 `.centerCol` 等内部滚动容器里，与文档根无关。
- `overflow:hidden` 挂在 `shouldFuseTitlebar`（macOS）门控下，浏览器/终端侧零副作用；其它平台保留原生标题栏，同样不需要。
- inset 钉位只在建窗时执行一次：WKWebView 的 scrollView 在 wry 建 webview 时即存在，之后不重建；`automaticallyAdjustsContentInsets` 关闭后 AppKit 不再回头改它。
- 遍历按类匹配 NSScrollView，理论上若命中非 WKWebView 内部的其它滚动视图（当前子树里没有），钉零也无害——壳窗口里没有需要 inset 的原生滚动面。

## 验证

- 单测：`tests/titlebar.test.ts` 增加 `html,body{overflow:hidden;}` 断言（55 node:test + 4 vitest 全绿）。
- 实机：dev 壳启动日志应出现 `webview scroll view insets pinned zero (previously top=… bottom=…)`；e2e 探针（gate→badge DOM→save_file IPC 往返）照常通过。
