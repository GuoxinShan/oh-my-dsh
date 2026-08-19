# 收起侧栏整列隐藏 + 标题带控制钮（2026-08-19）

## 问题

macOS Overlay 标题栏下收起侧栏，ui-layout 的「关闭」并非真隐藏：`computeColumns` 把关闭的侧栏解析成固定 56px 控制轨（`SIDEBAR_COLLAPSED`），rail（logo/新建会话/workspace/设置图标列）垫在悬浮红绿灯正下方，成为一条无交互死条，视觉上与原生关闭按钮冲突。期望形态：收起时整列 0 宽，只在标题带内红绿灯右侧留「展开侧栏」与「新会话」两个按钮，且与红绿灯同一水平线、仅收起态可见。

## 否决的备选

- **纯 CSS `!important` 覆盖 `grid-template-columns`**：列宽是 React 写的 inline 三轨模板 `<sidebar>px minmax(0,1fr) <details>px`，覆盖整条必须给第三轨一个值，而 details 宽度是用户可拖的动态 px，CSS 无法引用 inline 值；写 `auto` 会让 details 列塌到内容宽。否决。
- **`display:none` 藏 sidebarCol**：grid item 不参与布局但轨道尺寸不变，左侧留 56px 空白带——比 rail 更糟。否决。
- **改 fork 的 ui-layout（`SIDEBAR_COLLAPSED = 0`）**：终端 `dsh web` 同源同码，原生 rail 在浏览器里是正常形态，改 fork 会污染终端体验；且 rail 的展开按钮随之消失，浏览器无法恢复。否决——桌面形态差异属于桥插件职责。

## 决策

全部落在桥插件 client half，复用 `shouldFuseTitlebar` 的 macOS 门控（Windows/Linux 有原生标题栏、无遮挡问题；终端 web 因 gate 缺失零副作用）：

1. **0 宽 reconcile（`src/client/rail.ts`）**：MutationObserver 观察 AppFrame 元素（锚点 `div:has(> [data-shell-overlay])`，与 titlebarCss 同源）的 `data-sidebar-collapsed` + `style`。collapsed 期间把 inline 模板第一轨改写为 `0px`（纯函数 `collapseRailTemplate`，只认「`<num>px` 开头且后随轨道」形状，失配原样放行 = 退化为原生 rail）。成立依据：React 以内存 props diff、不回读 DOM style，外部改写在下次真实重渲染前稳定；重渲染重写 style 后 observer 在同一 microtask 再纠正，先于 paint 无闪烁；frame 自带 `grid-template-columns` transition，56→0 / 0→280 双向平滑。`railCss()` 顺带去掉 0 宽列的 `border-right`（否则 x=0 留 1px 竖线）。
2. **带内双按钮（`rail-controls.tsx`）**：第三个 `shell.overlay` 条目 `desktop-rail-controls`，定位 `top:0;left:80px;height:28px`（红绿灯组右缘 ≈68px，留 12px 间隙），flex 行内两钮（26px、radius 6、hover `--dsw-alias-interactive-bg-hover`、图标 `--dsw-alias-label-primary`）。显隐零状态：CSS `div[data-sidebar-collapsed] [data-desktop-rail-controls]{display:flex}`（overlay 层是 frame 后代，属性选择器天然成立）。展开 = `ctx.layout.toggleSidebar()`（`ctx.get('layout')` 可选服务；ui-layout 在同一 apply 里先 provide 再声明子槽，slots.inject 回调触发时必已可用，缺席仅 warn 不注册），新会话 = `ctx.workspaces.startSession()`（无参即侧栏按钮同款语义：当前会话 workspace → 最近 workspace → New Session 视图；inject 加 `workspaces`）。图标复用 rail 同款 `IconPanelLeftOutline16` / `IconNewChatOutline16`，桥首次值 import ui-primitives（平台模块表内，纯度门通过），package.json 补 peer + link devDep。
3. **层级与拖拽**：按钮容器 `z-index:1` 压过 `desktop-drag-strip`，占用的一小块带内区域不再可拖窗——与原生 mac 工具栏按钮区域行为一致。

## 边界

- DOM 锚点依赖 ui-layout 的 `data-sidebar-collapsed` 属性与 inline 三轨模板形状；ui-layout 结构变更需同步 rail.ts（与既有 `nth-child(-n+3)` 锚点同性质，fork 自控）。
- 收起态下 rail 的 workspace 浏览与设置入口不可达（新会话已由带内按钮补齐；设置需展开侧栏后用）——「只留展开按钮」的既有代价，用户确认接受。
- details 拖拽把手定位 `left: viewport - cols.details` 与首轨宽度无关，0 宽后仍正确。

## 修正（同日实机首跑：按钮不出现）

首版在 slots.inject 回调里 `ctx.get('layout')` 读服务、读不到就跳过注册——实机按钮整排缺失。根因（cordis `reflect.ts` 实证）：`ctx.get(name)` 默认 strict，**只返回提供方 fiber 处于 ACTIVE 的实现**；而 slots.inject 在 ui-layout 声明落地那一刻触发，彼时 ui-layout 的 fiber 仍在启动途中（`provide` 的 notify 也仅当自身 ACTIVE 才发），strict get 必然 undefined。修复：`ctx.layout` 改为**点击时惰性解析**（`railInjected.toggleSidebar` 内 `ctx.get('layout')`，缺席仅 warn 并忽略），注册永远发生、与服务可用时序彻底解耦。教训：跨插件服务在「声明即触发」的回调里一律惰性读取，时序假设不可依赖。

## 设计修订（同日二跑：标题带内太丑）

首版把两钮塞进 28px 标题带、与红绿灯平齐（`top:0;left:80px`），实机观感拥挤丑陋。修订为**标题带下方、窗口左上角的浮动两钮**（`top:34px;left:12px`），并按用户描述的动效实现：收起时展开钮先向左平移滑入最左位（`translateX(24px)→0`，delay .14s），新会话气泡紧随其后（delay .24s）；展开时反向淡出。显隐从 `display:none↔flex` 改为 `opacity/transform/visibility` 过渡——display 无法动画，这是交错入场的前提；容器恒 `pointer-events:none`，按钮仅可见时可点，展开态完全不挡侧栏自身控件。`prefers-reduced-motion` 下去掉过渡与原生 frame 行为一致。图标从 16 调到 rail 规范的 18。

## 设计修订 v3（同日三跑：回到带内，但做单常驻 toggle）

二跑的「带下浮动两钮 + 双钮交错入场」实机仍不理想。用户参照形态（Cherry Studio 式）定稿：**隐藏侧栏 logo 行**（BrandWordmark + 原生 toggle），全窗口只保留**一个**侧栏开关——红绿灯右侧带内的**常驻双向 toggle**（收起/展开同钮，无入场动画，无所谓"平移到最左"的诉求随之消解）；新会话气泡**仅收起态**在其旁滑入（delay .18s）。侧栏自身的收起/展开动画全程未动——rail hider 只是把末态从 56px 续到 0，grid 轨道 transition 原样保留，"原来的动画不能改"的疑虑澄清：不是不能改，而是无需改。logo 行锚点弃用结构猜测，改用 slot 系统文档化的稳定锚 `div[data-slot='sidebar']>div>div:first-child`（`display:contents` 布局中性的 addressable seam，web-react SlotOutlet 契约）。toggle 文案从「展开侧边栏」改中性的「切换侧边栏」（双向语义）。

## 微调 v3.1（同日四跑：贴顶 + logo 回归）

实机反馈：带内 26px 钮（后缩 22px）仍嫌贴上边框，且 logo 不该隐。两处微调：① 控制组从带内居中（`top:0;height:28px`）改为与红绿灯同顶部内缩（`top:8px;height:22px`，按钮上缘对齐红绿灯上缘 ≈8px，彻底脱离"贴顶"观感）；② logo 行隐藏收窄为**只隐原生 toggle**（`…>div:first-child>button:last-child`，Tooltip 经 cloneElement 无包裹 DOM，logoRow 末位按钮即 toggle），BrandWordmark 恢复显示——参照 Codex 桌面形态：红绿灯 + 开关同一行，侧栏首行是品牌字标。

## 微调 v3.2（同日五跑：红绿灯自己下移，插件够不着的部分归壳）

v3.1 后实机仍不协调：开关在 y≈8..30（中心 19），而红绿灯保持 AppKit 默认位（y≈8..20，中心 14）——**贴顶的其实是原生灯排**，webview 内的插件无解，归壳。壳建窗时 `inset_traffic_lights`：`standardWindowButton` 三钮 frame origin 下移 5pt（底原点坐标系，y 减即视觉下移），灯排中心 14→19 与开关同线。刻意一次性应用不做 resize 重施（重复施放会累积偏移）；进出全屏 AppKit 复位为默认位是接受边界。Cargo 侧 objc2-app-kit 特性链 NSButton→NSControl→NSView 需显式全开（互不蕴含），NSPoint 由 objc2-foundation/NSGeometry 提供。

## 微调 v3.3（同日六跑：三线归一）

实机截图复核（本轮用直接运行的 `target/debug/dsh-desktop` 实例自验，不经 `tauri dev` 避免 SIGKILL 孤儿路径）：灯排与开关数值上已同线但观感不齐，且灯排左缘（x12）与侧栏内容线（16px 内缩，字标/新会话/工作区行共用）错开。最终对齐关系：① 红绿灯右移 4pt（红灯左缘 x12→x16，落在侧栏内容线上）；② 开关钮 top 8→10px（与 5pt 下移后的灯排光学居中）；③ 开关与「+」气泡间距 4→8px。至此左上角三条参考线收敛：灯排左缘 = 侧栏内容线，灯排中线 = 开关中线，开关/气泡一组自成节奏。七跑微调：控制组 left 80→84px——绿灯圆形边缘内收，灯排↔开关 14px 的视觉读数才与开关↔气泡 8px 直边间距一致。

## 微调 v3.4（同日八跑：实测 frame 定终值，灯排与开关同线 y19）

实机仍报「灯排位置不对」——此前所有 y 值都是「标准 macOS 惯例」的估值。本轮给壳加临时 frame 日志（apply 前后 + 3s 后重读），拿到真实数据：**默认钮框 14×14 @ x9/32/55、y9（28pt 底原点容器）**，即灯圈中线 y≈12 而非估的 14；5pt 下移后是 17，而开关 top:10 时中线 21——差 4px，灯排看着「没动」的原因。且日志证实 setFrameOrigin **首屏布局后不被复位**（3s 后重读同值），机制本身无恙。终值：灯排下移 **7pt**（y9→y2，圈中线 19）+ 开关 `top:10→8`（盒中线 21→19），两排同线 y19；红灯圈左缘 ≈x14 贴侧栏 16px 内容线；水平间距保持 left:84/gap:8。诊断代码已全部移除。插曲：诊断期间 `tauri dev` watcher 撞上未完成的编辑（`Manager` trait 未导入、闭包双重 move）编译失败——watcher 保存即重建，自愈无残留。

## 微调 v3.5（同日九跑：容器实测 32pt，一切垂直误差的根因）

打包版仍报不齐。补打 superview frame 拿到决定性数据：**标题栏容器高 32pt，不是标题栏常识的 28pt**——v3.4 的换算全建立在 28 上，又错一轮。真实默认几何：钮框 14×14 @ x9/32/55、y9（32pt 底原点容器）→ 灯圈中线 y≈16（不是 12）；7pt 下移后是 23，比开关（top:8 中线 19）还低 4px，与打包版截图一致。侧栏内容线实测口径：字标字形 x16（root 12 + logoRow 4），新会话条 x14（+2 margin）。终值（全部实测换算）：灯排**下移 3pt**（y9→y6，圈中线 19）+ **右移 6pt**（x9→x15，圈左缘 16 = 字标线）；开关保持 `top:8`、`left:84→86`（灯排右移 2px 后守住 12px 间距）。诊断代码已移除。教训收进契约：凡动原生窗控，先打 frame，别信常识。

## 验证

- `tests/rail.test.ts`：`collapseRailTemplate` 五态（details 开/关、已 0、非契约模板放行）+ `railCss` 规则存在性与 token 纪律；42/42 绿。
- typecheck / build 绿；实机 `pnpm desktop:dev` 目视：收起 → rail 消失、红绿灯下为 center surface、两钮出现在红绿灯右侧；展开/收起动画平滑；details 列开合回归。
