# 2026-08-18 — Tauri shell M1 + the WKWebView chunked-response boot failure

## Decision

M1 landed: Rust shell (`src-tauri/`) spawns the harness as a direct node
child (no pnpm layer — direct children reap cleanly), owns
`~/.dsh-desktop/` (isolated DSH home + logs), idempotently installs the
bridge row into its web profile, polls `GET /` for readiness, opens the
main window with the frozen `__DSH_DESKTOP__` gate, and registers the four
IPC commands. The e2e probe (gate → app-root → badge DOM → save_file IPC
roundtrip) reports through the `dsh_desktop_e2e_report` command and exits
0/2/3 under `DSH_DESKTOP_E2E_EXIT=1`.

## Isolated home is deliberate (user asked)

The terminal `~/.dsh` is NOT shared: the harness has no multi-process
locking story for one DSH_HOME, and running the desktop sidecar against the
terminal's live home produced intermittent sidecar boot hangs (lock
contention) in testing. Sharing/migrating terminal data needs an explicit
single-instance-guarded design — a later milestone, not a default.

## The WKWebView chunked-response boot failure (root-caused)

Symptom: in the WKWebView the DSH UI intermittently showed "Failed to load
plugins — bundle script … failed to load" (a random bundle each run), or
stuck at "Loading plugins…". Chrome loaded the same page cleanly every
time. In-page `fetch()` of the failed bundle URL kept failing with
`Load failed` even 60s later while `curl` fetched it fine — a per-page
permanent failure, not a transient race.

Cause: the harness webserver writes every response chunked (no
`content-length`, because `res.writeHead(...); res.end(body)` suppresses
node's length computation). Under the boot-time burst of ~39 concurrent
plugin-bundle requests, WKWebView drops/hangs some chunked loopback
responses. Fix (3 lines): explicit `content-length` in the `serveBundle`
route of `packages/client/modules/src/index.ts`. Verified 5× green e2e
after, vs ~0% success before. The sidecar runs from harness source, so the
patch takes effect directly; it should be upstreamed through the fork
(every WKWebView consumer of the harness hits this).

A `keepAliveTimeout = 65s` change to `packages/host/webserver` was tried
first and did NOT fix the failure (rolled back — do not re-add without new
evidence).

## e2e channel lessons (documented in AGENTS.md)

- `window.title()`/`document.title` do NOT sync on macOS WKWebView — dead
  channel.
- `window.url()` panics inside wry while the webview URL is nil (the
  about:blank → http transition) — never poll it early.
- Remote-URL contexts need per-command ACL: `AppManifest::commands` in
  build.rs + the hyphenated `allow-*` entries in the capability.
- The verdict race (hash overwritten by an unhandled rejection) is why the
  report writes the hash first and swallows the invoke rejection.
