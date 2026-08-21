# dsh-fs-observation-log

Persist the `fs-observation-policy`'s observed-file evidence across process restarts and session forks, and **restore** an observation before `edit`/`write` when — and only when — the file provably did not change.

## The problem

`@deepseek-ai/dsh-fs-observation-policy` keeps its read-before-edit state in a `WeakMap` keyed by the live session object: pure memory, gone with the process. The session transcript, however, is durable. So after

- a desktop relaunch / `dsh web` restart (session resume), or
- a session fork (`subagent_fork`),

the model reads its own history ("I read this file / I just edited it"), follows it, and gets a false

```
Error: edit requires reading "<path>" first — read the file, then retry
```

even though the file never changed. The model cannot see the process boundary, so prompt guidance cannot fix this; each hit costs one wasted read+retry round trip. (Upstream tracks the fork half in discussions #275/#450; the package README lists resume persistence as a deferred limitation.)

## How it heals

1. **Mirror** — every `fs/observed` present-observation is appended to a per-session JSONL sidecar under `$DSH_HOME/fs-observation-log/` (first line is a header carrying the session's fork parent; fail-soft on write errors).
2. **Restore** — on `tools/pre-execute` of an `edit`/`write` whose target the acting session has not observed in this process, the plugin walks the session's fork lineage (self → parent → …, bounded and cycle-safe), stats the live file through `ctx.fs`, and re-emits `present` **only if the provider's freshness token is byte-identical to the recorded one** — i.e. the file provably did not change since the remembered observation.
3. Everything else — changed file, deleted file, no evidence — restores nothing. The stock policy keeps demanding a read. `FS_STALE_VERSION`, unique-match, and the sandbox stack are untouched.

Net invariant: **the guard never forgets more than the transcript remembers; a file that actually changed still demands a fresh read.** The local backend's version token (`dev:ino:size:mtimeNs:ctimeNs`) is stable across processes for an unchanged file, which is what makes the comparison sound.

## Install

```sh
dsh plugin --profile web add <repo>/plugin/dsh-fs-observation-log
```

The bundle patch is intentionally empty (install-only registration, like `dsh-compaction-hierarchical`): activation belongs to each agent preset — add the row from `preset-snippet.yml` to your user preset:

```yaml
- id: fs-observation-log
  name: dsh-fs-observation-log
```

The plugin contributes no service, needs no realm, and is inert when the stock observation policy is absent.

## Config

| field | default | meaning |
|---|---|---|
| `maxEntriesPerSession` | 200 | Per-session sidecar cap; on overflow the file is rewritten keeping the newest half. |
| `inheritFork` | `true` | Whether a forked session may inherit its lineage's evidence (its transcript inherits the reads). |
| `maxLineageDepth` | 8 | Fork-lineage chain bound (cycle guard). |
| `maxWriteFailures` | 5 | Consecutive sidecar write failures before the store disables itself (in-memory mirror keeps serving). |

Invalid values fail loud at mount.

## Design notes

- **Zero harness runtime imports** — every `@deepseek-ai/*` import is type-only, so the built bundle cannot drag a second cordis/dsh-fs module instance into the process (the module-instance split class of bugs). Config validation is hand-rolled for the same reason.
- **Evidence is advisory only** — a lost, stale, or corrupt sidecar can only cause the status quo (a re-read), never an unauthorized edit; the restore path re-verifies against the live provider every time.
- **Privacy** — sidecars record target keys (realpaths), display paths, version tokens, and timestamps only. Never file contents. Delete the directory any time; the plugin rebuilds evidence as sessions run.

Decision record: `docs/notes/2026-08-21-fs-observation-log.md` (repo root).
