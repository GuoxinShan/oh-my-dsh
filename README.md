# dsh-desktop

[![CI](https://github.com/aka-danielZhang/dsh-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/aka-danielZhang/dsh-desktop/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/aka-danielZhang/dsh-desktop?display_name=tag&sort=semver)](https://github.com/aka-danielZhang/dsh-desktop/releases/latest)

DeepSeek Harness 的原生桌面发行版。它用 **Tauri 2 + 系统 WebView** 承载完整的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) runtime，并通过一组独立 DSH 插件补齐桌面集成，而不是再捆绑一份 Chromium。

项目已公开，当前按 `0.2.0-rc.x` 节奏持续发布。macOS 与 Windows 安装包由 GitHub Actions 从同一个 tag 构建；桌面自动更新始终指向最新的完整双平台 Release。

## 下载

前往 [GitHub Releases](https://github.com/aka-danielZhang/dsh-desktop/releases/latest) 下载最新版本：

| 平台 | 安装包 | 状态 |
|---|---|---|
| macOS Apple Silicon | `.dmg` | Developer ID 签名并通过 Apple 公证 |
| Windows x64 | NSIS `setup.exe` | 当前用户安装；未签名构建可能触发 SmartScreen 提示 |
| Linux | 暂无官方安装包 | 可从源码参与适配 |

macOS 打开 DMG 后把 `dsh-desktop.app` 拖入 Applications。Windows 运行 NSIS 安装器即可，不需要管理员权限。

安装后的会话、工作区、设置和凭据默认与命令行 DSH 共用同一个 `~/.dsh`。`~/.dsh-desktop` 只保存桌面 runtime、插件资源和壳层编排数据，不复制用户业务数据。

## 已实现能力

- **完整 Harness runtime**：Release 内置固定 revision 的 DSH、Node 24 与所需原生模块，用户不需要单独安装 Node 或 pnpm。
- **原生桌面窗口**：Tauri 负责随机回环端口、sidecar 启动、就绪检测和系统 WebView；macOS 使用融合标题栏与原生窗口控制。
- **可靠的进程生命周期**：Unix 进程组、Windows Job Object、优雅退出阶梯和 stale-sidecar 注册表共同防止孤儿 Harness 进程。
- **桌面系统集成**：系统浏览器外链、原生注意力通知、下载保存桥、窗口拖拽区和桌面专属侧栏控制。
- **About 与自动更新**：About 页展示桌面版本和内置 runtime revision；后台静默检查更新，用户确认后才下载、验签、安装并重启，两个 UI 入口共享同一进度状态。
- **可诊断日志**：Harness 日志与桌面 sidecar 日志写入 `$DSH_HOME/logs`，并维护 latest 软链接。
- **桌面自有插件**：Release 只捆绑运行面直接依赖的 `dsh-desktop-bridge` 与 `dsh-compaction-hierarchical`，其他插件保持独立安装和独立发版。

## 架构

```text
┌──────────────────────── dsh-desktop ────────────────────────┐
│ Tauri 2 shell                                                │
│  ├─ runtime/resource extraction                              │
│  ├─ sidecar supervision                                      │
│  ├─ updater, notifications, downloads, external links        │
│  └─ WKWebView / WebView2 → http://127.0.0.1:<random>          │
│                              │                                │
│                              ▼                                │
│ Bundled DeepSeek Harness runtime                              │
│  ├─ Node 24 + DSH CLI                                        │
│  ├─ shared ~/.dsh sessions, settings and credentials         │
│  └─ web profile                                              │
│      ├─ dsh-desktop-bridge                                   │
│      └─ dsh-compaction-hierarchical                          │
└──────────────────────────────────────────────────────────────┘
```

壳层只负责进程、窗口、分发和 OS IPC；Harness 业务能力仍由 Cordis/DSH 插件组合。普通浏览器中的 `dsh-desktop-bridge` 会在检测不到 `window.__DSH_DESKTOP__` 时零副作用退出，因此同一插件也可以安全挂进终端启动的 `dsh web` profile。

## 仓库结构

```text
plugin/<name>/                  独立安装、测试和发版的 DSH 插件
  dsh-desktop-bridge/           桌面门控桥、About/更新 UI、日志汇
  dsh-compaction-hierarchical/  桌面随包的层次压缩 Provider
  dsh-mcp-settings/             MCP 设置插件
  dsh-provider-balance/         Provider 配额可视化
  dsh-reasoning-efforts/        reasoningEfforts 声明补丁
  dsh-web-search-toggle/        Web Search 通用设置开关
src-tauri/                      Tauri 2 Rust 壳、权限与打包配置
scripts/                        runtime 组装、资源打包与发布校验
docs/                           打包/发布手册和设计决策记录
runtime/revision.json           内置 Harness fork tag 与精确 commit
```

插件 tag 使用 `<包名>-v<semver>`，桌面 tag 使用 `v<semver>`；两者版本独立。部分插件同时发布到 npm，具体分发纪律见 [AGENTS.md](AGENTS.md)。

## 本地开发

前置条件：Node 22+、仓库声明版本的 pnpm、Rust stable。Windows 需要 MSVC toolchain；构建 runtime 的操作系统必须与目标安装包一致。

```sh
git clone https://github.com/aka-danielZhang/dsh-desktop.git
cd dsh-desktop
pnpm install

# 组装公开 fork 对应的 runtime，并作为插件类型锚使用
node scripts/prepare-runtime.mjs
DSH_CHECKOUT="$PWD/runtime/src" pnpm run plugin:setup

# 各桌面自有插件保持独立依赖树
pnpm --dir plugin/dsh-desktop-bridge install
pnpm --dir plugin/dsh-compaction-hierarchical install --frozen-lockfile

# 开发窗口
pnpm desktop:dev
```

常用验证命令：

```sh
# 全树检查前，各插件需要自己的依赖树（symlink 锚会自动跳过）
for dir in plugin/*/; do [ -L "${dir%/}" ] || (cd "$dir" && pnpm install); done

pnpm run plugins:check       # 所有出树插件的 typecheck/test/build
pnpm run desktop:prepare     # 组装 runtime 与桌面自有插件资源
pnpm desktop:build           # 当前平台的完整安装包
```

`src-tauri/resources/` 是构建生成目录。裸跑 `cargo build`/`cargo check` 会因为资源门禁失败；需要先执行 `pnpm run desktop:prepare`。完整平台步骤见 [打包手册](docs/packaging-playbook.md)。

## 发布与更新

桌面版本同时写在 `src-tauri/tauri.conf.json` 与 `src-tauri/Cargo.toml`。推送匹配的 `v<semver>` tag 后，Release workflow 会并行构建 macOS 和 Windows，只有两端都成功才生成 `latest.json` 并推进 GitHub `latest` 指针。

macOS 流水线还会解析 DMG 的 `.DS_Store`，核对背景模式、窗口尺寸和图标坐标，再执行公证。发布操作与故障恢复见 [Release Runbook](docs/release-runbook.md)。

## 项目文档

- [AGENTS.md](AGENTS.md)：仓库契约、插件边界、runtime 分发和版本纪律
- [Packaging Playbook](docs/packaging-playbook.md)：macOS/Windows 构建、签名、公证与安装包结构
- [Release Runbook](docs/release-runbook.md)：tag、GitHub Actions、Release 与自动更新
- [Design Notes](docs/notes/)：关键问题的复现、决策和验证记录

问题与改进建议可以直接提交 [Issue](https://github.com/aka-danielZhang/dsh-desktop/issues) 或 Pull Request。

## License

MIT
