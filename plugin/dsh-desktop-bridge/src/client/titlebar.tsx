/**
 * The titlebar drag strip, browser half. A macOS Overlay titlebar paints no
 * draggable chrome, so this inert band is the window's drag surface:
 * `data-tauri-drag-region` is Tauri 2's declarative drag marker (single
 * click drags, double click toggles maximize; the shell's capability grants
 * both window commands). Rendered as a shell.overlay entry — the overlay
 * layer spans the full app frame, so `top: 0` is exactly the band the frame
 * padding reserved (titlebar.ts).
 */
import type { ReactElement } from 'react'

import { TITLEBAR_ZONE_PX } from './titlebar.ts'

/** The drag strip: transparent visuals; only the geometry matters. */
export function DesktopDragStrip(): ReactElement {
  return (
    <div
      data-tauri-drag-region=""
      data-desktop-drag-strip=""
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: TITLEBAR_ZONE_PX }}
    />
  )
}
