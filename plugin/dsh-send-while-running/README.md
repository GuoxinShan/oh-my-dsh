# dsh-send-while-running

Browser-only DSH web plugin: while an ordinary session's agent turn is
running and the composer draft has content (text or images), an extra
**Send** button appears at the composer's bottom-right — left of the stock
**Stop** button. When the turn stops (or the draft is empty) the button
disappears and the composer returns to the shipped single-button layout.
Additionally the Stop button is recolored **danger-red in every state**
(toned down per theme), so the destructive action always reads apart from
the blue Send at a glance. No harness source is modified: everything rides
one additive `conversation.input.right` list-seat entry declared by
ui-conversation plus a seam-anchored stylesheet.

## Behavior

- Visible exactly when `session.running && session.subagent === null
  && !session.removed` and the draft is non-blank or holds at least one
  image — the same state in which the stock primary button has flipped to
  Stop (`primaryStops`), leaving pointer users no visible send affordance.
- Clicking goes through the session standard kit's `inputActions.submit()`
  — the identical public path the stock Send button takes: the message is
  queued into the running turn (queue delivery; the keyboard-only
  busy-Enter preference is a gesture policy and does not apply to button
  presses).
- Continuable child sessions are excluded from the twin (they already keep
  Send as the primary with an independent Stop beside it) — but the red
  Stop recolor still applies there (the subagent Stop is the same glyph).
- Disabled during the input machine's admission phases
  (`adjudicating`/`submitting`), mirroring the stock button's
  `machineBusy` term.
- Locale-aware label (`发送消息` / `Send message`) via the plugin's own
  `send-while-running` dictionary namespace.

## Stop recolor (0.1.1)

The stock primary swaps its GLYPH when it flips Send→Stop (arrow =
`<path>`, stop = `<rect>`), so the stylesheet recolors
`button:has(> svg > rect)` inside the composer trailing row — pure CSS
that follows the stock state machine for free, in every state (running
with or without draft, subagent Stop), and never touches the blue Send.
One shade softer than the theme error-primary fill after visual review:
light theme red-500 (coral) base / red-400 hover; dark theme red-400 base
with a brightness-step hover (the static red scale has no shade between
400 and the near-white 100).

## Install

```sh
dsh plugin --profile web add <repo>/plugin/dsh-send-while-running
```

The bundle patch mounts the `dsh-send-while-running` row for every profile
that installs this plugin. Terminal `dsh web`, plain browsers, and the
desktop shell all get the same composer (no desktop gate).

## Client half

`lib/client.js` is the ModuleLoader closure artifact
(`window.__ModuleLoader__.load`) with platform modules externalized — the
build contract lives in this package's `tsdown.config.ts`; keep
`CLIENT_EXTERNALS` in sync with the harness `PLATFORM_MODULES` baseline
when it moves. Zero `@deepseek-ai/*` value imports: the ui-conversation and
locale packages appear only as type-only imports (erased at build), so no
runtime peer linkage is needed.

## Layout anchoring

The button styles itself as the stock primary's twin (34px info-fill
circle, mirrored up-arrow glyph, −2px optical lift) and is positioned
through documented seams only: the render machinery's
`[data-slot="conversation.input.right"]` anchor plus
`div:has(...) > button:last-of-type` for the stock primary. The `:has()`
rule applies `order: 2` to the stock primary only while the Send twin is
mounted, so every other state keeps the shipped layout untouched. No stock
CSS-module class names are referenced (module-hash renames cannot break
it); known edges: the `button:last-of-type` anchor assumes the stock
primary stays the last direct button child of the composer's trailing row,
and the recolor's `svg > rect` anchor assumes the stop glyph stays a rect
while the send glyph stays a path (ui-conversation structure changes need
these selectors re-checked).

## Config

None — visibility is fully derived from the slot's owner share; there is
nothing to configure.

## Design notes

- Decision record: `docs/notes/2026-08-22-dsh-send-while-running.md` (repo root).
- Contracts live in the repo root `AGENTS.md` (plugin monorepo rules, npm
  dependency discipline, client bundle build contract).
