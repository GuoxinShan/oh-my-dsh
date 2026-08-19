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

- `plugin/dsh-desktop-bridge` — original member.
- `plugin/dsh-mcp-settings` — subtree-merged from `~/workspace/dsh-mcp-settings` @ 85a1b92 (0.2.3 credentials-retry fix committed and pushed in the source repo first).
- `plugin/dsh-provider-balance` — subtree-merged from `~/workspace/dsh-provider-balance` @ 35b5879 (v0.4.0, clean tree).

Both merges preserve full history (two-parent merge commits; `git log <merge>^2` reaches the original chain). Nested `.gitignore` and `pnpm-workspace.yaml` came along, so each package stays its own isolated workspace root — the no-root-workspace rule holds mechanically, not just by convention.

Acceptance: `pnpm install` in `plugin/dsh-mcp-settings` builds `lib/` via prepare (pnpm 11 auto-switched per packageManager); scratch DSH_HOME, both plugins `plugin add`ed from the monorepo paths, `dsh web` boots with both rows in the boot graph, both `/plugins/*/client.js` serve 200, zero fiber errors in the boot log.

One anchor migrated too: dsh-mcp-settings resolves the harness checkout through a sibling `../deepseek-harness` (the old `~/workspace/deepseek-harness` symlink pointed at the fork). `scripts/setup-plugins.mjs` now creates `plugin/deepseek-harness` (gitignored) with the same `$DSH_CHECKOUT` precedence + `docs/architecture.md` validation as the bridge's `dsh` anchor, and `pnpm run plugins:check` loops `plugin/*` (skipping symlink anchors) so one command checks the whole tree — the monorepo's reason to exist.

Source repos to be archived read-only (GitHub) — the local clones stay as-is until then. Follow-ups NOT in this move: re-point the real `~/.dsh/profiles/web` deps from the old paths to `plugin/*`; loop `plugin/*` through prepare-desktop-bundle for release packaging.
