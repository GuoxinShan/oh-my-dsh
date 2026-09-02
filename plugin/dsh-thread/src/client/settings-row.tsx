import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import React from 'react'
import type { ThreadEnabledStore } from './enabled.ts'

/** Injected face for the General-section Thread row: the switch state and its write. */
export interface ThreadSettingsRowInjected {
  threadEnabled: ThreadEnabledStore
  setThreadEnabled(enabled: boolean): void
}

export type ThreadSettingsRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'dsh-thread'>
  & ThreadSettingsRowInjected

/**
 * Setting-row styles in the shared General-row vocabulary (dsh-web-search-toggle
 * lineage: 32×18 switch, inset-hairline off state, state-business-primary on,
 * keyed state text). Carried as a string and injected through the same
 * style-tag effect as THREAD_SIDEBAR_CSS — this package's established pattern,
 * which keeps the client build free of the lightningcss pipeline.
 */
export const THREAD_SETTINGS_ROW_CSS = `
.thsr-row{display:flex;align-items:center;gap:8px;padding:16px 0;border-bottom:1px solid var(--dsw-alias-border-l2);}
.thsr-text{display:flex;flex:1;flex-direction:column;gap:4px;min-width:0;padding-right:48px;}
.thsr-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px;}
.thsr-desc{font-size:12px;font-weight:400;line-height:18px;color:var(--dsw-alias-label-tertiary);}
.thsr-controls{display:flex;flex:none;align-items:center;justify-content:flex-end;gap:10px;min-width:112px;}
.thsr-state{min-width:58px;color:var(--dsw-alias-label-tertiary);text-align:right;font-size:12px;font-weight:400;line-height:18px;}
.thsr-state>span{display:inline-block;animation:thsr-state-in 150ms ease;}
@keyframes thsr-state-in{from{opacity:0;}}
.thsr-switch{position:relative;display:inline-flex;flex:none;width:32px;height:18px;cursor:pointer;user-select:none;}
.thsr-switch input{position:absolute;width:1px;height:1px;opacity:0;}
.thsr-switch span{width:100%;border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l1);transition:background 120ms ease,opacity 120ms ease;}
.thsr-switch span::after{content:'';position:absolute;top:3px;left:3px;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-label-primary);transition:transform 120ms ease;}
.thsr-switch input:checked+span{background:var(--dsw-alias-state-business-primary);}
.thsr-switch input:checked+span::after{transform:translateX(14px);}
.thsr-switch input:focus-visible+span{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px;}
.thsr-switch input:disabled+span{cursor:wait;opacity:0.55;}
@media (prefers-reduced-motion:reduce){.thsr-state>span{animation:none;}}
@media (max-width:600px){.thsr-text{padding-right:16px;}.thsr-state{display:none;}.thsr-controls{min-width:auto;}}
`

// The optimistic snapshot already matches the knob, so the state text only
// swaps to "applying" when a commit outlives this window — fast commits never
// flash the pending label (dsh-web-search-toggle lineage).
const PENDING_NOTICE_DELAY_MS = 300

/**
 * The General settings row owning the Thread master switch. Writes go through
 * the settings scope's serialized path; the shown state is optimistic until
 * the mirror folds the committed value back.
 */
export function ThreadSettingsRow(props: ThreadSettingsRowProps): React.ReactElement {
  const enabled = React.useSyncExternalStore(
    listener => props.threadEnabled.subscribe(listener),
    props.threadEnabled.getSnapshot,
    props.threadEnabled.getSnapshot,
  )
  // Optimistic target while a commit is in flight; cleared when the mirror
  // folds the committed value back (or by the failsafe below).
  const [optimistic, setOptimistic] = React.useState<boolean | null>(null)
  const [pendingShown, setPendingShown] = React.useState(false)
  const pendingTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const failsafeTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  React.useEffect(() => () => {
    clearTimeout(pendingTimerRef.current)
    clearTimeout(failsafeTimerRef.current)
  }, [])

  React.useEffect(() => {
    // Fold-back: the mirror caught up with the optimistic target.
    if (optimistic !== null && optimistic === enabled) {
      clearTimeout(pendingTimerRef.current)
      clearTimeout(failsafeTimerRef.current)
      setPendingShown(false)
      setOptimistic(null)
    }
  }, [optimistic, enabled])

  const commit = (target: boolean): void => {
    clearTimeout(pendingTimerRef.current)
    clearTimeout(failsafeTimerRef.current)
    setOptimistic(target)
    setPendingShown(false)
    pendingTimerRef.current = setTimeout(() => setPendingShown(true), PENDING_NOTICE_DELAY_MS)
    // Failsafe: never let a lost write wedge the row in its optimistic state.
    failsafeTimerRef.current = setTimeout(() => {
      setPendingShown(false)
      setOptimistic(null)
    }, 5000)
    props.setThreadEnabled(target)
  }

  const shown = optimistic ?? enabled
  const switchId = React.useId()

  return (
    <div className="thsr-row">
      <div className="thsr-text">
        <div className="thsr-title">{props.t('row.title')}</div>
        <div className="thsr-desc">{props.t('row.desc')}</div>
      </div>
      <div className="thsr-controls">
        <span className="thsr-state" aria-live="polite">
          <span key={pendingShown ? 'pending' : shown ? 'on' : 'off'}>
            {pendingShown ? props.t('state.pending') : shown ? props.t('toggle.on') : props.t('toggle.off')}
          </span>
        </span>
        <label className="thsr-switch" htmlFor={switchId}>
          <input
            id={switchId}
            type="checkbox"
            role="switch"
            aria-label={props.t('toggle.label')}
            checked={shown}
            disabled={optimistic !== null}
            onChange={(e) => { commit(e.target.checked) }}
          />
          <span aria-hidden="true" />
        </label>
      </div>
    </div>
  )
}
