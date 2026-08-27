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
import { isElectronCutoverNotes, parseUpdateNotes } from './update-notes.ts'
import {
  isUpdateBusy, isUpdateIndicatorVisible, notesFromStatus, statusFromCheck,
  updatePercent, visibleUpdateNotes,
  type DesktopUpdaterInjected, type DesktopUpdateStatus,
} from './updates.ts'

export type UpdateIndicatorInjected = DesktopUpdaterInjected
export type UpdateIndicatorProps = UpdateIndicatorInjected & PropsLocale<'desktop-bridge'>

/** Periodic check interval (quiet background poll; 2h). */
const UPDATE_INTERVAL_MS = 2 * 60 * 60 * 1000
/** First check delay after mount, beyond the boot request burst. */
const FIRST_CHECK_DELAY_MS = 3000

/** Shared CSS for the busy spinner and the confirmation notes panel. */
const UPDATE_CONTROL_CSS = [
  '@keyframes desktop-update-spin{to{transform:rotate(360deg)}}',
  '[data-desktop-update-spinner]{display:inline-flex;animation:desktop-update-spin .8s linear infinite}',
  '@media (prefers-reduced-motion:reduce){[data-desktop-update-spinner]{animation:none}}',
  // Inline `all:unset` on this button wipes the rail sheet's no-drag; the
  // 28px drag strip then steals clicks except the bottom ~2px of the icon.
  '[data-desktop-update-button]{-webkit-app-region:no-drag!important}',
  // Modal card is a flex column; without a cap the notes flex item's
  // min-height:auto (content size) wins over max-height and shoves the
  // footer off-screen. Pin the card, let only the notes pane scroll.
  '.dsh-desktop-update-dialog{max-height:calc(100dvh - 48px)}',
  '.dsh-desktop-update-dialog-content{flex:1 1 auto;min-height:0;overflow:hidden}',
  '[data-desktop-update-notes]{margin:0;min-height:0;max-height:min(240px,36vh);overflow:auto;overscroll-behavior:contain;padding:12px 14px;border:1px solid var(--dsw-alias-border-l);border-radius:10px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);}',
  '[data-desktop-update-notes] h3{margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary));}',
  '[data-desktop-update-notes][data-empty] p{margin:0;font-size:13px;line-height:1.5;opacity:.72}',
  '[data-desktop-update-changelog]{display:flex;flex-direction:column;gap:10px;font-size:13px;line-height:1.55}',
  '[data-desktop-update-changelog] h4{margin:0;font-size:12px;font-weight:600}',
  '[data-desktop-update-changelog] p{margin:0}',
  '[data-desktop-update-changelog] ul{margin:0;padding-left:1.15em}',
  '[data-desktop-update-changelog] li{margin:0 0 4px}',
  '[data-desktop-update-changelog] li:last-child{margin:0}',
].join('')

/** The compact updater button rendered beside the sidebar toggle. */
export function UpdateControl(props: UpdateIndicatorProps): ReactElement | null {
  const { checkUpdate, getUpdateStatus, updateGeneration, downloadUpdate, installUpdate, t } = props
  const [status, setStatus] = useState<DesktopUpdateStatus>({ phase: 'idle' })
  const [requested, setRequested] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const mounted = useRef(true)
  const statusRequest = useRef(0)
  /** Notes survive preparing/downloading snapshots that omit the field. */
  const lastNotes = useRef('')
  /** One auto-download attempt per version per mount; failures stay click-to-retry. */
  const autoDownloadVersion = useRef<string | undefined>()

  const refreshStatus = useCallback(async (
    requestGeneration: number,
    fallback?: DesktopUpdateStatus,
  ): Promise<void> => {
    const sequence = ++statusRequest.current
    try {
      const snapshot = await getUpdateStatus()
      if (mounted.current && updateGeneration() === requestGeneration && statusRequest.current === sequence) {
        const incoming = visibleUpdateNotes(notesFromStatus(snapshot))
        if (incoming.length > 0) lastNotes.current = incoming
        setStatus(snapshot)
      }
    } catch {
        if (fallback !== undefined
          && mounted.current
          && updateGeneration() === requestGeneration
          && statusRequest.current === sequence) {
          const incoming = visibleUpdateNotes(notesFromStatus(fallback))
          if (incoming.length > 0) lastNotes.current = incoming
          setStatus(fallback)
        }
    }
  }, [getUpdateStatus, updateGeneration])

  const startDownload = useCallback((target?: string): void => {
    setRequested(true)
    setStatus(target === undefined ? { phase: 'preparing' } : { phase: 'preparing', version: target })
    void (async () => {
      try {
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
  }, [downloadUpdate, refreshStatus, updateGeneration])

  useEffect(() => {
    mounted.current = true
    const run = (force: boolean): void => {
      const request = checkUpdate(force)
      const requestGeneration = updateGeneration()
      request.then(
        (found) => {
          if (mounted.current && updateGeneration() === requestGeneration) setRequested(false)
          if (found !== null) {
            const incoming = visibleUpdateNotes(found.notes)
            if (incoming.length > 0) lastNotes.current = incoming
          }
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

  const availableVersion = status.phase === 'available' ? status.version : undefined
  // Discover → background download. Ready stays quiet until the user clicks.
  useEffect(() => {
    if (availableVersion === undefined) return
    if (autoDownloadVersion.current === availableVersion) return
    autoDownloadVersion.current = availableVersion
    startDownload(availableVersion)
  }, [availableVersion, startDownload])

  const onDownload = useCallback(() => {
    if (status.phase === 'ready') {
      setConfirmOpen(true)
      return
    }
    if (isUpdateBusy(status)) return
    const target = 'version' in status ? status.version : undefined
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
          autoDownloadVersion.current = found.version
          startDownload(found.version)
          return
        }
        if (target !== undefined) autoDownloadVersion.current = target
        startDownload(target)
      } catch {
        const fallback: DesktopUpdateStatus = target === undefined
          ? { phase: 'failed', message: 'Update download failed' }
          : { phase: 'failed', version: target, message: 'Update download failed' }
        await refreshStatus(updateGeneration(), fallback)
      }
    })()
  }, [checkUpdate, refreshStatus, startDownload, status, updateGeneration])

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
  const notes = visibleUpdateNotes(
    (status.phase === 'ready' ? status.notes : '') || lastNotes.current,
  )
  const cutover = isElectronCutoverNotes(notes)
  const noteBlocks = parseUpdateNotes(notes)
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
      <style>{UPDATE_CONTROL_CSS}</style>
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
        className="dsh-desktop-update-dialog"
        contentClassName="dsh-desktop-update-dialog-content"
        title={status.phase === 'ready'
          ? t(cutover ? 'update.confirm.downloadTitle' : 'update.confirm.title', { version: status.version })
          : t('update.confirm.title', { version: '' })}
        closeLabel={t('update.confirm.later')}
        description={status.phase === 'ready'
          ? t(cutover ? 'update.confirm.downloadDescription' : 'update.confirm.description', { version: status.version })
          : ''}
        footer={(
          <>
            <Button variant="outline" size="sm" onClick={() => { setConfirmOpen(false) }}>
              {t('update.confirm.later')}
            </Button>
            <Button variant="primary" size="sm" onClick={onInstall}>
              {t(cutover ? 'update.confirm.download' : 'update.confirm.install')}
            </Button>
          </>
        )}
      >
        <section
          data-desktop-update-notes=""
          data-empty={notes.length === 0 ? '' : undefined}
          aria-label={t('update.confirm.notes')}
        >
          <h3>{t('update.confirm.notes')}</h3>
          {notes.length === 0 || noteBlocks.length === 0
            ? <p>{t('update.confirm.empty')}</p>
            : (
              <div data-desktop-update-changelog="">
                {noteBlocks.map((block, index) => {
                  if (block.type === 'heading') return <h4 key={index}>{block.text}</h4>
                  if (block.type === 'list') {
                    return (
                      <ul key={index}>
                        {block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
                      </ul>
                    )
                  }
                  return <p key={index}>{block.text}</p>
                })}
              </div>
            )}
        </section>
      </Modal>
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
