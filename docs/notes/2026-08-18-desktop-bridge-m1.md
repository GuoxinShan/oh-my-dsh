# 2026-08-18 — dsh-desktop-bridge M1: scope, gate design, and build contract

## Decision

The repository's first shipped artifact is the DSH client plugin
(`plugin/dsh-desktop-bridge`), not the Tauri shell: the local machine has no
Rust toolchain, while the plugin surface (TypeScript, DSH checkout as the
type/build anchor) is fully verifiable today. The shell's obligations to the
plugin are pinned as a contract now (gate signal + IPC command table in
AGENTS.md) so the Rust side lands against a frozen interface later.

## Why these three bridges (and no more)

- External links: `target=_blank` in WKWebView/WebView2 is a no-op or opens
  in-app; the harness UI ships such anchors (WebBlock, TrajectoryTable), so
  the desktop needs a router to the OS browser.
- Attention notifications: the harness already computes per-session
  `running` and `pendingInteraction` in the sessions list; the desktop adds
  value exactly when the window is hidden, so the bridge diffs the list and
  fires native notifications on turn-done / await-input edges. This is the
  feature a desktop shell exists for.
- Desktop badge: registered into `shell.overlay` (the documented additive
  frame-wide seat) — doubles as a liveness probe and the "open in browser"
  escape hatch.

Deliberately out of M1: the download bridge (needs the shell's save-file
command to exist) and notification-click focus (needs a shell→webview event;
both listed as M2 in AGENTS.md).

## Gate design

`window.__DSH_DESKTOP__` (shell-injected) is the single gate; missing gate →
apply returns with zero registrations, so the row is safe to mount in any
deployment (terminal `dsh web` included). Present gate + missing
`__TAURI_INTERNALS__` throws — a shell-contract violation is a bug to
surface, not to absorb. Unknown future `version` integers downgrade to 1
with a warning: additive fields stay readable, which is the only forward
compatibility a v1 contract can promise.

## Build contract (distilled)

The out-of-tree client bundle reproduces the harness's
`packages/client/tsdown.client.ts` closure-factory protocol: banner/footer
wrapping `window.__ModuleLoader__.load`, CJS output, platform modules
external (the browser shell's frozen module table answers them), purity gate
rejecting non-platform `@deepseek-ai/*` value imports. CSS modules are not
used (inline styles over `--dsw-*` tokens only) so the lightningcss pipeline
is not duplicated here. Type resolution rides a `dsh` symlink to the harness
checkout (`pnpm run setup`), which `link:` devDependencies point through —
the harness packages' own `lib/types` declarations serve tsc directly.

## Verification

Scratch `DSH_HOME` install (`dsh plugin --profile web add <path>`), live
`dsh web` boot: the row appears in `window.__DSH_BOOT__` with both inject
edges, `/plugins/dsh-desktop-bridge/client.js` serves 200, and 19 unit tests
cover the pure link/attention/probe logic. Desktop-only behavior (gate
present) is unit-tested; a real webview pass lands with the shell milestone.
