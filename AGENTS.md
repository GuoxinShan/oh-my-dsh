# AGENTS.md

dsh-desktop 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（下称 DSH）的桌面化项目，由两个平面组成：

- **`plugin/dsh-desktop-bridge`** —— DSH 双面客户端插件（npm 包，TypeScript）。把 DSH Web UI 桥接到桌面 webview 环境：外链路由、原生注意力通知、桌面指示。这是本仓库当前的产品主体。
- **Tauri 2 Rust 壳**（规划中，见 Milestones）—— spawn harness sidecar、端口分配、就绪检测、窗口加载。壳层不含业务逻辑；harness 不感知壳的存在。

规范层级：[README.md](README.md) 记录「为什么」（技术选型）；本文件记录「契约与约定」（怎么做）；代码是实现。冲突时以本文件为准。改契约必须同 PR 改本文件。

## Repository layout

```
plugin/dsh-desktop-bridge/   DSH 客户端插件包（本文件「插件契约」一节的实现）
  src/index.ts                 host half：surface 插件，空 apply
  src/invariant.ts             伙伴不变量说明
  src/client/                  browser half：env 探测 + 三个桥 + shell.overlay 桌面指示
  tests/                       node:test 单测（纯函数）
scripts/                     壳层与工具脚本（未来）
docs/                        补充规范（未来；能进本文件的不单开文件）
```

`CLAUDE.md` 是指向本文件的 symlink（与 DSH 仓库同惯例）：改 AGENTS.md，不要改链接。

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

加命令 = 先改本表，再改两侧。

### 兼容行（桥 bundle 层）

桥插件的 `cordis.patch.yml` 还携带一个兼容行集：`dsh-mcp-settings-manager/-inventory/-ui` 置 `disabled: true`。原因：dsh-mcp-settings 按 rc.5 的 mcp-client API 构建，在 rc.7（`RECONNECT_DEFAULTS` 收为内部导出）下 import 即炸，拖垮整个插件树——这是**既存问题**（终端 3080 是 Aug 14 启动的长效进程所以没暴露，任何冷启动都会复现）。禁用整个行集让冷启动可 boot；dsh-mcp-settings 按 rc.7 重建（或 profile 把 mcp-client pin 回 rc.5）后删除本行集。

### 壳实现要点（M1，`src-tauri/`）

- **sidecar 启动**：直接 `node --import tsx/esm apps/cli/src/bin.ts web --port <N>`（cwd = DSH checkout），不经 pnpm——pnpm 会插一层孙进程导致 SIGKILL 孤儿 node；直接 node 子进程可干净回收。运行时发现顺序：`DSH_CHECKOUT` env → `~/workspace/coding-study/deepseek-harness`（校验 `docs/architecture.md`）。
- **DSH_HOME 所有权**：默认共享真实 `~/.dsh`——桌面与终端是同一账号的两个面（会话历史、工作区、settings、credentials 全部同源可见）。`$DSH_HOME` env 可强制隔离。`~/.dsh-desktop/` 只放壳的日志。⚠️ 并发注意：harness 对同一 DSH_HOME 没有多进程锁；单用户下基本安全（会话是 per-session JSONL，JSON storages 是整文件 last-wins 原子写），但同一会话同时被两个面驱动是未定义行为；协调式单实例是壳 M2 项。每次启动幂等执行 `node … plugin --profile web add <bridge>`（已装时 ~600ms），桥及其 bundle 层进 web profile。
- **端口**：`TcpListener::bind("127.0.0.1:0")` 取随机口，就绪探测 `GET /`（webserver 的 SPA index 路由）状态 2xx（500ms 间隔，120s 超时；tsx 冷启动慢）。
- **WKWebView 已知坑（已修）**：webserver 对 loopback 并发 **chunked** 响应（无 content-length）会被 WKWebView 随机挂死/加载失败（39 个 boot bundle 突发时必现；Chrome 无此问题）。修复在 harness `packages/client/modules/src/index.ts` 的 serveBundle 显式 `content-length`；sidecar 从源码运行改源即生效，值得上游到 fork。
- **窗口**：就绪后主线程建 `main` 窗口（1400×900）加载 `http://127.0.0.1:<port>`；初始化脚本注入冻结的 `window.__DSH_DESKTOP__`（platform = `std::env::consts::os`）。
- **IPC 能力**：capability 授 `core:default` + 四个 `allow-dsh-desktop-*` 权限（`build.rs` 的 `AppManifest::commands` 自动生成，标识符把下划线转连字符），remote urls 模式 `http://127.0.0.1:*`（随机端口）。
- **命令后端（M1 范围）**：open_external 按平台 `open`/`xdg-open`/`start`，先做 scheme 白名单（http/https/mailto/tel）；notify 用 `osascript display notification`（darwin）/ `notify-send`（linux），title/body 做引号转义；Windows 通知 M3 补。退出时 SIGKILL 子进程（优雅 SIGTERM→SIGKILL 阶梯是壳 M2 范围）。
- **e2e 探针**：`DSH_DESKTOP_E2E_PROBE=1` 时壳在页面加载后经 `window.eval`（主线程调度，wry 约束）注入探针 JS（gate→app-root→badge DOM→save_file IPC 往返），verdict 经 IPC 命令 `dsh_desktop_e2e_report`（`dsh-e2e-` hash 兜底）；壳轮询 IPC 结论并打日志。配 `DSH_DESKTOP_E2E_EXIT=1` 自动退出：0 通过 / 2 失败 / 3 超时。注意：`window.title()` 与 `document.title` 在 macOS 上不同步，标题不能做 verdict 通道。

### 功能面

M1（已实现）：

1. **外链路由** —— document 捕获阶段 click 监听：`target=_blank` 的锚点、跨源 http(s) 锚点、`mailto:`/`tel:` → `preventDefault` + `dsh_desktop_open_external`。同源无 target 的锚点、`#`、`javascript:`、`blob:`/`data:` 一律放行（SPA 内部导航）。判定是纯函数 `classifyAnchor`（`src/client/links.ts`），单测覆盖。
2. **注意力通知** —— 订阅 `ctx.sessions.list`（raf 批量快照流），做状态转移 diff（纯函数 `diffAttention`，`src/client/attention.ts`）：`running: true→false` 或 `pendingInteraction: 无→有`，且通知时刻 `document.hidden`，发 `dsh_desktop_notify`；一轮转移同时出现两种边时只发「等待输入」一条。标题用 `displayTitle`。后台会话（未选中）同样通知——这是桌面形态的核心价值。
3. **桌面指示** —— `shell.overlay`（加性 list 槽，全帧浮层）注册 `desktop-badge` 条目：右下角小 pill「桌面版」，点击以 `dsh_desktop_open_external` 打开当前 origin（复制会话到系统浏览器）。样式只用 `--dsw-*` 语义 token，绝不写字面色。

M2（下载桥与 i18n 已实现；其余规划，先改本表再动手）：

- ~~下载桥~~（已实现）：捕获 `a[download]` 点击（同源 http(s) 与 `blob:`，纯函数 `classifyDownload` 判定）→ fetch blob → base64 → `dsh_desktop_save_file`；invoke 失败回退 `location.href` 导航下载。
- ~~badge 文案接 `ctx.locale` 双语~~（已实现，namespace `desktop-bridge`）。
- 通知点击回跳：壳发 `dsh-desktop://focus-session` 事件，插件聚焦并 `sessions.open(id)`。**受阻**：macOS 通知点击回调需 UNUserNotificationCenter delegate（objc2 绑定），`osascript` 无回调通道——留待 M3 平台化一并做。
- 托盘 / 未读角标（壳读 DOM title 或插件显式上报）。

### 组合与 slot 纪律（沿用 DSH client 约定的最小子集）

- UI 只经 `ctx.slots.register(...)` 组合；本插件只注册 `shell.overlay`（additive），声明洞一律禁止。
- 跨包只走 slot 与 ctx 服务，禁止 import 其他插件的实现符号；harness 包只做 type-only import（构建时擦除）。
- 注册即 effect：所有监听、订阅、slot 注册经 `ctx.effect()` / register 返回的 disposer，卸载/HMR 全量回收。
- 文案中文（M2 起接 `ctx.locale` 双语）；代码注释英文。
- 无硬编码 tunable：可调项（如通知开关）是 `Config` 字段，从 cordis.yml `config` 进来，非法值 fail loud。

## 壳（Tauri 2）契约要点

壳对插件只有两个义务：初始化脚本注入 `window.__DSH_DESKTOP__`（见上），注册 IPC 命令表（见上）。其余职责不变：spawn harness sidecar（`dsh web`，随机回环端口）、`GET /` 就绪检测（host.describe 是 RPC 方法名，不是 HTTP 路由）、窗口加载 `http://127.0.0.1:<port>`。生产形态把本插件经 `dsh plugin --profile web add` 装进随包 profile（自带 `dsh.bundle` 层，无需 `--patch`）。

## Commands

前置：Node 22+、pnpm；类型检查与构建另需 DSH 源码 checkout（默认 `~/workspace/coding-study/deepseek-harness`，可用 `DSH_CHECKOUT` 覆盖，验证标准 `$DSH/docs/architecture.md` 存在）。

```sh
cd plugin/dsh-desktop-bridge
pnpm install          # 安装 devDeps（tsdown/typescript/tsx/react 类型）
pnpm run setup        # 建 dsh → $DSH_CHECKOUT 符号链接（类型解析锚，gitignored）
pnpm run typecheck    # tsc --noEmit（harness 包 import 经 dsh 链接解析到源码）
pnpm run build        # tsdown：lib/index.js + lib/invariant.js + lib/client.js
pnpm run test         # node --import tsx --test（纯函数单测）
pnpm run watch        # tsdown --watch（配合 dsh web 的 client-hmr 热替换）
```

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

壳的 sidecar 默认跑在真实 `~/.dsh`（与终端同源）；`~/.dsh-desktop/logs/` 落 `sidecar.log` 与 `install.log`。浏览器内验证桌面行为以 `window.__DSH_DESKTOP__` 手工注入为辅助手段。

## Conventions

- ESM（`"type": "module"`）；包名 `dsh-desktop-bridge`（无 scope，随包分发）。
- client bundle 构建契约（banner/footer/externals）从 DSH `packages/client/tsdown.client.ts` 蒸馏：产物是 `window.__ModuleLoader__.load({id, factory})` 闭包；externals = 平台模块表（react/cordis/ui-slots/web-react/ui-primitives/ui-attachment/schema-form + runtime 豁免）；非平台 `@deepseek-ai/*` 值 import 一律构建报错（纯度门）。
- 纯函数与副作用安装分离：判定/diff 逻辑无 DOM 依赖可单测；安装函数薄壳包 effect。
- 空不发声、缺即报错：可选服务 `ctx.get()` 处理 undefined；配置缺引用在能定位的最早点 throw。
- 组件不做订阅机械（useSyncExternalStore 等）；快照流消费在 apply 世界订阅、经闭包注入。
- 文件恰好一个行尾换行；`git diff --check` 干净。
- 非平凡变更加 Agent Note（`docs/notes/`，日期命名）记录决策与理由。

## Milestones

仓库整体（README 详述）：M1 Tauri 原型（脚手架 + sidecar + 端口 + 就绪 + 窗口）→ M2 对齐 dataelement 行为 → M3 平台化（签名/更新/安装包）→ M4 系统 WebView 回归。

### 运行时分发决策（已定，M3 实现）

不发 npm 包。fork 的 GitHub 仓库（`aka-danielZhang/deepseek-harness` master）是 dsh 运行时的唯一事实源，永远带着我们的补丁。桌面每次发包：按仓库记录的 SHA 拉取/更新 fork 代码 → `pnpm install && pnpm run build` → 组装自包含运行时（node 二进制 + 构建产物 + 生产依赖）→ 捆进 .app resources。壳的 sidecar 解析顺序：app 内捆绑运行时 → `$DSH_CHECKOUT` → 本地 fork 源码（dev 兜底）；捆绑形态跑 `lib/bin.js` 构建产物（不经 tsx）。SHA 记在本仓库（`runtime/revision.json`），同步上游 = fork 合并 upstream/master + 改 SHA + 重新出包。

插件（本文件「功能面」的 M1/M2）；壳的 Rust 侧实现需本机 Rust toolchain（当前未安装，装好后从 M1 开始，契约已由本文件锁定）。
