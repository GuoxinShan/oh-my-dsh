# dsh-desktop

基于 **Tauri 2** 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 桌面壳：Rust 壳 + Node sidecar，替代 Electron 封装方案。

> 私有项目，早期规划阶段。参考了 [dataelement/dsh-desktop](https://github.com/dataelement/dsh-desktop)（Electron 实现）的进程编排设计。

## 为什么是 Tauri 而不是 Electron

DSH 本身就是「Node Host 进程 + 纯 Web UI」的分离架构，壳只需要做四件事：

1. spawn Harness 子进程（sidecar，捆绑 Node 24 + 架构相关原生模块）
2. 随机回环端口分配（`portpicker`，避免冲突）
3. 就绪检测（轮询 `GET /`，webserver 就绪即 2xx）
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
dsh-desktop                         出树插件 + 桌面壳的 monorepo
├── plugin/<name>/                  一个可独立打 tag 的 DSH 插件（目录名 === 包名）
│    └── dsh-desktop-bridge         桌面门控桥（host 空 apply + browser 半门控）
│         ├── 外链路由 → dsh_desktop_open_external
│         ├── 注意力通知 → dsh_desktop_notify
│         └── shell.overlay 桌面指示 pill
└── Tauri 2 Rust 壳
     ├── sidecar: Harness Node 子进程
     ├── 随机 127.0.0.1 端口 + 就绪检测
     ├── webview 注入 window.__DSH_DESKTOP__ + IPC
     └── 系统 WebView → http://127.0.0.1:<random>
```

关键原则：壳层不含业务逻辑；Harness 不感知壳的存在。每个插件是独立安装单元（`dsh plugin --profile web add <repo>/plugin/<name>`），桌面 tag（`v<semver>`）与插件 tag（`<包名>-v<semver>`）分家。对照 dataelement/dsh-desktop 的 `patches/` 模型：那是钉死上游再打压缩包补丁，不是插件布局。

## Milestones

- [x] M0 桥插件：`plugin/dsh-desktop-bridge`（外链路由 / 注意力通知 / 桌面指示），实机挂载验证通过
- [x] M1 壳原型：Tauri 脚手架 + sidecar spawn + 端口分配 + 就绪检测 + 窗口加载 + `__DSH_DESKTOP__` 注入 + IPC 命令表（e2e `DSH_E2E_OK`；WKWebView chunked 加载失败已修，见 docs/notes）
- [ ] M2 对齐 dsh-desktop 行为：单实例锁、孤儿进程清理、日志落盘、启动根目录管理、通知点击回跳
- [ ] M3 平台化：macOS 签名公证、自动更新、安装包（DMG / NSIS）；Windows 壳与 NSIS 已落地，Authenticode 流水线已接（待填 Code Signing 证书）
- [ ] M4 WKWebView / WebView2 下 DSH client UI 回归（重点：`color-mix()` 等 CSS 兼容）

## 开发

```sh
# 前置：Node 22+、pnpm；桥插件的类型检查/构建另需 DSH 源码 checkout（见 AGENTS.md）
cd plugin/dsh-desktop-bridge
pnpm install && pnpm run setup
pnpm run typecheck && pnpm run build && pnpm run test

# Tauri 壳（M1 起，需 Rust toolchain；Windows 必须是 MSVC 目标，见 packaging-playbook §8）
pnpm desktop:dev
pnpm desktop:build
```

## License

MIT
