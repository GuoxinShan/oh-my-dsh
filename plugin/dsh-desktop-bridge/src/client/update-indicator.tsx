/** Quiet title-band updater entry with shared shell progress. */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { IconDownloadOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  isUpdateBusy, isUpdateIndicatorVisible, statusFromCheck, updatePercent,
  type DesktopUpdaterInjected, type DesktopUpdateStatus,
} from './updates.ts'

export type UpdateIndicatorInjected = DesktopUpdaterInjected
export type UpdateIndicatorProps = UpdateIndicatorInjected & PropsLocale<'desktop-bridge'>

/** Periodic check interval (quiet background poll; 2h). */
const UPDATE_INTERVAL_MS = 2 * 60 * 60 * 1000
/** First check delay after mount, beyond the boot request burst. */
const FIRST_CHECK_DELAY_MS = 3000

/** Top-right affordance: absent while current, compact live progress on update. */
export function UpdateIndicator(props: UpdateIndicatorProps): ReactElement | null {
  const { checkUpdate, getUpdateStatus, updateGeneration, applyUpdate, t } = props
  const [status, setStatus] = useState<DesktopUpdateStatus>({ phase: 'idle' })
  const mounted = useRef(true)
  const statusRequest = useRef(0)

  const refreshStatus = useCallback(async (
    requestGeneration: number,
    fallback?: DesktopUpdateStatus,
  ): Promise<void> => {
    const sequence = ++statusRequest.current
    try {
      const snapshot = await getUpdateStatus()
      if (mounted.current && updateGeneration() === requestGeneration && statusRequest.current === sequence) {
        setStatus(snapshot)
      }
    } catch {
      if (fallback !== undefined
        && mounted.current
        && updateGeneration() === requestGeneration
        && statusRequest.current === sequence) {
        setStatus(fallback)
      }
    }
  }, [getUpdateStatus, updateGeneration])

  useEffect(() => {
    mounted.current = true
    const run = (force: boolean): void => {
      const request = checkUpdate(force)
      const requestGeneration = updateGeneration()
      request.then(
        (found) => { void refreshStatus(requestGeneration, statusFromCheck(found)) },
        () => { void refreshStatus(requestGeneration) },
      )
    }
    void refreshStatus(updateGeneration())
    const first = setTimeout(() => { run(false) }, FIRST_CHECK_DELAY_MS)
    const interval = setInterval(() => { run(true) }, UPDATE_INTERVAL_MS)
    return () => {
      mounted.current = false
      clearTimeout(first)
      clearInterval(interval)
    }
  }, [checkUpdate, refreshStatus, updateGeneration])

  // Available polls slowly so an About-initiated update is reflected here;
  // active phases poll at UI cadence for live byte progress.
  useEffect(() => {
    if (status.phase !== 'available' && !isUpdateBusy(status)) return
    let pending = false
    const poll = (): void => {
      if (pending) return
      pending = true
      const requestGeneration = updateGeneration()
      refreshStatus(requestGeneration).finally(() => { pending = false })
    }
    const timer = setInterval(poll, isUpdateBusy(status) ? 120 : 750)
    return () => { clearInterval(timer) }
  }, [refreshStatus, status, updateGeneration])

  const onApply = useCallback(() => {
    if (status.phase !== 'available') return
    const request = applyUpdate()
    const requestGeneration = updateGeneration()
    setStatus({ phase: 'preparing', version: status.version })
    request.catch(() => { void refreshStatus(requestGeneration) })
  }, [applyUpdate, refreshStatus, status, updateGeneration])

  if (!isUpdateIndicatorVisible(status)) return null

  const busy = isUpdateBusy(status)
  const percent = updatePercent(status)
  const title = status.phase === 'available'
    ? t('update.indicator.available', { version: status.version })
    : status.phase === 'downloading' && percent !== undefined
      ? t('update.indicator.progress', { percent })
      : t('update.indicator.applying')

  return (
    <div
      data-desktop-update-indicator=""
      style={{
        position: 'absolute',
        top: '8px',
        right: '14px',
        height: '22px',
        display: 'flex',
        alignItems: 'center',
        zIndex: 1,
        color: 'var(--dsw-alias-label-primary)',
        pointerEvents: 'none',
      }}
    >
      <button
        type="button"
        data-desktop-update-button=""
        aria-label={title}
        title={title}
        onClick={onApply}
        disabled={busy}
        style={{
          all: 'unset',
          boxSizing: 'border-box',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          minWidth: '22px',
          height: '22px',
          padding: percent === undefined ? 0 : '0 6px',
          borderRadius: '6px',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy && percent === undefined ? 0.55 : 1,
          color: 'inherit',
          pointerEvents: 'auto',
          fontSize: '11px',
          lineHeight: '16px',
          fontVariantNumeric: 'tabular-nums',
        }}
        onMouseEnter={(event) => { if (!busy) event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)' }}
        onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent' }}
      >
        <IconDownloadOutline16 />
        {percent === undefined ? null : <span>{percent}%</span>}
      </button>
    </div>
  )
}
