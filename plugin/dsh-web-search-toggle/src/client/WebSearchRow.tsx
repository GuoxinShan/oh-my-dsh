/**
 * The General-section row for the web search toggle: the same horizontal
 * Setting-Cell anatomy as the built-in rows, with a compact credential status
 * and the control kept on the trailing edge.
 *
 * @module dsh-web-search-toggle/client/WebSearchRow
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WebSearchToggleSnapshot } from '../toggle-types.ts'
import css from './WebSearchRow.module.css'

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

// The optimistic snapshot already matches the knob, so the state text only
// swaps to "applying" when a commit outlives this window — fast commits never
// flash the label.
const PENDING_NOTICE_DELAY_MS = 300

/**
 * Render the web search toggle row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function WebSearchRow({ t, refresh, setEnabled }: WebSearchRowComponentProps) {
  const [state, setState] = useState<WebSearchRowState>({ status: 'loading' })
  const [pendingShown, setPendingShown] = useState(false)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const switchId = useId()

  useEffect(() => {
    let live = true
    void refresh().then(next => { if (live) setState(next) })
    return () => { live = false }
  }, [refresh])

  useEffect(() => () => { clearTimeout(pendingTimerRef.current) }, [])

  const commit = (enabled: boolean): void => {
    clearTimeout(pendingTimerRef.current)
    setPendingShown(false)
    setState(prev => prev.status === 'ready' && prev.snapshot !== undefined
      ? { status: 'ready', snapshot: { ...prev.snapshot, enabled }, pending: true }
      : prev)
    pendingTimerRef.current = setTimeout(() => { setPendingShown(true) }, PENDING_NOTICE_DELAY_MS)
    void setEnabled(enabled).then((next) => {
      clearTimeout(pendingTimerRef.current)
      setPendingShown(false)
      setState(next)
    })
  }

  const snap = state.snapshot
  const credentialClass = snap?.keyConfigured === true
    ? `${css.credential} ${css.credentialOk}`
    : `${css.credential} ${css.credentialMissing}`

  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('row.title')}</div>
        <div className={css.desc}>{t('row.desc')}</div>
        {state.status === 'loading' && <div className={css.state}>{t('state.loading')}</div>}
        {state.status === 'error' && (
          <div className={css.error} role="alert">{t('state.error', { message: state.error ?? '' })}</div>
        )}
        {state.status === 'ready' && snap !== undefined && (
          <div className={css.meta}>
            <span className={credentialClass}>
              <span className={css.credentialDot} aria-hidden="true" />
              {snap.keyConfigured ? t('key.configured') : t('key.missing')}
            </span>
            {!snap.keyConfigured && <span className={css.hint}>{t('key.hint')}</span>}
          </div>
        )}
      </div>
      {state.status === 'ready' && snap !== undefined && (
        <div className={css.controls}>
          <span className={css.controlState} aria-live="polite">
            <span key={state.pending === true && pendingShown ? 'pending' : snap.enabled ? 'on' : 'off'}>
              {state.pending === true && pendingShown
                ? t('state.pending')
                : snap.enabled ? t('toggle.on') : t('toggle.off')}
            </span>
          </span>
          <label className={css.switch} htmlFor={switchId}>
            <input
              id={switchId}
              type="checkbox"
              role="switch"
              aria-label={t('toggle.label')}
              checked={snap.enabled}
              disabled={state.pending === true}
              onChange={e => { commit(e.target.checked) }}
            />
            <span aria-hidden="true" />
          </label>
        </div>
      )}
    </div>
  )
}
