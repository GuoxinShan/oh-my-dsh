# dsh-desktop

[![CI](https://github.com/aka-danielZhang/dsh-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/aka-danielZhang/dsh-desktop/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/aka-danielZhang/dsh-desktop?display_name=tag&sort=semver)](https://github.com/aka-danielZhang/dsh-desktop/releases/latest)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的原生桌面发行版：一个轻量 Tauri 壳承载完整 Harness runtime，并用一组独立插件补齐上游没有的能力、提高易用性。

## 特性

### 底层方式：Tauri + Sidecar

不捆绑 Chromium，也不做 Electron 套壳——Rust 壳只管进程与窗口，界面就是 `dsh web` 本身：

- **Sidecar 承载完整 runtime**：壳把内置的 DSH CLI + Node 24（固定 revision、含原生模块）作为 sidecar 进程启动，`dsh web` 跑在随机回环端口，就绪后窗口经系统 WebView（WKWebView / WebView2）加载。用户无需预装 Node、pnpm 或 DSH。
- **薄壳无业务**：壳层只有端口分配、就绪检测、窗口加载和 OS IPC；Harness 不感知壳的存在，桌面行为全部由插件组合实现。
- **与终端同一数据面**：会话、工作区、设置和凭据共享同一个 `~/.dsh`，桌面与 CLI 是同一账号的两个入口。
- **进程不泄漏**：Unix 进程组 / Windows Job Object、优雅退出阶梯和 stale-sidecar 注册表，保证 sidecar 全树随壳干净回收。
- **安装包即分发**：runtime 与桌面自有插件随壳一起打包；macOS Developer ID 签名 + 公证，Windows NSIS 免管理员安装，标题带内置后台检查与用户确认式自动更新。

### 插件：补齐 DeepSeek Harness 没有的能力

`plugin/` 下每个目录都是可独立安装、独立发版的 DSH 插件（`dsh plugin --profile web add <repo>/plugin/<name>`），除桌面门控桥外同样适用于终端 `dsh web`：

| 插件 | 补齐的能力 |
|---|---|
| [`dsh-desktop-bridge`](plugin/dsh-desktop-bridge) | 桌面集成门控桥：外链走系统浏览器、后台会话完成/等待输入的原生通知、下载保存、macOS 融合标题栏与侧栏控制、标题带更新入口、Harness 日志落盘；非桌面环境零副作用 |
| [`dsh-compaction-hierarchical`](plugin/dsh-compaction-hierarchical) | 层次压缩：以有界 map-reduce 让小上下文模型也能压缩超出其预算的长会话历史（上游 basic 压缩只能整段送入摘要模型） |
| [`dsh-mcp-settings`](plugin/dsh-mcp-settings) | Web 设置里的 MCP 服务器管理页：Form/JSON 编辑、启停、连接状态与工具计数 |
| [`dsh-provider-balance`](plugin/dsh-provider-balance) | 供应商配额可视化：输入框旁胶囊 + 模型设置页徽标，实时显示各供应商剩余额度 |
| [`dsh-reasoning-efforts`](plugin/dsh-reasoning-efforts) | 为手工声明的 OpenAI 兼容路由模型自动补 `reasoningEfforts`，让模型选择器出现推理等级面板 |
| [`dsh-web-search-toggle`](plugin/dsh-web-search-toggle) | 通用设置页的 Web Search 开关：凭据状态提示 + 一键启停原生搜索工具 |
| [`dsh-branding`](plugin/dsh-branding) | 品牌字标：侧栏字标替换为 "Oh My DSH" + 浏览器标题同步重写，终端/浏览器/桌面全形态生效 |

## 下载

前往 [GitHub Releases](https://github.com/aka-danielZhang/dsh-desktop/releases/latest)：macOS `.dmg`（Apple Silicon）、Windows NSIS `setup.exe`。

## 文档

- [AGENTS.md](AGENTS.md) — 仓库契约、插件边界、本地开发与构建命令
- [Packaging Playbook](docs/packaging-playbook.md) — 构建、签名与公证
- [Release Runbook](docs/release-runbook.md) — 发布流程
- [Design Notes](docs/notes/) — 关键决策记录

## License

MIT
