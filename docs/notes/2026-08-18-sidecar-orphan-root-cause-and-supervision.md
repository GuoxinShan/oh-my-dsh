# 2026-08-18 — Orphaned sidecars after `tauri dev` rebuilds: root cause and supervision

## Problem

Tonight's icon retune loop (`touch tauri.conf.json` → watcher rebuild,
repeated) left **9 orphaned harness sidecars** (PPID 1, each holding a
random loopback port and the shared `~/.dsh`). The shell's exit path
(`RunEvent::Exit → kill_sidecar`) never ran for any of them. Why does a
rebuild orphan the sidecar at all?

## Root cause (verified against tauri-cli v2.11.4 sources)

The rebuild path lives in `crates/tauri-cli/src/interface/rust.rs`:

```rust
child.kill().context("failed to kill app process")?;  // SIGKILL on Unix
let _ = child.wait();
child = run(self, config)?;
```

- `Child::kill()` on Unix is **SIGKILL — uncatchable by definition**. No
  handler, no `atexit`, no run-event can intercept it. The app's own
  cleanup is unreachable in this path *by construction*, no matter what
  the shell does.
- tauri-cli's only descendant-cleanup (kill-children.sh / PowerShell
  Kill-Tree in `kill_before_dev_process`) applies **exclusively** to the
  `beforeDevCommand` child. Our `build: {}` has none, and the app's own
  children are never covered. The SIGKILLed shell's sidecar is reparented
  to launchd and keeps running.
- The watcher's built-in ignore list (`node_modules/ target/ gen/
  Cargo.lock .DS_Store`) does **not** include `icons/` — touching any
  icon (or `tauri.conf.json`) triggers the kill-restart, which is how an
  icon-only session produced nine orphans.

So the original AGENTS.md framing ("改 src-tauri 前先停 tauri dev，或接受
手动清理") described a real constraint but the fix is not operational
discipline — it's supervision in the shell.

## Design

Two layers, matching what each can and cannot do:

1. **Termination ladder on every reachable exit path** (pulls the M2
   "graceful exit" item forward): the shell installs SIGINT/SIGTERM/SIGHUP
   handlers (the handler only stores an atomic; a poller thread performs
   the shutdown — nothing unsafe inside the handler), and all exits —
   signals and `RunEvent::Exit` alike — go through **SIGTERM → 3s grace →
   SIGKILL**, so the harness can flush. This covers `kill <app>`, Ctrl-C
   on `tauri dev` (SIGINT propagates through the process group to the
   app), and normal quits.
2. **Stale-sidecar registry** (`~/.dsh-desktop/sidecars.json`) for the
   one path no process can handle — its own SIGKILL: at spawn the shell
   records `{sidecar pid + ps lstart, shell pid + ps lstart, port, log}`;
   every boot first sweeps the registry before spawning its own sidecar.

Sweep decisions (`sweep_decision`, unit-tested truth table):

| shell alive | sidecar alive | action |
|---|---|---|
| yes | yes | keep — a live shell owns it |
| any | no | forget — stale record |
| no | yes | **reap** — orphan; ladder, then forget |

Safety properties, deliberately:

- The sweep only ever acts on **registered pids** — never a name-based
  process-table scan — so a terminal's own `dsh web` cannot be collateral
  damage. (Tonight's baseline proved why this matters: the long-lived
  3080 GUI server must be untouchable by desktop-shell logic.)
- **pid recycling** is guarded by `ps lstart` equality: a recycled pid
  has a new start time and reads as dead.
- Registry corruption **fails open** (reads as empty): bookkeeping must
  never brick the boot; the worst case is one unsupervised sidecar.
- Concurrent shells race last-wins on the registry; a lost entry goes
  *unsupervised*, never falsely reaped — the safe direction.

## Verification

- `cargo test`: 5 tests (truth table, registry roundtrip/replace-by-pid,
  fail-open, lstart identity, live SIGTERM ladder against a scratch
  `sleep`).
- Live rebuild drill: `pnpm desktop:dev` → registry entry
  {shell 949, sidecar 1031} → `touch tauri.conf.json` → watcher
  SIGKILLed 949 → the replacement shell logged
  `reaped stale sidecar pid=1031 port=54914` and started its own —
  **zero orphans after the exact sequence that produced nine tonight**.
- Signal drill: `kill -TERM <shell>` → `signal 15 received, shutting the
  sidecar down` → registry empty, tauri dev exited 143, only the
  terminal's 3080 server remained.

## Boundary

A SIGKILLed shell's sidecar survives **until the next desktop boot**
reaps it. That is inherent (a killed process cannot clean up after
itself, and we intentionally do not run a daemon); the registry turns
"orphaned forever" into "orphaned until next boot". Coordinated
single-instance (M2) builds on top of the registry for port/session
coordination.

Upstreaming a watcher kill-tree (or SIGTERM-then-KILL) to tauri-cli
would fix the class for everyone; not pursued as a PR tonight, but we
did find and join the existing threads after this landed:

- tauri#14443 "Add kill-tree helper and runtime sidecar PID registry"
  (open PR, stalled) — we left a field report: the 9-orphans incident,
  the SIGKILL path analysis, and registry semantics (lstart guard,
  fail-open, registered-pids-only). The CLI-side dev-run cleanup is the
  half that fixes our orphan class; the runtime registry cannot cover a
  SIGKILLed app.
- plugins-workspace#1332 (process-group spawn option in the shell
  plugin, `process-wrap`) — maintainer-endorsed direction; we reported
  that `process_group(0)` + `kill(-pgid)` is what we now run in
  production on macOS.

## Follow-up (same night): process groups instead of tree walking

Layer 3, replacing per-pid signals with group signals: the sidecar now
spawns in its **own process group** (`Command::process_group(0)`, std
since 1.64), and every termination path signals `-pgid` instead of the
bare pid. Rationale:

- One kernel call reaches the whole sidecar tree **atomically** — no
  enumerate-then-kill window (TOCTOU), no shell scripting, no
  PowerShell availability concerns.
- The harness spawns its own children (MCP servers, tool commands).
  Under the old per-pid SIGKILL those escaped — the live drill caught a
  real `leetcode-mcp-server` grandchild in the sidecar's group, which
  the group signal now covers. (Pre-fix orphans of exactly this shape
  were still findable on the box: a Claude Code session from Aug 14
  owns a same-named pair — name-based sweeping would have been deadly,
  which is why the sweep stays registry-pids-only.)
- Ctrl+C in the terminal no longer hits the sidecar directly (it is no
  longer in the terminal's foreground group); shutdown ordering belongs
  to the shell's signal handler.

Grace notes: `getpgid` guards registry entries written by
pre-group-builds (bare-pid fallback), and a final group SIGKILL after
the leader's wait sweeps grandchildren that ignored SIGTERM. Windows
waits for M3 (`process-wrap`/Job Objects — same direction as
plugins-workspace#1332).

Verified: `cargo test` 6 green (new test drives sh + two sleeps in a
group and asserts one group signal reaps all three); live drills —
rebuild reaped sidecar **and** its mcp grandchild, TERM exited with an
empty registry and zero leftovers, the terminal's own servers untouched.

