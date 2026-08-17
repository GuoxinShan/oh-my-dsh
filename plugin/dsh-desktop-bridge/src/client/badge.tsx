/**
 * The desktop badge, browser half: one additive shell.overlay entry proving
 * the bridge is live in the desktop shell, and offering "open this UI in the
 * system browser" (session state rides the same origin URL, so the browser
 * copy reconnects to the same host). Styles use --dsw-* semantic tokens
 * only; no literal colors.
 */
import type { ReactElement } from 'react'

/** Injected face bound in apply's closure: open a URL in the OS browser. */
export interface BadgeInjected {
  /** @param url - absolute http(s) URL to hand to the system browser. */
  openExternal: (url: string) => void
}

/**
 * The desktop pill: shows the desktop identity, hands the current origin to
 * the OS browser on click (title explains the action in Chinese product copy).
 * @param props - the injected face.
 * @returns the pill element.
 */
export function DesktopBadge(props: BadgeInjected): ReactElement {
  const { openExternal } = props
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
        title="在系统浏览器中打开当前界面"
      >
        桌面版
      </button>
    </div>
  )
}
