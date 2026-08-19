# 2026-08-18 — Edge-to-edge titlebar: hidden painted title + column insets

## Problem

The fused macOS titlebar still showed "DeepSeek Harness" in the floating
band, and the bridge's frame-level 28px padding pushed ALL three column
surfaces below the band — leaving a blank system-colored strip under the
traffic lights. The page visibly sat "inside" a system frame instead of
being the window.

## Root cause 1: Overlay still paints the title

Tauri's `TitleBarStyle::Overlay` maps to exactly two AppKit calls (verified
in tauri-utils 2.9.3 / tao 0.35.3 sources): `fullSizeContentView` +
`titlebarAppearsTransparent`. The title STRING still draws into the
transparent band ("The color of the window title depends on the system
theme" — the enum's own docs). The previous note's "no title text is
painted" claim was wrong.

Fix: `hide_painted_title()` in the shell calls
`NSWindowTitleVisibility::Hidden` right after window build (main thread),
via objc2-app-kit — already in the dependency tree through tao/wry, so the
direct reference adds no compile cost. Hidden paints nothing but keeps the
string readable by Mission Control / the Window menu (unlike `.title("")`,
which empties those surfaces too). We keep `.title("DeepSeek Harness")`.

## Root cause 2: padding the frame ≠ padding the content

`div:has(> [data-shell-overlay]) { padding-top: 28px }` moved the grid
container's content edge down; the columns (and their background fills —
sidebar fill, base bg) started below the band. What a native mac fused
titlebar actually looks like: surfaces run edge to edge under the lights,
only content clears them.

Fix: pad the columns, not the frame —

```
div:has(> [data-shell-overlay]) > div:nth-child(-n+3) { padding-top: 28px }
```

The frame's first three element children are AppFrame's sidebar/center/
details columns (AppFrame.tsx render order; overlay layer is a later
sibling). Each column paints from the window's top edge; each column's
content starts 28px down. The sidebar's own `--dsw-specific-sidebar-fill`
now runs under the traffic lights, its logo row sits below the band, and
the drag strip (unchanged, overlay layer spans the full frame) fills the
band.

## Notes and edges

- The selector is coupled to AppFrame's structure (three columns as the
  first three children). A ui-layout refactor that reorders or wraps them
  must update `titlebarCss` — recorded in AGENTS.md's fusion bullet.
- `setContentTopInset` (the truly native inset, which also routes native
  scrolling correctly) was considered and rejected: it would inset the
  WKWebView itself, re-creating exactly the empty band we are removing.
- `setTitleVisibility` is a safe method in objc2-app-kit 0.3.2 (the first
  `unsafe {}` wrapper tripped `unused_unsafe`; only the pointer cast is
  unsafe).
- Screenshot verification was blocked by missing Screen Recording /
  Accessibility grants in this session; verification was e2e
  (DSH_E2E_OK, exit 0 — gate → app-root → badge DOM → save_file IPC) plus
  the rebuilt bundle grep for the new selector, plus live inspection of
  the running window.

## Verification

- Bridge: `pnpm check` green (typecheck, tests incl. the updated selector
  assertions, build).
- Shell: `cargo check` + `cargo test` green; `DSH_E2E_PROBE=1
  DSH_E2E_EXIT=1 pnpm desktop:dev` → `DSH_E2E_OK`, exit 0; no orphan
  sidecar afterwards.
