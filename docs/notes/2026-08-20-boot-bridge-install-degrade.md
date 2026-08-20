# Boot: bridge install soft-degrade + named plugin alert

## Context

Release `v0.2.0-rc.7` 安装后，壳在启动时硬失败：`plugin --profile web add <bridge>` 因共享 `~/.dsh/profiles/web` 的 pnpm 状态（lockfile 与 `@dsh-yzj/*` 不一致、workspace root 拒绝 add）而失败；随后 `plugin install` relink（`CI=true` → frozen lockfile）再失败，壳 `exit(1)`。用户侧表现是双击闪退、无任何对话框——桌面能力装不上就把整个应用砖掉，体验不可接受。

同账号终端面改过 profile 依赖是常态；壳不该把「装不上桌面桥」升级成「不能用 Harness」。

## Decision

1. **软降级**：`run_plugin_install` 最终失败时不再 `?` 中止 `boot_sequence`。继续 spawn sidecar、开窗。桥未入 profile 时桌面门控本身 inert（无 `__DSH_DESKTOP__` 外的副作用），外链/通知/标题栏融合暂缺即可。
2. **点名提示**：开窗后弹原生 warning（macOS `osascript display alert` / Windows WPF MessageBox / Linux zenity→notify-send）。文案固定点名 `dsh-desktop-bridge`，并从 `install.log` 尾部尽量抽出冲突包名（如 `@dsh-yzj/bundle`），附 lockfile/workspace 类错误的中文摘要与日志路径。
3. **致命错误也弹窗**：runtime 缺失、sidecar 超时等仍退出，但先 `alert_user`，避免再次静默闪退。

不在此轮自动卸掉用户 profile 里的第三方插件——那是破坏性操作，只诊断与降级。

## Alternatives rejected

- 加 `tauri-plugin-dialog`：多一个依赖，告警只在 boot 线程用几次，osascript/MessageBox 足够。
- 装桥失败时重建整个 web profile：会抹掉用户 `link:` 插件与 patch，过猛。
- 仅写日志不弹窗：用户看不见，正是本次投诉点。

## Follow-up: user-confirmed repair

Dialog buttons: **修复并重试** / **继续降级**.

Repair (only after confirm):
1. Idempotent `ignore-workspace-root-check=true` on `~/.dsh/profiles/web/.npmrc`
2. `dsh plugin --profile web install` **without** `CI=true` (may refresh lockfile)
3. Retry `plugin add <bridge>`

Still never auto-disables or removes third-party plugins.
