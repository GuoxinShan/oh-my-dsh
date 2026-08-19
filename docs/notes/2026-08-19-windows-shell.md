# 2026-08-19 — Windows 壳（NSIS + Job Object + 本机组装）

日期：2026-08-19。配套：`docs/packaging-playbook.md` §8；契约同步在 AGENTS.md。

## 决策

Windows 与 macOS **必须各自在目标 OS 上组装 runtime**。native 模块（node-pty / esbuild / sharp / koffi）和 `node` npm 包的二进制布局（`bin/node` vs `bin/node.exe`）都是平台产物；mac 打出来的 tar 在 Windows 上解出 Unix 符号链接，没有 Developer Mode 会失败或变成废文件。缓存键因此带上 `process.platform` + `process.arch`（`.script-rev`），CI cache key 带 `runner.os`。

安装包走 **NSIS currentUser**（不需管理员；MSI/WiX 不打，避免 CI 再装一套）。`installerIcon` / `uninstallerIcon` 必须显式指到 `icons/icon.ico`，否则 setup.exe 用的是 NSIS 默认那个蓝箭头圆标。WebView2 缺失时 installer 下 bootstrapper。自动更新 `latest.json` 增加 `windows-x86_64`，与 `darwin-aarch64` 由 publish job 合并，避免两个 runner 抢写一份 manifest。

## 壳层对齐

| Unix | Windows |
|---|---|
| `$HOME` | `%USERPROFILE%`（不用 Git Bash 的 `/c/Users/...`，那不是 Win32 路径） |
| PATH `:` | PATH `;` |
| `process_group(0)` + `kill(-pgid)` | Job Object `KILL_ON_JOB_CLOSE`；Assign 失败（父进程已在禁止 breakaway 的 job 里，常见于部分 CI/IDE）则 `taskkill /T` + 注册表清扫兜底 |
| `ps -o lstart=` | `GetProcessTimes` FILETIME |
| `osascript` 通知 | PowerShell WinRT toast（AppId `dev.dsh.desktop`；unpackaged/`tauri dev` 可能不出横幅，NSIS 装完有快捷方式后才稳） |
| `open` | `cmd /C start "" <url>`（空标题，避免 `start` 把引号 URL 当窗口标题） |
| unix symlink | 目录 symlink，失败则 `mklink /J`（junction，不需管理员） |
| `tar -xzf C:\...` | GNU tar / 旧 bsdtar 要 `--force-local`；Win11 bsdtar 3.8.4 不认此选项且绝对路径可直接解。prepare 与壳按 `tar --help` 探测 |

`execFileSync('pnpm')` 在 Windows 找不到 `.cmd`：脚本统一走 `scripts/cli-bins.mjs`（Node 20+ 还要 `shell: true`，否则 spawn `.cmd` 报 EINVAL）。

Windows 组装 runtime 用 `node-linker=hoisted`：bsdtar 会把 NTFS junction **展开成普通目录**，pnpm isolated 布局里 `tsx` 一旦被拷出 `.pnpm` 就解析不到旁边的 `esbuild`。Unix 仍用默认 isolated（POSIX symlink 能进 tar）。桥的 `cordis` 链接因此要认 hoisted 路径 `dsh/node_modules/@deepseek-ai/cordis`，不能只扫 `.pnpm/@deepseek-ai+cordis@*`（hoisted 树里那个目录几乎是空的，扫不到就静默跳过 → log-sink `ERR_MODULE_NOT_FOUND` 整棵插件树失败）。

## 未做（有意推迟）

- Authenticode 签名：流水线已接 PFX secrets；用户选择本机不签名（SmartScreen 可能警告）。见 `docs/packaging-playbook.md` §9。
- Job Object 的 CREATE_SUSPENDED 无竞态赋值：现后 spawn 再 Assign，孙子进程有极窄窗口逃出 job；注册表 + `taskkill /T` 是网。
- ARM64 Windows：只打 x86_64（`windows-latest`）。
