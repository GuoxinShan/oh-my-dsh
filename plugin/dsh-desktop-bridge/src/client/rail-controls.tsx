/**
 * The titlebar-band rail controls, browser half (macOS only): with the
 * collapsed sidebar column hidden outright and the sidebar's own logo row
 * suppressed (rail.ts), the desktop keeps exactly one sidebar toggle — a
 * persistent button in the titlebar band right of the traffic lights,
 * collapsing and expanding in both directions — plus the New Session bubble
 * that appears beside it only while collapsed (geometry, the bubble's
 * staggered slide-in, and its collapsed-only visibility are pure CSS in
 * railCss; this component carries zero state).
 */
import type { ReactElement } from 'react'
import { IconNewChatOutline16, IconPanelLeftOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

/** Injected face bound in apply's closure: the two band gestures. */
export interface RailControlsInjected {
  /** Toggle the sidebar panel both ways (ctx.layout, resolved lazily per click). */
  toggleSidebar: () => void
  /** The shared New Session action (ctx.workspaces.startSession). */
  startSession: () => void
}

/** Full rail-controls props: the injected face plus the standard locale seat. */
export type DesktopRailControlsProps = RailControlsInjected & PropsLocale<'desktop-bridge'>

/**
 * The band controls: the persistent sidebar toggle, then the collapsed-only
 * New Session bubble — the same icons the sidebar itself uses.
 * @param props - the injected face plus the locale seat.
 * @returns the controls element.
 */
export function DesktopRailControls(props: DesktopRailControlsProps): ReactElement {
  const { toggleSidebar, startSession, t } = props
  return (
    <div data-desktop-rail-controls="">
      <button
        type="button"
        aria-label={t('rail.toggle')}
        title={t('rail.toggle')}
        onClick={() => { toggleSidebar() }}
      >
        <IconPanelLeftOutline16 size={16} />
      </button>
      <button
        type="button"
        aria-label={t('rail.newSession')}
        title={t('rail.newSession')}
        onClick={() => { startSession() }}
      >
        <IconNewChatOutline16 size={16} />
      </button>
    </div>
  )
}
