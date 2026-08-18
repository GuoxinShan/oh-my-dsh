# 2026-08-18 — App icon size retune (full-bleed → user-calibrated 874/1024)

## Problem

The icon shipped by `4d10645` drew its squircle full-bleed
(`0,0 1024x1024 rx=255`): zero transparent margin. macOS renders `.icns`
as-is — unlike iOS it never re-fits icons to a standard grid — so in the
Dock the artwork occupied the whole slot while every neighboring app kept
the Apple HIG safe area (824x824 on the 1024 grid). Net effect: our icon
looked ~24% larger than everything around it.

## Decision

Final geometry, calibrated live against the Dock with the user:

- shape: `874x874` centered (`x=75 y=75`), `rx=196` — between the HIG 824
  (judged too small) and the 924 midpoint (judged too large);
- whale glyph: scaled by `874/1024` about the canvas center
  (`translate(285,285) scale(9.081)`), preserving the original 52%
  glyph-to-shape proportion from `4d10645`.

`icon-src.svg` remains the single source of truth; every derived file in
`src-tauri/icons/` is regenerated, never hand-edited.

## Regeneration workflow (reusable for future retunes)

```sh
# 1. edit src-tauri/icons/icon-src.svg
# 2. rasterize at 1024 with alpha (Blink renders SVG faithfully; magick's
#    internal MSVG renderer does not):
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --screenshot=/tmp/icon.png --window-size=1024,1024 \
  --default-background-color=00000000 \
  "file://$PWD/src-tauri/icons/icon-src.svg"
# 3. refresh master + all variants (icns/ico/pngs/ios/android):
cp /tmp/icon.png src-tauri/icons/app-icon.png
pnpm tauri icon src-tauri/icons/app-icon.png
# 4. force the running dev shell to re-embed (see gotcha below):
touch src-tauri/tauri.conf.json
```

## Gotcha: icon changes alone do not re-embed under `tauri dev`

Tauri embeds the app icon at macro-expansion time (`tauri::generate_context!`
reads `bundle.icon` during codegen). Observed tonight: regenerating the icon
files made `tauri dev` relaunch the shell but cargo stayed `fresh` — the
relaunched binary still carried the *previous* icon. Touching
`src-tauri/tauri.conf.json` (a declared codegen input) forces the build
script to re-run and the new icon to be linked in. So the loop is:
regenerate icons → touch config → wait for rebuild+relaunch → check Dock.

## Cleanup

The size iterations triggered five `tauri dev` rebuilds; per the known
dev-loop issue (watcher SIGKILLs the shell before sidecar reaping), each
left an orphan sidecar holding a random loopback port against the shared
`~/.dsh`. Nine orphans (PPID 1, spawn span 20:49–21:16) were SIGTERMed
after verifying none served the terminal GUI's 3080 listener.
