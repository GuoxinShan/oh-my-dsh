/**
 * The titlebar-band rail controls, browser half (macOS only): with the
 * collapsed sidebar column hidden outright and the sidebar's native toggle
 * suppressed (rail.ts), the desktop keeps exactly one sidebar toggle — a
 * persistent button in the titlebar band right of the traffic lights,
 * collapsing and expanding in both directions. The quiet updater appears
 * beside it only when a release is available or active, followed by the New
 * Session bubble that appears only while collapsed.
 */
import type { ReactElement } from 'react'
import { IconNewChatOutline16, IconPanelLeftOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { UpdateControl } from './update-indicator.tsx'
import type { DesktopUpdaterInjected } from './updates.ts'

/** Injected face bound in apply's closure: band gestures plus the updater. */
export interface RailControlsInjected extends DesktopUpdaterInjected {
  /** Toggle the sidebar panel both ways (ctx.layout, resolved lazily per click). */
  toggleSidebar: () => void
  /** The shared New Session action (ctx.workspaces.startSession). */
  startSession: () => void
}

/** Full rail-controls props: the injected face plus the standard locale seat. */
export type DesktopRailControlsProps = RailControlsInjected & PropsLocale<'desktop-bridge'>

/**
 * The band controls: sidebar toggle, conditional updater, then the
 * collapsed-only New Session bubble.
 * @param props - the injected face plus the locale seat.
 * @returns the controls element.
 */
export function DesktopRailControls(props: DesktopRailControlsProps): ReactElement {
  const { toggleSidebar, startSession, t } = props
  return (
    <div data-desktop-rail-controls="">
      <button
        type="button"
        data-desktop-rail-button=""
        aria-label={t('rail.toggle')}
        title={t('rail.toggle')}
        onClick={() => { toggleSidebar() }}
      >
        <IconPanelLeftOutline16 size={16} />
      </button>
      <UpdateControl {...props} />
      <button
        type="button"
        data-desktop-rail-button=""
        data-desktop-new-session=""
        aria-label={t('rail.newSession')}
        title={t('rail.newSession')}
        onClick={() => { startSession() }}
      >
        <IconNewChatOutline16 size={16} />
      </button>
    </div>
  )
}
