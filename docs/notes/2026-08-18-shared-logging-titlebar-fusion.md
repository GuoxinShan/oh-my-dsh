# 2026-08-18 — Shared harness-style sidecar logging, macOS titlebar fusion, and the tauri-dev orphan discovery

## Decision 1: sidecar logs follow the fork's `web:log` convention

The shell previously appended all sidecar output to one ever-growing
`~/.dsh-desktop/logs/sidecar.log`. It now resolves a per-boot file through
`sidecar_log_path()` (`src-tauri/src/lib.rs`):

- directory: `DSH_WEB_LOG_DIR` if set, else `$DSH_HOME/logs` — the same
  directory terminal `dsh web:log` boots write, so both faces of the account
  share one log home;
- name: `desktop-<yyyymmdd-HHMMSS>.log` (local time, chrono `clock` feature —
  the only new dependency) plus a `desktop-latest.log` symlink (unix-only;
  Windows keeps plain per-boot files, M3);
- `~/.dsh-desktop/logs/` keeps only `install.log` (shell orchestration
  output, not harness output).

The mechanism deliberately does NOT shell out to `dsh web:log`: that wrapper
spawns the harness as a grandchild, and SIGKILLing the wrapper orphans the
real server — the exact failure the direct-`node` spawn exists to avoid.
The convention is reimplemented in Rust (~30 lines) instead. Verified live:
three boots wrote `~/.dsh/logs/desktop-20260818-*.log` beside terminal
`web-*.log`, with the symlink tracking the newest.

## Decision 2: macOS titlebar fusion is split shell/bridge

The native title bar duplicated the page's own "deepseek HARNESS" header.
The shell now builds the window with `TitleBarStyle::Overlay` (macOS only):
traffic lights float over the page, no title text is painted. The page half
lives in the bridge plugin, gated on `gate.platform === 'macos'`
(`shouldFuseTitlebar`):

- one injected stylesheet pads the app frame 28 px
  (`div:has(> [data-shell-overlay])` — the only stable, always-present anchor
  on ui-layout's frame; `:has()` is fine on every WKWebView Tauri 2 runs on);
- a second `shell.overlay` entry `desktop-drag-strip` provides the drag
  surface Overlay windows require, via `data-tauri-drag-region` — Tauri 2's
  declarative marker, no custom IPC. The capability gains
  `core:window:allow-start-dragging` and
  `core:window:allow-internal-toggle-maximize` (double-click maximize).

Known edges (recorded in AGENTS.md): the strip covers the sidebar resize
handle's top 28 px (overlay z-20 > handle z-2), and Tauri cannot drag an
unfocused Overlay window (#4316).

## Discovery: tauri dev restarts orphan every sidecar

While these changes were being built, `pnpm desktop:dev` (tauri dev)
rebuilt on each edit and killed the shell process outright — the shell's
`RunEvent::Exit` SIGKILL of the sidecar never runs, so every rebuild left an
orphaned `node … web --port <random>` sharing `~/.dsh`. Four accumulated in
twenty minutes. Two consequences worth remembering:

- An orphaned sidecar keeps its resumed sessions' agent loops alive; the
  desktop's next instance lists those sessions cold (running=false) and a
  prompt there would cold-resume a second live owner — the cross-process
  stale-writer corruption path from the harness's own repro test.
- AGENTS.md now warns: stop tauri dev before editing `src-tauri/`, or clean
  orphans manually; the coordinated single-instance item (M2) is the real
  fix.

## Verification

- `cargo build` green (chrono added); bridge `pnpm typecheck` / `test`
  (28 tests, +4 for the titlebar gate and CSS) / `build` green.
- Live chain for the titlebar: the 21:08 desktop boot serves a bridge bundle
  containing `desktop-drag-strip`, and the shell binary carries the Overlay
  builder call.
- No e2e run yet: `DSH_DESKTOP_E2E_PROBE=1 pnpm desktop:dev` would kill the
  running shell (and this very session's sidecar); run it at the next
  planned restart.
