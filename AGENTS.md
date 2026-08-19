# AGENTS.md

dsh-desktop 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（下称 DSH）的桌面化 monorepo：出树插件与 Tauri 壳同仓、独立发版。两个平面：

- **`plugin/<name>/`** —— 可独立安装、独立打 tag 的 DSH 插件包。成员：`dsh-desktop-bridge`（桌面门控：外链路由、原生注意力通知、桌面指示）、`dsh-mcp-settings`（2026-08-19 subtree 迁入）、`dsh-provider-balance`（2026-08-19 subtree 迁入，纯 DOM 注入）、`dsh-reasoning-efforts`（2026-08-20 新写，host-only：给手写 llm-pi-ai 模型补 `reasoningEfforts` 声明，契约见包内 README，决策见 `docs/notes/2026-08-20-reasoning-efforts.md`）。
- **Tauri 2 Rust 壳** —— spawn harness sidecar、端口分配、就绪检测、窗口加载。壳层不含业务逻辑；harness 不感知壳的存在。壳只特殊对待桥插件（gate + IPC）；其余插件对壳不可见。

规范层级：[README.md](README.md) 记录「为什么」（技术选型）；本文件记录「契约与约定」（怎么做）；代码是实现。冲突时以本文件为准。改契约必须同 PR 改本文件。

## Repository layout

```
plugin/<name>/               一个可独立发版的 DSH 插件包（目录名 === package.json name）
  dsh-desktop-bridge/        桌面门控桥 + 日志汇（本文件「插件契约」一节）
    src/index.ts             host half：surface 插件，空 apply
    src/log-sink.ts          日志汇 host 行：ctx.logger → 每启动一个 JSONL 文件（见「日志汇行」）
    src/invariant.ts         伙伴不变量说明
    src/client/              browser half：env 探测 + 三个桥 + shell.overlay 桌面指示
    tests/                   node:test 单测（纯函数）
src-tauri/                   Tauri 2 壳（不感知插件业务）
scripts/                     壳层与工具脚本：prepare-runtime.mjs、prepare-desktop-bundle.mjs
docs/                        packaging-playbook.md + notes/（决策记录住仓根，不跟包走）
```

`CLAUDE.md` 是指向本文件的 symlink（与 DSH 仓库同惯例）：改 AGENTS.md，不要改链接。

## 插件 monorepo 规范

本仓是「个人 DSH 扩展 + 桌面壳」的单一事实源。插件与桌面同仓，是为了一次 checkout、一次 harness rc bump 过全树，同时保留各自的发布节奏。对照：[dataelement/dsh-desktop](https://github.com/dataelement/dsh-desktop) 把 DSH 钉在 npm 上、用仓根 `patches/` 改上游压缩产物——那是壳侧补丁模型，不是插件布局，不学。

### 落点

- 每个插件一个目录：`plugin/<package.json name>/`。目录名必须等于未加 scope 的包名，因为 `dsh plugin --profile web add <path>` 按这个路径装包，entry id 也是这个名字。
- 一个目录 = 一个可 `plugin add` 的安装单元，自带 `package.json`、`dsh.bundle`/`cordis.patch.yml`、源码、测试。mcp-settings 那种「一包三行」（manager / inventory / ui）仍是**一个**目录、一份 patch，不是三个目录。
- 桥插件不能当容器：它的 apply 在非桌面环境必须零副作用；mcp-settings / provider-balance 在终端 `dsh web` 也要工作。塞进 `dsh-desktop-bridge` 会把「桌面门控」和「始终挂载」搅在一个 fiber 里。
- 不要再套 `plugin/packages/`，不要把插件放到仓根与 `src-tauri/` 平级，不要放进 fork 的 `packages/`。

### 发版

- 插件与桌面**锁步禁止**。各包 `package.json` 的 `version` 独立走动。
- **版本号策略（0.2.0-rc.1 起，学 harness 的 rc 节奏）**：桌面走 semver 预发布段——大功能进 `0.N.0-rc.x`，稳定后摘 `-rc` 出 `0.N.0`，纯修复走 `0.N.M+1`；插件各自 semver，同样允许 `-rc.N`；fork 标识走 `+zw.N` build metadata（semver §10，排序忽略不影响升级链）。**刻意不**在桌面版本里嵌 harness 基线（`0.1.0-rc.7.desktop.1` 这类嵌套段合法但小于已发的 0.1.3，首个新版即断更新链）；基线由 `runtime/revision.json` 记录。**GitHub Release 不勾 prerelease**——`releases/latest` 端点排除 prerelease，勾了 latest.json 即 404、自动更新断链；`-rc` 只体现在版本号语义。release.yml 有防呆：tag 版本 ≠ `tauri.conf.json`/`package.json` 版本即 fail。
- Git tag 无斜杠三分家：桌面 `v<semver>`（例 `v0.2.0-rc.2`，经典风格）；插件 `<包名>-v<semver>`（例 `dsh-provider-balance-v0.4.2`；包名都是 `dsh-*` 起，天然不与 `v*` 冲突，workflow 按「最后一个 `-v`」切名与版本）；**runtime fork 标签 `v<基线>+zw.<补丁>`**（例 `v0.1.0-rc.7+zw.1`——semver build metadata 标识 zw fork，行业标准做法，基线升级时 `+zw.N` 递增；历史 `desktop/v0.1.0/1` 标签仍有效可fetch，revision.json 钉 ref 字符串）。GitHub Release 按 tag 分流，互不覆盖附件。**latest 指针纪律**：桌面自动更新端点 `releases/latest/download/latest.json` 依赖 latest 指针——desktop Release `make_latest: true` 独占，插件 Release 一律 `make_latest: false`（release.yml 已内置；网页手动发插件 Release 时同样不得设为 latest）。
- 安装面保持 `dsh plugin --profile web add <repo>/plugin/<name>`（file: / git 路径均可）。本仓不把出树插件发到 npm——和 runtime「不发 npm、fork 是事实源」同一条线；要分发就打 git tag，让 `dsh plugin add` 指向该 tag。
- 壳的 release 打包（`bridge.tar.gz` → `~/.dsh-desktop/bridge/` → 幂等 `plugin add`）今天只覆盖桥。迁入其他插件后，prepare 脚本对 `plugin/*` 循环打包/add；那是打包链的后续 PR，不在搬家当天改壳。

### 迁入既有插件仓

- `git subtree`（或 `--allow-unrelated-histories`）保留历史，禁止拷贝文件了事。
- 源仓工作区必须干净：未提交的发版改动先在源仓落地（mcp-settings 0.2.3 的 credentials 竞态就是这种）。
- 迁入后源仓 archive 为只读，不再双写。
- 迁入当天**不上**仓根 `pnpm-workspace.yaml`：桥锁 pnpm 10，mcp-settings 锁 pnpm 11。各包继续自己的 `pnpm install`；workspace 收敛是独立 PR。
- 迁入当天不统一测试/构建工具链。第二步再把裸 `client.js` 分发（provider-balance）收进桥的 tsdown 纯度门。
- **harness 值依赖必须物化进包内 node_modules**：构建产物 lib 里保留的 `@deepseek-ai/*` 值 import（type-only 不算）以 devDependencies `link:../deepseek-harness/<pkg>` 声明（锚由根 `plugin:setup` 建），`pnpm install` 后可解析。不能指望 tsx 套用 checkout 的 tsconfig paths——桌面 runtime 的 tsx 4.23+ 只对 tsconfig include 内的文件生效，bare specifier 走纯 Node 上溯解析（2026-08-19 桌面崩溃循环的根因，见 `docs/notes/2026-08-19-log-sink-race-and-plugin-peer-resolution.md`）。

### 跨包纪律

- 跨插件只走 slot 与 ctx 服务，禁止 import 另一插件的实现符号；harness 包只做 type-only import（构建时擦除）。
- 决策记录一律 `docs/notes/`（仓根），不跟包走。包内 README 只写该包的安装与行为。

## 插件契约（dsh-desktop-bridge）

插件是标准 DSH 双面包：`package.json` 带 `dsh.client`（browser half 发现）与 `dsh.bundle`（`dsh plugin add` 激活层）manifest；node half `src/index.ts` 空 apply，唯一作用是让 Loader 行合法（浏览器半经 `exports["./client"]` 发现，参照 `@deepseek-ai/dsh-client-ui-directory-picker-native` 的形态）。

### 环境探测与门控

- 门控信号是 `window.__DSH_DESKTOP__`（壳在 webview 初始化脚本注入）：`{ version: 1, shell: string, platform: string }`。`version` 不认识的整数 → 按 1 处理并 `logger.warn`。
- IPC 走 `window.__TAURI_INTERNALS__.invoke(cmd, args)`（Tauri 2 恒注入）。`__DSH_DESKTOP__` 存在而 `__TAURI_INTERNALS__` 缺失 = 壳契约违约，apply 直接 throw（fail loud，client fiber 失败由 boot 审计上报，不殃及其他插件）。
- 两者皆缺（普通浏览器、终端 `dsh web`）→ apply 立即返回，零注册零副作用：插件恒可挂载、恒无害。

### webview → shell IPC 命令表

壳（Rust 侧）必须注册下列 custom command；插件是唯一调用方：

| 命令 | 入参 | 语义 |
|---|---|---|
| `dsh_desktop_open_external` | `{ url: string }` | 系统浏览器打开 http(s)/mailto 链接。invoke 被拒时插件回退 `window.open(url, '_blank', 'noopener')` 并 `logger.warn`。 |
| `dsh_desktop_notify` | `{ title: string, body: string }` | 原生系统通知（回合完成 / 等待输入）。fire-and-forget，拒绝只记日志。 |
| `dsh_desktop_save_file` | `{ name: string, base64: string }` | 下载桥：把 base64 字节写入用户下载目录（文件名去路径成分，重名自动加 `-N` 后缀），返回落盘绝对路径。M2 起存在。 |
| `dsh_desktop_check_update` | — | 查询更新端点（M3 起）：有更新返回 `{ update: { version, notes } }`，无则 `{ update: null }`；未配置/不可达时返回错误文案（软失败，更新指示器静默）。 |
| `dsh_desktop_apply_update` | — | 下载+校验签名+安装+重启（成功即进程替换，调用方不再收到返回）；失败返回错误文案。 |

加命令 = 先改本表，再改两侧。

### 日志汇行（dsh-desktop-log-sink）

桥包随 bundle 层挂载第二个行 `dsh-desktop-log-sink`（`exports["./log-sink"]`，host-only），解决 harness web 组合里 `ctx.logger` 无出口的问题：内建 sink 只有 1000 条内存环形缓冲，console exporter 未挂载，logger 流量不进 stdout，壳的 `desktop-*.log` 与终端 `web-*.log` 都抓不到它。

- apply 注册一个 `ctx.logger` Exporter：每条消息一行 JSON（`{sn, ts, name, type, text[, backfill]}`；`text` 经 `Logger.format` 展开 printf 占位与 Error 栈，对象用 `util.inspect` 防循环引用），追加写入 `logger-<yyyymmdd-HHMMSS>.log`。级别 default=DEBUG（全量）。目录解析与 `web:log`/壳完全一致（`DSH_WEB_LOG_DIR` → `$DSH_HOME/logs`），`logger-latest.log` 软链指向最新（unix-only）。
- 挂载时先从环形缓冲 backfill 启动早期消息（记录标 `backfill: true`）；进程级状态（文件路径 + sn 水位）放 `globalThis`，HMR 重挂载按水位去重、同一文件续写不新建。
- 写盘失败为尽力而为：报一次 stderr（被壳 tee 捕获）后自闭，绝不把异常抛回日志调用方。
- 该行随桥 bundle 层生效，终端 `dsh web`（同一 web profile）也会启用——刻意如此：终端同样没有 logger 出口。文件与 `web-*`/`desktop-*` 同家族，不轮转，手动清理。

### 壳实现要点（M1，`src-tauri/`）

- **sidecar 启动**：直接 `node --import tsx/esm apps/cli/src/bin.ts web --port <N>`（cwd = DSH checkout），不经 pnpm——pnpm 会插一层孙进程导致 SIGKILL 孤儿 node；直接 node 子进程可干净回收。运行时发现顺序：`DSH_CHECKOUT` env → `~/workspace/deepseek-harness`（校验 `docs/architecture.md`）。
- **DSH_HOME 所有权**：默认共享真实用户 home 下的 `.dsh`（Unix `$HOME/.dsh`，Windows `%USERPROFILE%\.dsh`）——桌面与终端是同一账号的两个面（会话历史、工作区、settings、credentials 全部同源可见）。`$DSH_HOME` env 可强制隔离。`~/.dsh-desktop/` 只放壳的编排日志（`logs/install.log`）；**sidecar 的 harness 输出走 fork 的 `web:log` 约定**：每次启动一个 `$DSH_HOME/logs/desktop-<yyyymmdd-HHMMSS>.log` + `desktop-latest.log` 软链（与终端 `web-*` 同目录、前缀区分，`DSH_WEB_LOG_DIR` 可覆盖目录；软链 unix-only，Windows 尽力而为、失败则只有 per-boot 文件）。⚠️ 并发注意：harness 对同一 DSH_HOME 没有多进程锁；单用户下基本安全（会话是 per-session JSONL，JSON storages 是整文件 last-wins 原子写），但同一会话同时被两个面驱动是未定义行为；协调式单实例是壳 M2 项。每次启动幂等执行 `node … plugin --profile web add <bridge>`（已装时 ~600ms），桥及其 bundle 层进 web profile。Windows 原生进程读 `%USERPROFILE%`，不用 Git Bash 的 `$HOME=/c/Users/...`（那不是 Win32 路径）。
- **端口**：`TcpListener::bind("127.0.0.1:0")` 取随机口，就绪探测 `GET /`（webserver 的 SPA index 路由）状态 2xx（500ms 间隔，120s 超时；tsx 冷启动慢）。
- **WKWebView 已知坑（已修）**：webserver 对 loopback 并发 **chunked** 响应（无 content-length）会被 WKWebView 随机挂死/加载失败（39 个 boot bundle 突发时必现；Chrome 无此问题）。修复在 harness `packages/client/modules/src/index.ts` 的 serveBundle 显式 `content-length`；sidecar 从源码运行改源即生效，值得上游到 fork。
- **窗口**：就绪后主线程建 `main` 窗口（1400×900）加载 `http://127.0.0.1:<port>`；初始化脚本注入冻结的 `window.__DSH_DESKTOP__`（platform = `std::env::consts::os`）。macOS 用 `TitleBarStyle::Overlay`：红绿灯悬浮进页面、不画原生标题栏。注意 Overlay 只设 `fullSizeContentView` + `titlebarAppearsTransparent`，**窗口标题文本仍会画进悬浮带**（与页面 logo 重复的「DeepSeek Harness」就是这么来的）——建窗后经 objc2-app-kit 调 `NSWindowTitleVisibility::Hidden`（`hide_painted_title`；直接依赖 `objc2-app-kit`，本就经 tao/wry 在依赖树内）不画标题但保留字符串给 Mission Control / Window 菜单；**红绿灯按 Electron `WindowButtonsProxy` 钉位**（`inset_traffic_lights`：改 close.superview.superview 即 titleBarContainer 的 frame，把它钉在窗口顶边，再在容器内放三钮——只改按钮会输给缩放动画中的系统 layout。目标：圈中线 y19 对齐带内开关 `top:8/22`，红灯左缘 x16 对齐侧栏字标线。`observe_titlebar_layout` 订 `NSWindowDidResize`（缩放动画每一帧都发；Tauri 的 `Resized` 往往只在动画结束才发，太晚）+ `DidEndLiveResize` + 进出全屏；`WillEnter/WillExitFullScreen` 先藏容器防跳，结束后 redraw 复位）；桥插件侧配合见「功能面」标题栏融合条目。其他平台保留原生标题栏。
- **IPC 能力**：capability 授 `core:default` + `core:window:allow-start-dragging` + `core:window:allow-internal-toggle-maximize`（拖拽条用，Tauri 2 `data-tauri-drag-region` 的运行时命令）+ 全部 `allow-dsh-desktop-*` 权限（`build.rs` 的 `AppManifest::commands` 自动生成，标识符把下划线转连字符），remote urls 模式 `http://127.0.0.1:*`（随机端口）。
- **命令后端**：open_external 按平台 `open` / `cmd /C start "" <url>` / `xdg-open`，先做 scheme 白名单（http/https/mailto/tel）；notify 用 `osascript display notification`（darwin）/ PowerShell WinRT toast（windows，AppId `dev.dsh.desktop`）/ `notify-send`（linux），title/body 做引号或 XML 转义。
- **sidecar 监护（已落地，含优雅退出阶梯与进程组 / Job Object）**：Unix 上 sidecar spawn 进**独立进程组**（`process_group(0)`），终止信号打 `-pgid`——一次内核调用原子覆盖 sidecar 全树（harness 自己 spawn 的 MCP server、工具子进程），无树遍历、无 TOCTOU；`setsid` 逃逸者由下次启动清扫兜底。Windows 上 sidecar 进带 `KILL_ON_JOB_CLOSE` 的 Job Object（壳崩溃即杀整树）；Assign 失败（父进程已在禁止 breakaway 的 job 里）则降级 `taskkill /T`。壳捕获 SIGINT/TERM/HUP（handler 只写原子量，poller 线程执行关闭；Windows 走 `RunEvent::Exit`），退出统一走 **组 SIGTERM→3s→组 SIGKILL 阶梯**（Windows：`taskkill` WM_CLOSE → 3s → `/F`），`RunEvent::Exit` 同路径，收尾后删除自己的注册条目。防孤儿第二道保险——**stale-sidecar 注册表** `~/.dsh-desktop/sidecars.json`：spawn 时记录 `{sidecar/shell pid + 启动时刻, port, log}`，每次启动先清扫再 spawn。清扫**只作用于注册表内 pid**（绝不按进程名扫表，终端 `dsh web` 不可能被误伤）；pid 复用由启动时刻等值比较挡住（Unix `ps lstart`，Windows `GetProcessTimes` FILETIME；复用 pid 的时刻与记录不符 → 视为死）；注册表损坏 fail-open 读空。清扫决策：shell 活 & sidecar 活 → 保留（另一在跑的壳所有）；sidecar 死 → 忘记；shell 死 & sidecar 活 → 孤儿，走阶梯回收后忘记。上游跟踪：tauri#14443（sidecar 树杀 + PID 注册表 PR）与 plugins-workspace#1332（shell 插件 process-group 选项，process-wrap）均已留评论分享实测数据。
- **dev-loop 坑的最终结论（tauri-cli 2.11.4 源码核实）**：`tauri dev` watcher 重建用 `Child::kill()` 杀壳——Unix 上即 **SIGKILL、不可捕获**，壳的退出路径不可能跑到；tauri-cli 唯一的树杀（kill-children.sh）只覆盖 beforeDevCommand 子进程，从不清理 app 自己的后代；其内置忽略表（`node_modules/ target/ gen/ Cargo.lock .DS_Store`）**不含 `icons/`**，改图标同样触发重建。⇒ watcher 重建必留孤儿 sidecar（reparent 到 launchd，持端口与 `~/.dsh`）；上述注册表使**下一次启动自动回收**（已实测：重建 → 新壳日志 `reaped stale sidecar pid=…`）。SIGKILL 场景只能事后回收，这是设计边界而非缺陷；协调式单实例（M2）在其上再做端口/会话协调。
- **e2e 探针**：`DSH_DESKTOP_E2E_PROBE=1` 时壳在页面加载后经 `window.eval`（主线程调度，wry 约束）注入探针 JS（gate→app-root→badge DOM→save_file IPC 往返），verdict 经 IPC 命令 `dsh_desktop_e2e_report`（`dsh-e2e-` hash 兜底）；壳轮询 IPC 结论并打日志。配 `DSH_DESKTOP_E2E_EXIT=1` 自动退出：0 通过 / 2 失败 / 3 超时。注意：`window.title()` 与 `document.title` 在 macOS 上不同步，标题不能做 verdict 通道。

### 功能面

M1（已实现）：

1. **外链路由** —— document 捕获阶段 click 监听：`target=_blank` 的锚点、跨源 http(s) 锚点、`mailto:`/`tel:` → `preventDefault` + `dsh_desktop_open_external`。同源无 target 的锚点、`#`、`javascript:`、`blob:`/`data:` 一律放行（SPA 内部导航）。判定是纯函数 `classifyAnchor`（`src/client/links.ts`），单测覆盖。
2. **注意力通知** —— 订阅 `ctx.sessions.list`（raf 批量快照流），做状态转移 diff（纯函数 `diffAttention`，`src/client/attention.ts`）：`running: true→false` 或 `pendingInteraction: 无→有`，且通知时刻 `document.hidden`，发 `dsh_desktop_notify`；一轮转移同时出现两种边时只发「等待输入」一条。标题用 `displayTitle`。后台会话（未选中）同样通知——这是桌面形态的核心价值。
3. **web 端指示** —— `shell.overlay`（加性 list 槽，全帧浮层）注册 `desktop-badge` 条目：右下角小 pill「web端」，点击以 `dsh_desktop_open_external` 打开当前 origin（复制会话到系统浏览器）。样式只用 `--dsw-*` 语义 token，绝不写字面色。
4. **更新指示器（0.1.3 起，替代已移除的 About 设置页）** —— `shell.overlay` 注册 `desktop-update-indicator` 条目（order 6）：**后台定时检查** GitHub 最新版（挂载 3s 首查走共享单飞记忆化，之后每 2h 强制刷新绕过记忆化；离线/无端点静默），发现新版在**窗口右上角**（`top:8px; right:14px`，与带内控件同层 z-index 1）亮出下载小图标（ui-primitives `IconDownloadOutline16`，tooltip「更新到 vX.Y.Z」），一键下载+校验+安装+自动重启（applying 态半透明禁点）。借鉴 Zed/GitHub Desktop 的共识模式：静默周期轮询 + 有更新才出现的 affordance——Zed 社区对「过于激进」的教训（每次启动打扰）取 2h 周期、不打扰。组件自带定时器（useEffect interval，unmount 即清）；`force` 参数贯穿 inject face 到共享单飞。

M2（下载桥与 i18n 已实现；其余规划，先改本表再动手）：

- ~~下载桥~~（已实现）：捕获 `a[download]` 点击（同源 http(s) 与 `blob:`，纯函数 `classifyDownload` 判定）→ fetch blob → base64 → `dsh_desktop_save_file`；invoke 失败回退 `location.href` 导航下载。
- ~~badge 文案接 `ctx.locale` 双语~~（已实现，namespace `desktop-bridge`）。
- ~~标题栏融合（macOS）~~（已实现）：壳建窗用 `TitleBarStyle::Overlay` + `NSWindowTitleVisibility::Hidden`（不画标题文本，见「壳实现要点·窗口」）；桥插件在 `platform === 'macos'` 时（纯函数 `shouldFuseTitlebar`，`src/client/titlebar.ts`）注入一条 CSS——`div:has(> [data-shell-overlay])>div:nth-child(-n+3)` 各加 28px `padding-top`（选择器锚点是 ui-layout AppFrame 的三列：sidebar/center/details；给列而非 frame 加 padding，让列的表面（侧栏填充）**铺到红绿灯底下**、只有内容避开悬浮带，而不是整帧下移留出空白条）——并注册第二个 `shell.overlay` 条目 `desktop-drag-strip`（`data-tauri-drag-region` 透明拖拽条，单击拖动、双击切换最大化，走 capability 的两个 window 权限，不加自定义 IPC）。视觉结果：侧栏 surface 从窗口顶边铺开，红绿灯直接压在侧栏色块上，侧栏内容（logo 行）从带下方开始，与原生 mac 应用的融合标题栏一致。已知边界：拖拽带盖住侧栏 resize handle 顶部 28px（z-index 20 > handle 2）；Overlay 窗口未聚焦时不可拖（Tauri #4316）；`nth-child` 锚点假设 AppFrame 的三列仍是 frame 的前三个子元素（ui-layout 结构变更需同步此选择器）。
- ~~收起侧栏整列隐藏 + 标题带控制钮（macOS）~~（已实现）：Overlay 标题栏下，ui-layout 的「收起」仍是 56px 控制轨（`SIDEBAR_COLLAPSED`，rail 里有 logo/新建会话/设置图标）——这条 rail 垫在红绿灯正下方成为无交互死条。桥插件在 `platform === 'macos'` 时（与标题栏融合同一门控）把收起列压到 0 宽，并隐藏侧栏 logo 行里的原生 toggle（**BrandWordmark 保留显示**，锚点 `div[data-slot='sidebar']>div>div:first-child>button:last-child`——`data-slot` 是 slot 系统文档化的稳定锚点，Tooltip 无包裹 DOM，logoRow 的最后一个按钮即原生 toggle）：桌面全窗口**只保留一个侧栏开关**——红绿灯右侧、28px 标题带内的常驻双向 toggle，收起时其旁滑入仅收起态可见的新会话气泡（`src/client/rail.ts` + `rail-controls.tsx`）。机制：列宽在 frame 的 inline `grid-template-columns`（`<sidebar>px minmax(0,1fr) <details>px`），纯 CSS `!important` 覆盖整条模板会丢 details 动态宽度，故用 MutationObserver 在 `data-sidebar-collapsed` 期间把第一轨改写为 `0px`（纯函数 `collapseRailTemplate`，只认「`<num>px` 开头且后随轨道」的模板形状，失配原样放行、功能退化为原生 rail；React 重渲染重写 style 后 observer 同 microtask 再纠正，无闪烁；frame 自带 grid 轨道 transition，收起 56→0 / 展开 0→280 均为平滑动画；React 不回读 DOM style 做 diff，外部改写稳定）；按钮是第三个 `shell.overlay` 条目 `desktop-rail-controls`（order 5，`top:8px;left:86px;height:22px;gap:8px` 红绿灯右侧、与下移后的灯排同线（中线均为 y≈19；与绿灯圈右缘留约 12px），z-index 1 压过拖拽条——占约 26px 带内区域不再可拖窗，与原生工具栏按钮同理）：toggle **常驻**、双向（收起/展开同钮同图标，无入场动画）；新会话气泡**仅收起态**，用 `opacity/transform/visibility` 过渡（`display` 无法动画）在其旁从 `translateX(12px)` 滑入（delay .18s 接在侧栏滑动后），展开时反向淡出，`prefers-reduced-motion` 去过渡——组件零状态、零订阅机械；容器恒 `pointer-events:none`，toggle 恒可点、气泡仅可见时可点：toggle 调 `ctx.layout.toggleSidebar()`——**点击时惰性 `ctx.get('layout')`**，绝不在注册时读取：slots.inject 在 ui-layout 声明落地（其 fiber 启动途中、尚未 ACTIVE）即触发，而 strict `ctx.get` 只服务 ACTIVE 提供方，注册时读取会拿到 undefined 导致按钮永不出现（2026-08-19 实踩，缺席仅 warn 并忽略点击）；新会话调 `ctx.workspaces.startSession()`（无参 = 侧栏按钮同款语义；inject 加 `workspaces`）；图标用 ui-primitives 的 `IconPanelLeftOutline16` / `IconNewChatOutline16`（与 rail 原图标一致），样式全在 `railCss()`、只用 `--dsw-*` token。已知边界：DOM 锚点依赖 ui-layout 的 `data-sidebar-collapsed` 属性与 inline 三轨模板（ui-layout 结构变更需同步 rail.ts，与 `nth-child` 锚点同性质）；收起态下 rail 的 workspace 浏览/设置入口不可达（新会话由带内按钮补齐，其余需展开后用）。
- 通知点击回跳：壳发 `dsh-desktop://focus-session` 事件，插件聚焦并 `sessions.open(id)`。**受阻**：macOS 通知点击回调需 UNUserNotificationCenter delegate（objc2 绑定），`osascript` 无回调通道——留待 M3 平台化一并做。同理**通知横幅图标也受阻**：osascript 通知恒归属 Script Editor，要图标必须有真实 .app bundle 身份——osacompile applet 捷径已证伪（run 事件投递不可靠、`open` 对未识别 bundle 会 fallback 到 Terminal 开窗，详见 `docs/notes/2026-08-19-notify-applet-incident.md`），勿再尝试；正路同归 M3 的 UNUserNotificationCenter。
- 托盘 / 未读角标（壳读 DOM title 或插件显式上报）。

### 组合与 slot 纪律（沿用 DSH client 约定的最小子集）

- UI 只经 `ctx.slots.register(...)` 组合；本插件只注册**已声明的加性槽**——`shell.overlay`（badge/拖拽条/带内开关/更新指示器）——声明洞一律禁止。
- 跨包只走 slot 与 ctx 服务，禁止 import 其他插件的实现符号；harness 包只做 type-only import（构建时擦除）。
- 注册即 effect：所有监听、订阅、slot 注册经 `ctx.effect()` / register 返回的 disposer，卸载/HMR 全量回收。
- 文案中文（M2 起接 `ctx.locale` 双语）；代码注释英文。
- 无硬编码 tunable：可调项（如通知开关）是 `Config` 字段，从 cordis.yml `config` 进来，非法值 fail loud。

## 壳（Tauri 2）契约要点

壳对插件只有两个义务：初始化脚本注入 `window.__DSH_DESKTOP__`（见上），注册 IPC 命令表（见上）。其余职责不变：spawn harness sidecar（`dsh web`，随机回环端口）、`GET /` 就绪检测（host.describe 是 RPC 方法名，不是 HTTP 路由）、窗口加载 `http://127.0.0.1:<port>`。生产形态把本插件经 `dsh plugin --profile web add` 装进随包 profile（自带 `dsh.bundle` 层，无需 `--patch`）。

## Commands

前置：Node 22+、pnpm；类型检查与构建另需 DSH 源码 checkout（默认 `~/workspace/deepseek-harness`，可用 `DSH_CHECKOUT` 覆盖，验证标准 `$DSH/docs/architecture.md` 存在）。

```sh
pnpm run plugin:setup     # 根级：建 plugin/deepseek-harness 锚（mcp-settings tsconfig 用）+ 桥自己的 dsh 锚
pnpm run plugins:check    # 全树：plugin/* 每包跑自己的 typecheck/test/build（--if-present，跳过 symlink 锚）

cd plugin/dsh-desktop-bridge
pnpm install          # 安装 devDeps（tsdown/typescript/tsx/react 类型）
pnpm run typecheck    # tsc --noEmit（harness 包 import 经 dsh 链接解析到源码）
pnpm run build        # tsdown：lib/index.js + lib/invariant.js + lib/client.js
pnpm run test         # node --import tsx --test（纯函数单测）
pnpm run watch        # tsdown --watch（配合 dsh web 的 client-hmr 热替换）
```

mcp-settings 在包内自带 pnpm 11（packageManager）与 vitest 工具链，`cd plugin/dsh-mcp-settings && pnpm install && pnpm test` 独立可用；provider-balance 无构建步骤（裸源码分发，收敛进 tsdown 纯度门是后续项）。

### 实机挂载验证（scratch home，勿污染真实 `~/.dsh`）

```sh
export DSH_HOME=$(mktemp -d)
cd $DSH_CHECKOUT
pnpm dsh plugin --profile web add <repo>/plugin/dsh-desktop-bridge
pnpm dsh web --port 3987 &
curl -s localhost:3987/ | grep -o 'dsh-desktop-bridge[^\"]*'   # boot graph 应含本插件行
curl -sI localhost:3987/plugins/dsh-desktop-bridge/client.js   # 应 200
```

### 壳的运行与端到端验证（M1 起）

```sh
# 前置：Rust toolchain（rustup）、Node 22+ 与 DSH checkout（发现顺序见「壳实现要点」）
pnpm desktop:dev                # dev 壳：spawn sidecar → 就绪 → 开窗
# e2e（探针走 gate→badge DOM→save_file IPC 往返，结论打在 stdout；EXIT 变体自动退出）
DSH_DESKTOP_E2E_PROBE=1 pnpm desktop:dev
DSH_DESKTOP_E2E_PROBE=1 DSH_DESKTOP_E2E_EXIT=1 pnpm desktop:dev; echo "exit=$?"
```

壳的 sidecar 默认跑在真实 `~/.dsh`（与终端同源）；harness 输出落 `~/.dsh/logs/desktop-<时间戳>.log`（`desktop-latest.log` 软链指最新，`DSH_WEB_LOG_DIR` 可覆盖），`~/.dsh-desktop/logs/` 只落 `install.log`。浏览器内验证桌面行为以 `window.__DSH_DESKTOP__` 手工注入为辅助手段。

## Conventions

- ESM（`"type": "module"`）；插件包名无 scope，目录名 === `package.json` `name`，随仓分发（见「插件 monorepo 规范」）。
- client bundle 构建契约（banner/footer/externals）从 DSH `packages/client/tsdown.client.ts` 蒸馏：产物是 `window.__ModuleLoader__.load({id, factory})` 闭包；externals = 平台模块表（react/cordis/ui-slots/web-react/ui-primitives/ui-attachment/schema-form + runtime 豁免）；非平台 `@deepseek-ai/*` 值 import 一律构建报错（纯度门）。
- 纯函数与副作用安装分离：判定/diff 逻辑无 DOM 依赖可单测；安装函数薄壳包 effect。
- 空不发声、缺即报错：可选服务 `ctx.get()` 处理 undefined；配置缺引用在能定位的最早点 throw。
- 组件不做订阅机械（useSyncExternalStore 等）；快照流消费在 apply 世界订阅、经闭包注入。
- 文件恰好一个行尾换行；`git diff --check` 干净。
- 非平凡变更加 Agent Note（`docs/notes/`，日期命名）记录决策与理由。

## Milestones

仓库整体（README 详述）：M1 Tauri 原型（脚手架 + sidecar + 端口 + 就绪 + 窗口）→ M2 对齐 dataelement 行为 → M3 平台化（签名/更新/安装包）→ M4 系统 WebView 回归。

### 运行时分发决策（已定，M3 实现）

不发 npm 包。fork 的 GitHub 仓库（`aka-danielZhang/deepseek-harness` master）是 dsh 运行时的唯一事实源，永远带着我们的补丁。发包以 **`v<基线>+zw.<补丁>` 标签**为锚（semver build metadata 标识 zw fork；历史 `desktop/vX.Y.Z` 标签等价有效）：`runtime/revision.json` 钉 `{repo, ref: v<基线>+zw.<n>, sha}`，fork 侧 `git tag v<基线>+zw.<n> <sha> && git push origin <tag>` 后更新本文件。当前：`v0.1.0-rc.7+zw.1`（harness 基线 0.1.0-rc.7，zw 补丁层 1）。

组装（`node scripts/prepare-runtime.mjs`，SHA 键控缓存，同 SHA 秒级）：持久部分克隆 fetch 标签 → `pnpm install --frozen-lockfile` + `pnpm run build`（`.prepare-runtime-ok` 标记缓存）→ **publish 路径打本地 tarball**（`pnpm pack` 全部 234 个 `@deepseek-ai/*` 包，workspace: 协议按发布规则重写；平台特定原生包 landlock-linux 跳过回退 npm；`FORK_MODIFIED` 名单内的包打包失败即中止）→ 生成的 runtime manifest 以 `pnpm.overrides` 把全树钉到本地 tarball（**必须 `--no-frozen-lockfile`，frozen 模式会静默忽略 overrides**；`pnpm deploy --legacy` 对本 workspace 丢 vendored 传递依赖，不可用）→ `runtime/build/<sha>/{dsh,tools}`（dsh = CLI 树，tools = node 24.9.0 + pnpm 二进制）。

壳的 sidecar 解析顺序：`$DSH_DESKTOP_RUNTIME` → **包内资源解压树**（release：`~/.dsh-desktop/runtime/<sha>/{dsh,tools}`，首启从 Resources 里的 runtime.tar.gz 原子解压，`.ok` 标记完整；桥插件同法解压到 `~/.dsh-desktop/bridge/`，并补 `node_modules/@deepseek-ai/cordis` → runtime 树的符号链接——桥 host 半对 cordis 是值引用（`Logger.format`），dev 布局靠 devDep 链接解析、解压包没有；同一 real path 保证单一模块实例（**刻意不往包里打第二份 cordis**：副本 = 双模块实例），install 后建避免 pnpm 碰到，链接指向非当前 revision 的 cordis（升级残留）即自愈重指）→ `runtime/build/<sha>`（dev）→ 本地 fork 源码（dev 兜底，tsx）。e2e 已对 bundled runtime 与资源解压分支（强制 miss dev 路径）验证 `DSH_E2E_OK`。

### 打包（M3 已落地，手册：`docs/packaging-playbook.md`）

`pnpm desktop:build` 一键出平台安装包：macOS `.app` + `.dmg`（aarch64；**签名+公证版 ~160MB**，ad-hoc 降级 ~113MB）；Windows NSIS `*-setup.exe`（x86_64，currentUser，不需管理员）。**runtime 必须在目标 OS 上组装**（native 模块与 node 二进制布局），缓存键含 `platform-arch`。资源走 **tarball** 而非散目录：runtime 树是 pnpm 安装（Unix 3k+ 符号链接；Windows 用 `node-linker=hoisted` 实目录——bsdtar 会把 junction 展开成拷贝，isolated 布局下 `tsx` 会丢 `esbuild`），tauri-bundler 对目录资源不承诺保链接（解引用拷贝会让 .pnpm store 膨胀 GB 级）；tar 往返在 Unix 上链接感知，且解压到 home 规避 App Translocation 只读卷。Windows 解压：GNU tar 需要 `--force-local`（否则 `C:` 被当成远程主机）；Win11 自带 bsdtar 3.8.4 不认该选项且绝对路径可直接解——prepare 与壳按 `tar --help` 探测后按需加 flag。`beforeBuildCommand` 先跑 `scripts/prepare-desktop-bundle.mjs`（桥构建 → runtime 组装（SHA 键控缓存 + `SCRIPT_REV` 组装版本盐）→ 打 `src-tauri/resources/{runtime.tar.gz, runtime-revision.json, bridge.tar.gz}`，gitignored、按需再生；revision 副本含两个 tarball 的 **sha256**，壳的 `.ok` 缓存标记内容寻址——同 revision 内容变更自动重解压替换）。**bundled runtime 与源码 runtime 行为对齐**：tsx 是 runtime 一等依赖，`bundled_runtime` 同样 `--import tsx/esm`——profile 可挂 `file:` 源码分发插件（.ts 入口），纯 Node 拒绝剥 node_modules 下的类型（0.1.0 实踩：真实 home 全树崩溃，scratch home 测不出，**e2e 矩阵必须含真实 home 场景**）。**裸 `cargo build/check` 会因 build.rs 校验资源缺失而失败**，必须先 prepare。分发：**macOS 签名+公证已落地**——`.app`/`.dmg` 均 `spctl` 应答 `source=Notarized Developer ID`（**公证扫描会钻进 tar.gz**，runtime 树 16 个 Mach-O 打 tar 前逐个 Developer ID 签名，`DSH_CODESIGN_IDENTITY` 门控 + allow-jit entitlements；hardened runtime 已开；DMG 需 `notarytool submit` 单独公证；ASC 个人 API 密钥不能用于 notarytool，用 App 专用密码）。凭据与完整流程见 playbook §5。Windows NSIS 的 Authenticode 按 playbook §9：GitHub Secrets `WINDOWS_CERTIFICATE` + `WINDOWS_CERTIFICATE_PASSWORD`（pfx base64）有则签、空则跳过（SmartScreen 可能警告）；`tauri.conf.json` 不写死 thumbprint。**自动更新（0.1.2 起）**：`tauri-plugin-updater` + `createUpdaterArtifacts`，端点 `releases/latest/download/latest.json`，更新包 macOS `dsh-desktop.app.tar.gz` / Windows `*-setup.exe`，经 tauri 签名私钥（`tauri-keys/`，gitignored）签名、公钥在 `tauri.conf.json` plugins.updater；`latest.json` 的 `platforms` 含 `darwin-aarch64` 与 `windows-x86_64`，由 macos+windows 两 job 出 fragment、publish job 合并。发布流水线 `.github/workflows/release.yml`（tag 触发），发布手册 `docs/release-runbook.md`。

插件（本文件「功能面」的 M1/M2）；壳的 Rust 侧实现需本机 Rust toolchain（stable，已就绪）。
