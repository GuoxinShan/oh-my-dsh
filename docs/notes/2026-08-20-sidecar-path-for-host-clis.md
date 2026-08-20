# Sidecar PATH: host CLIs from a GUI .app

## Context

Installed `dsh-desktop.app` (and any Finder/Dock launch) inherits a minimal macOS GUI PATH that typically omits `/opt/homebrew/bin`. The harness sidecar inherits that environment. Out-of-tree plugins that `spawn("yzj-cli")` (dsh-yzj bridge) then fail with `spawn yzj-cli ENOENT` even when the same binary works in Terminal.

## Decision

Enrich PATH in `cli_command` for every harness/plugin CLI spawn: runtime tool bins first, then well-known user CLI directories that exist on disk (Homebrew, `/usr/local/bin`, `~/.local/bin`, `~/.bun/bin`, `~/.cargo/bin`, …), then the inherited PATH, de-duplicated. No shell login profile evaluation — deterministic and fast.

Do not bake absolute `yzj-cli` into the shell; the shell stays plugin-agnostic and only fixes the process environment contract.

## Rejected

- Resolving `yzj-cli` inside the desktop shell: couples the shell to one plugin.
- Running `path_helper` / login shell on every boot: slow and fragile under sandboxing.
