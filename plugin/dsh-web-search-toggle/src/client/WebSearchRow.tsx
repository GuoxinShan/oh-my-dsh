/**
 * The General-section row for the native web_search toggle. Inline styles on
 * --dsw-* semantic tokens only (the bridge's M1 precedent: no CSS-modules
 * pipeline for a single small row). Async state is local (fetch-on-mount,
 * mcp-settings' section pattern); actions arrive through the injected face.
 *
 * @module dsh-web-search-toggle/client/WebSearchRow
 */
import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WebSearchToggleSnapshot } from '../toggle-types.ts'

/** Row render state: the snapshot plus the async wrapper states. */
export interface WebSearchRowState {
  status: 'loading' | 'ready' | 'error'
  snapshot?: WebSearchToggleSnapshot
  error?: string
  /** A set() just committed; the live composition applies it asynchronously. */
  pending?: boolean
}

/** Registration-side face: Host-backed reads and writes. */
export interface WebSearchRowInjected {
  /** Read one fresh snapshot from the Host gateway. */
  refresh: () => Promise<WebSearchRowState>
  /** Commit one toggle state and get the authoritative snapshot back. */
  setEnabled: (enabled: boolean) => Promise<WebSearchRowState>
}

/** Full component props: runtime share + locale seat + injected face. */
export type WebSearchRowComponentProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'web-search-toggle'>
  & InjectFace<WebSearchRowInjected>

const group: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '12px 0',
  borderBottom: '1px solid var(--dsw-border-subtle)',
}
const title: React.CSSProperties = { font: 'var(--dsw-text-md-medium)', color: 'var(--dsw-text-primary)' }
const desc: React.CSSProperties = { font: 'var(--dsw-text-sm-regular)', color: 'var(--dsw-text-secondary)' }
const keyLine = (ok: boolean): React.CSSProperties => ({
  font: 'var(--dsw-text-sm-regular)',
  color: ok ? 'var(--dsw-text-secondary)' : 'var(--dsw-text-warning, var(--dsw-text-secondary))',
})
const toggleLine: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '10px' }
const button = (danger: boolean): React.CSSProperties => ({
  font: 'var(--dsw-text-sm-medium)',
  color: danger ? 'var(--dsw-button-secondary-foreground, var(--dsw-text-secondary))' : 'var(--dsw-button-primary-foreground, #fff)',
  background: danger ? 'var(--dsw-button-secondary-background, transparent)' : 'var(--dsw-button-primary-background, #333)',
  border: '1px solid var(--dsw-border-subtle)',
  borderRadius: '6px',
  padding: '4px 12px',
  cursor: 'pointer',
})

/**
 * Render the web_search toggle row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function WebSearchRow({ t, refresh, setEnabled }: WebSearchRowComponentProps) {
  const [state, setState] = useState<WebSearchRowState>({ status: 'loading' })

  useEffect(() => {
    let live = true
    void refresh().then(next => { if (live) setState(next) })
    return () => { live = false }
  }, [refresh])

  const commit = (enabled: boolean): void => {
    setState(prev => prev.status === 'ready' && prev.snapshot !== undefined
      ? { status: 'ready', snapshot: { ...prev.snapshot, enabled }, pending: true }
      : prev)
    void setEnabled(enabled).then(next => setState(next))
  }

  return (
    <div style={group}>
      <div style={title}>{t('row.title')}</div>
      <div style={desc}>{t('row.desc')}</div>
      {state.status === 'loading' && <div style={desc}>{t('state.loading')}</div>}
      {state.status === 'error' && <div style={keyLine(false)}>{t('state.error', { message: state.error ?? '' })}</div>}
      {state.status === 'ready' && state.snapshot !== undefined && (
        <>
          <div style={keyLine(state.snapshot.keyConfigured)}>
            {state.snapshot.keyConfigured
              ? t('key.configured', { ref: state.snapshot.keyRef })
              : t('key.missing', { ref: state.snapshot.keyRef })}
          </div>
          <div style={toggleLine}>
            <span style={desc}>
              {state.snapshot.enabled ? t('toggle.on') : t('toggle.off')}
            </span>
            {state.pending === true
              ? <span style={desc}>{t('state.pending')}</span>
              : (
                <button
                  type="button"
                  style={button(state.snapshot.enabled)}
                  aria-pressed={state.snapshot.enabled}
                  onClick={() => { commit(!state.snapshot!.enabled) }}
                >
                  {state.snapshot.enabled ? t('toggle.action.off') : t('toggle.action.on')}
                </button>
              )}
          </div>
        </>
      )}
    </div>
  )
}
