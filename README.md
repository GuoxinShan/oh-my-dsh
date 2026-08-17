# dsh-desktop

基于 **Tauri 2** 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 桌面壳：Rust 壳 + Node sidecar，替代 Electron 封装方案。

> 私有项目，早期规划阶段。参考了 [dataelement/dsh-desktop](https://github.com/dataelement/dsh-desktop)（Electron 实现）的进程编排设计。

## 为什么是 Tauri 而不是 Electron

DSH 本身就是「Node Host 进程 + 纯 Web UI」的分离架构，壳只需要做四件事：

1. spawn Harness 子进程（sidecar，捆绑 Node 24 + 架构相关原生模块）
2. 随机回环端口分配（`portpicker`，避免冲突）
3. 就绪检测（轮询 `/api/host.describe`）
4. 窗口加载 `http://127.0.0.1:<port>`（系统 WebView：WKWebView / WebView2）

Electron 壳里 Chromium + Node 是纯冗余——DSH 带原生模块（landlock addon）需要真 Node ABI，dsh-desktop 因此单独捆绑了 node@24.9.0，Electron 自带的运行时完全空转。Tauri 版直接砍掉这层开销。

| | Electron 壳 | Tauri 壳（本项目） |
|---|---|---|
| 壳本体 | ~190MB | ~10MB Rust 二进制 |
| 常驻内存 | 300-500MB（整个 Chromium） | 80-150MB（系统 WebView 共享） |
| Node 运行时 | ~90MB（保留） | ~90MB（保留） |
| Webview | Chromium（一致） | 系统 WebView（需回归验证） |

## 架构

两个平面（契约详见 [AGENTS.md](AGENTS.md)）：

```
dsh-desktop
├── plugin/dsh-desktop-bridge        DSH 双面客户端插件（当前产品主体）
│    ├── host half：空 apply（Loader 行合法即可）
│    └── browser half（window.__DSH_DESKTOP__ 门控，普通浏览器零副作用）
│         ├── 外链路由 → dsh_desktop_open_external（系统浏览器）
│         ├── 注意力通知 → dsh_desktop_notify（后台会话回合完成/等待输入）
│         └── shell.overlay 桌面指示 pill
└── Tauri 2 Rust 壳（规划中）
     ├── sidecar: Harness Node 子进程（独立崩溃域，崩溃壳层可重启）
     ├── 随机 127.0.0.1 端口分配 + 就绪检测
     ├── 单实例锁 / 优雅关停（SIGTERM → SIGKILL）
     ├── 自动更新（Tauri updater 插件）
     ├── webview 初始化脚本注入 window.__DSH_DESKTOP__ + IPC 命令表
     └── 系统 WebView 窗口
          └── http://127.0.0.1:<random>  ← DSH Web UI + 桥插件
```

关键原则：壳层不含业务逻辑；Harness 不感知壳的存在，可独立开发调试（终端里 `dsh web` 照常工作，桥插件在非桌面环境自动静默）。桌面感知行为全部住在插件里，以 `dsh plugin --profile web add dsh-desktop-bridge` 装进随包 profile。

## Milestones

- [x] M0 桥插件：`plugin/dsh-desktop-bridge`（外链路由 / 注意力通知 / 桌面指示），实机挂载验证通过
- [ ] M1 壳原型：Tauri 脚手架 + sidecar spawn + 端口分配 + 就绪检测 + 窗口加载 + `__DSH_DESKTOP__` 注入 + IPC 命令表
- [ ] M2 对齐 dsh-desktop 行为：单实例锁、孤儿进程清理、日志落盘、启动根目录管理、下载桥与通知点击回跳
- [ ] M3 平台化：macOS 签名公证、自动更新、安装包（DMG / NSIS）
- [ ] M4 WKWebView / WebView2 下 DSH client UI 回归（重点：`color-mix()` 等 CSS 兼容）

## 开发

```sh
# 前置：Node 22+、pnpm；桥插件的类型检查/构建另需 DSH 源码 checkout（见 AGENTS.md）
cd plugin/dsh-desktop-bridge
pnpm install && pnpm run setup
pnpm run typecheck && pnpm run build && pnpm run test

# Tauri 壳（M1 起，需 Rust toolchain）
pnpm tauri dev
pnpm tauri build
```

## License

MIT
