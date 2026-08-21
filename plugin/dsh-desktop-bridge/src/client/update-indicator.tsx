/** Quiet periodic updater control shared by the rail and non-mac fallback. */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import {
  Button,
  IconCheckOutline16,
  IconDownloadOutline16,
  IconLoadingOutline16,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
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

/** The compact updater button rendered beside the sidebar toggle. */
export function UpdateControl(props: UpdateIndicatorProps): ReactElement | null {
  const { checkUpdate, getUpdateStatus, updateGeneration, downloadUpdate, installUpdate, t } = props
  const [status, setStatus] = useState<DesktopUpdateStatus>({ phase: 'idle' })
  const [requested, setRequested] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
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
        (found) => {
          if (mounted.current && updateGeneration() === requestGeneration) setRequested(false)
          void refreshStatus(requestGeneration, statusFromCheck(found))
        },
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

  useEffect(() => {
    if (!isUpdateBusy(status)) return
    let pending = false
    const poll = (): void => {
      if (pending) return
      pending = true
      const requestGeneration = updateGeneration()
      refreshStatus(requestGeneration).finally(() => { pending = false })
    }
    const timer = setInterval(poll, 120)
    return () => { clearInterval(timer) }
  }, [refreshStatus, status, updateGeneration])

  useEffect(() => {
    if (status.phase === 'ready') setConfirmOpen(true)
  }, [status.phase, 'version' in status ? status.version : undefined])

  const onDownload = useCallback(() => {
    if (status.phase === 'ready') {
      setConfirmOpen(true)
      return
    }
    if (isUpdateBusy(status)) return
    const target = 'version' in status ? status.version : undefined
    setRequested(true)
    setStatus(target === undefined ? { phase: 'preparing' } : { phase: 'preparing', version: target })
    void (async () => {
      try {
        if (status.phase === 'failed') {
          const found = await checkUpdate(true)
          if (found === null) {
            setRequested(false)
            setStatus({ phase: 'current' })
            await refreshStatus(updateGeneration(), { phase: 'current' })
            return
          }
        }
        const request = downloadUpdate()
        const requestGeneration = updateGeneration()
        await request
        await refreshStatus(requestGeneration)
      } catch {
        const fallback: DesktopUpdateStatus = target === undefined
          ? { phase: 'failed', message: 'Update download failed' }
          : { phase: 'failed', version: target, message: 'Update download failed' }
        await refreshStatus(updateGeneration(), fallback)
      }
    })()
  }, [checkUpdate, downloadUpdate, refreshStatus, status, updateGeneration])

  const onInstall = useCallback(() => {
    if (status.phase !== 'ready') return
    setConfirmOpen(false)
    const request = installUpdate()
    const requestGeneration = updateGeneration()
    setStatus({ phase: 'installing', version: status.version })
    request.catch(() => {
      void refreshStatus(requestGeneration, {
        phase: 'failed',
        version: status.version,
        message: 'Update install failed',
      })
    })
  }, [installUpdate, refreshStatus, status, updateGeneration])

  const visible = isUpdateIndicatorVisible(status) || (requested && status.phase === 'failed')
  if (!visible) return null

  const busy = isUpdateBusy(status)
  const percent = updatePercent(status)
  const title = status.phase === 'available'
    ? t('update.available', { version: status.version })
    : status.phase === 'downloading' && percent !== undefined
      ? t('update.progress', { percent })
      : status.phase === 'ready'
        ? t('update.ready', { version: status.version })
        : status.phase === 'failed'
          ? t('update.failed')
          : status.phase === 'installing' || status.phase === 'restarting'
            ? t('update.installing')
            : t('update.preparing')
  const icon = status.phase === 'ready'
    ? <IconCheckOutline16 />
    : busy
      ? <span data-desktop-update-spinner=""><IconLoadingOutline16 /></span>
      : <IconDownloadOutline16 />

  return (
    <>
      <style>{'@keyframes desktop-update-spin{to{transform:rotate(360deg)}}[data-desktop-update-spinner]{display:inline-flex;animation:desktop-update-spin .8s linear infinite}'}</style>
      <button
        type="button"
        data-desktop-rail-button=""
        data-desktop-update-button=""
        aria-label={title}
        aria-busy={busy}
        title={title}
        onClick={onDownload}
        disabled={busy}
        style={{
          all: 'unset',
          boxSizing: 'border-box',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '22px',
          height: '22px',
          borderRadius: '6px',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.72 : 1,
          color: 'inherit',
          pointerEvents: 'auto',
        }}
        onMouseEnter={(event) => { if (!busy) event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)' }}
        onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent' }}
      >
        {icon}
      </button>
      <Modal
        open={confirmOpen && status.phase === 'ready'}
        onClose={() => { setConfirmOpen(false) }}
        title={t('update.confirm.title')}
        closeLabel={t('update.confirm.later')}
        description={status.phase === 'ready' ? t('update.confirm.description', { version: status.version }) : ''}
        footer={(
          <>
            <Button variant="outline" size="sm" onClick={() => { setConfirmOpen(false) }}>
              {t('update.confirm.later')}
            </Button>
            <Button variant="primary" size="sm" onClick={onInstall}>
              {t('update.confirm.install')}
            </Button>
          </>
        )}
      />
    </>
  )
}

/** Non-macOS fallback where no overlay-titlebar rail exists. */
export function UpdateIndicator(props: UpdateIndicatorProps): ReactElement {
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
      <UpdateControl {...props} />
    </div>
  )
}
