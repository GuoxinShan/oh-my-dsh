/**
 * Runtime surface switch, browser half: right-clicking the sidebar brand area
 * (the whale mark or the Oh My DSH wordmark) opens the shell's native surface
 * menu. The shell owns the whole flow from there (picker → validation →
 * confirm → sidecar restart → window reload); this file only detects the
 * gesture and fires the command.
 *
 * Anchors are the documented slot seams (`[data-slot="sidebar.brand.mark"]` /
 * `[data-slot="sidebar.brand.name"]`), not stock CSS-module classes. The mark
 * slot always renders (its fallback whale ships with ui-sidebar), so the
 * gesture works with or without dsh-branding; a shell too old for the command
 * logs one warning per click and otherwise stays invisible.
 */
import type { DesktopInvoke } from './env.ts'

/** IPC command that opens the shell's native surface menu. */
export const SURFACE_SWITCH_COMMAND = 'dsh_desktop_switch_surface'

const BRAND_SELECTOR = '[data-slot="sidebar.brand.mark"], [data-slot="sidebar.brand.name"]'

/** True when the contextmenu target sits inside either brand slot wrapper. */
export function isBrandArea(target: unknown): boolean {
  if (target === null || typeof (target as Element).closest !== 'function') return false
  return (target as Element).closest(BRAND_SELECTOR) !== null
}

interface WarnLog {
  warn(message: string): void
}

/**
 * Capture-phase contextmenu listener on the document; a brand-area
 * right-click is ours, everything else passes through.
 * @param doc - the document to listen on (injected for tests).
 * @param invoke - the shell IPC carrier.
 * @param logger - warning sink for rejected invokes.
 * @returns the disposer removing the listener.
 */
export function installSurfaceMenu(doc: Document, invoke: DesktopInvoke, logger: WarnLog): () => void {
  const onContextMenu = (event: MouseEvent): void => {
    if (event.defaultPrevented) return
    if (!isBrandArea(event.target)) return
    event.preventDefault()
    invoke.invoke(SURFACE_SWITCH_COMMAND).catch((error: unknown) => {
      logger.warn(`dsh-desktop-bridge: surface menu invoke failed: ${String(error)}`)
    })
  }
  doc.addEventListener('contextmenu', onContextMenu, true)
  return () => { doc.removeEventListener('contextmenu', onContextMenu, true) }
}
