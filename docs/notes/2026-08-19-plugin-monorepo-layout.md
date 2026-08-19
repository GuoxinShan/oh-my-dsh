# 2026-08-19 — plugin monorepo layout

This repo is the single home for out-of-tree DSH plugins and the Tauri desktop shell. Plugins and the desktop release independently from one checkout.

## Why not dataelement/dsh-desktop

[dataelement/dsh-desktop](https://github.com/dataelement/dsh-desktop) is an Electron shell that pins `@deepseek-ai/dsh@0.1.0-rc.6` from npm and reapplies UI/host changes with `patch-package` under `patches/`. There is no `plugin/` tree. Custom behaviour (model-provider onboarding, sidebar brand, layout geometry, preset transfer) lives as diffs against minified `window.__ModuleLoader__.load({...})` payloads.

That model is the opposite of ours:

- We already rejected in-tree harness forks for row-level UI (the `settings.models.provider` slot was reverted; provider-balance is DOM injection).
- `patch-package` on a pinned rc dies on every upstream bump; out-of-tree plugins bump against public events/slots/services.
- Their `patches/` cannot be `dsh plugin add`'d, tagged, or used from terminal `dsh web`. Ours must.

Take from them only the process-orchestration idea (spawn harness, random loopback, readiness). Do not copy their layout.

## The standard

Recorded in root `AGENTS.md` 「插件 monorepo 规范」. Short form:

| Rule | Value |
|---|---|
| Path | `plugin/<package.json name>/` |
| Install unit | one directory = one `dsh plugin add` |
| Tags | desktop `desktop/v*`; plugin `plugin/<name>/v*` |
| Publish | git tags, not npm (same as the runtime) |
| Incoming repos | `git subtree`, dirty work committed first |
| Workspace | not on day one (pnpm 10 vs 11) |
| Bridge | never a container for other plugins |
| Notes | `docs/notes/` at repo root |

Rejected placements: repo root next to `src-tauri/`; nested `plugin/packages/`; inside `dsh-desktop-bridge`; the harness fork's `packages/`; a second `dsh-plugins` repo (would duplicate the shell's `bridge.tar.gz` / `plugin add` chain).

## First members

Already here: `plugin/dsh-desktop-bridge`.

To migrate (subtree, not copy):

- `~/workspace/dsh-mcp-settings` → `plugin/dsh-mcp-settings` (commit 0.2.3 first)
- `~/workspace/dsh-provider-balance` → `plugin/dsh-provider-balance` (v0.4.0 is clean)

Shell packaging still special-cases the bridge tarball. Looping `plugin/*` into prepare/`plugin add` is a follow-up, not part of the move.
