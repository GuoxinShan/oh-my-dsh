/**
 * The desktop badge, browser half: one additive shell.overlay entry proving
 * the bridge is live in the desktop shell, and offering "open this UI in the
 * system browser" (session state rides the same origin URL, so the browser
 * copy reconnects to the same host). Copy arrives through the standard
 * locale seat (namespace `desktop-bridge`); styles use --dsw-* semantic
 * tokens only, no literal colors.
 */
import type { ReactElement } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

/** Injected face bound in apply's closure: open a URL in the OS browser. */
export interface BadgeInjected {
  /** @param url - absolute http(s) URL to hand to the system browser. */
  openExternal: (url: string) => void
}

/** Full badge props: the injected face plus the standard locale seat. */
export type DesktopBadgeProps = BadgeInjected & PropsLocale<'desktop-bridge'>

/**
 * The web-end pill: clicking it hands the current origin to the OS browser.
 * @param props - the injected face plus the locale seat.
 * @returns the pill element.
 */
export function DesktopBadge(props: DesktopBadgeProps): ReactElement {
  const { openExternal, t } = props
  return (
    <div style={{
      position: 'absolute',
      right: '16px',
      bottom: '16px',
      padding: '4px',
      borderRadius: '999px',
      background: 'var(--dsw-alias-bg-overlay)',
      border: '1px solid var(--dsw-alias-border-l)',
      boxShadow: '0 4px 16px var(--dsw-alias-bg-mask-drop)',
      fontSize: '12px',
      userSelect: 'none',
    }}>
      <button
        type="button"
        data-desktop-badge=""
        onClick={() => { openExternal(window.location.origin) }}
        style={{
          all: 'unset',
          cursor: 'pointer',
          padding: '4px 10px',
          borderRadius: '999px',
          color: 'var(--dsw-alias-brand-text)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        title={t('badge.openBrowser')}
      >
        {t('badge.text')}
      </button>
    </div>
  )
}
