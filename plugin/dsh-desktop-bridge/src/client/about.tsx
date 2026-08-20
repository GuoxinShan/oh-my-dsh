/** Desktop About settings page with shared updater progress. */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import {
  Button, IconDownloadOutline16, IconRefreshOutline16, StateDot, type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  formatBytes, isUpdateBusy, statusFromCheck, updatePercent,
  type DesktopUpdaterInjected, type DesktopUpdateStatus, type DesktopVersionInfo,
} from './updates.ts'

/** About-only IPC plus the updater faces shared with the title-band entry. */
export interface AboutInjected extends DesktopUpdaterInjected {
  versionInfo: () => Promise<DesktopVersionInfo>
}

export type AboutSectionProps = AboutInjected & PropsLocale<'desktop-bridge'>
type Translate = PropsLocale<'desktop-bridge'>['t']

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '28px',
  width: '100%',
  maxWidth: '720px',
  color: 'var(--dsw-alias-label-primary)',
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '18px',
  lineHeight: '26px',
  fontWeight: 500,
  letterSpacing: 0,
}

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '14px',
  lineHeight: '22px',
  fontWeight: 500,
  letterSpacing: 0,
}

const versionRowsStyle: CSSProperties = {
  borderTop: '1px solid var(--dsw-alias-border-l2)',
}

const versionRowStyle: CSSProperties = {
  minHeight: '44px',
  display: 'grid',
  gridTemplateColumns: 'minmax(140px, 1fr) minmax(0, 2fr)',
  alignItems: 'center',
  gap: '20px',
  borderBottom: '1px solid var(--dsw-alias-border-l2)',
  fontSize: '13px',
  lineHeight: '20px',
}

function statusDot(status: DesktopUpdateStatus): StateDotState {
  if (status.phase === 'failed') return 'error'
  if (status.phase === 'current') return 'done'
  if (status.phase === 'available') return 'warning'
  return 'ongoing'
}

function statusText(t: Translate, status: DesktopUpdateStatus): string {
  switch (status.phase) {
    case 'idle': return t('about.status.idle')
    case 'checking': return t('about.status.checking')
    case 'current': return t('about.status.current')
    case 'available': return t('about.status.available', { version: status.version })
    case 'preparing': return t('about.status.preparing')
    case 'downloading': return t('about.status.downloading', { version: status.version })
    case 'installing': return t('about.status.installing')
    case 'restarting': return t('about.status.restarting')
    case 'failed': return t('about.status.failed')
  }
}

function VersionRow({ label, value, title }: { label: string; value: string; title?: string }): ReactElement {
  return (
    <div style={versionRowStyle}>
      <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{label}</span>
      <span
        title={title}
        style={{ color: 'var(--dsw-alias-label-primary)', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
    </div>
  )
}

/** Settings section showing build identity and the complete update flow. */
export function AboutSection(props: AboutSectionProps): ReactElement {
  const { versionInfo, checkUpdate, getUpdateStatus, updateGeneration, applyUpdate, t } = props
  const [info, setInfo] = useState<DesktopVersionInfo>()
  const [status, setStatus] = useState<DesktopUpdateStatus>({ phase: 'idle' })
  const mounted = useRef(true)
  const statusRequest = useRef(0)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const refreshStatus = useCallback(async (
    requestGeneration: number,
    fallback?: DesktopUpdateStatus,
  ): Promise<DesktopUpdateStatus | undefined> => {
    const sequence = ++statusRequest.current
    try {
      const snapshot = await getUpdateStatus()
      if (!mounted.current || updateGeneration() !== requestGeneration || statusRequest.current !== sequence) return undefined
      setStatus(snapshot)
      return snapshot
    } catch {
      if (fallback !== undefined
        && mounted.current
        && updateGeneration() === requestGeneration
        && statusRequest.current === sequence) {
        setStatus(fallback)
        return fallback
      }
      return undefined
    }
  }, [getUpdateStatus, updateGeneration])

  const runCheck = useCallback((force: boolean) => {
    setStatus({ phase: 'checking' })
    const request = checkUpdate(force)
    const requestGeneration = updateGeneration()
    request.then(
      (found) => { void refreshStatus(requestGeneration, statusFromCheck(found)) },
      (error: unknown) => {
        void refreshStatus(requestGeneration, { phase: 'failed', message: String(error) })
      },
    )
  }, [checkUpdate, refreshStatus, updateGeneration])

  useEffect(() => {
    versionInfo().then(
      (value) => { if (mounted.current) setInfo(value) },
      () => undefined,
    )
    const requestGeneration = updateGeneration()
    void refreshStatus(requestGeneration).then((snapshot) => {
      if (snapshot?.phase === 'idle') runCheck(false)
    })
  }, [refreshStatus, runCheck, updateGeneration, versionInfo])

  // Poll only while the updater is active, or while an available release may
  // be started from the title-band entry. Idle/current desktops stay quiet.
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
    const version = 'version' in status ? status.version : undefined
    const request = applyUpdate()
    const requestGeneration = updateGeneration()
    setStatus(version === undefined ? { phase: 'preparing' } : { phase: 'preparing', version })
    request.catch((error: unknown) => {
      void refreshStatus(requestGeneration, { phase: 'failed', message: String(error) })
    })
  }, [applyUpdate, refreshStatus, status, updateGeneration])

  const percent = updatePercent(status)
  const progressCopy = status.phase === 'downloading'
    ? status.total === undefined
      ? formatBytes(status.downloaded)
      : `${formatBytes(status.downloaded)} / ${formatBytes(status.total)}${percent === undefined ? '' : ` · ${percent}%`}`
    : undefined

  const renderAction = (): ReactElement | null => {
    if (status.phase === 'available') {
      return (
        <Button variant="primary" icon={<IconDownloadOutline16 />} onClick={onApply}>
          {t('about.updateRestart')}
        </Button>
      )
    }
    if (status.phase === 'idle' || status.phase === 'current' || status.phase === 'failed') {
      return (
        <Button variant="outline" icon={<IconRefreshOutline16 />} onClick={() => { runCheck(true) }}>
          {status.phase === 'failed' ? t('about.retry') : t('about.check')}
        </Button>
      )
    }
    if (status.phase === 'checking') {
      return <Button variant="outline" disabled>{t('about.checking')}</Button>
    }
    return null
  }

  return (
    <div style={pageStyle} data-desktop-about="">
      <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h2 style={titleStyle}>dsh-desktop</h2>
        <div style={versionRowsStyle}>
          <VersionRow label={t('about.desktopVersion')} value={`v${info?.desktopVersion ?? '…'}`} />
          <VersionRow label={t('about.runtimeVersion')} value={info?.runtimeVersion ?? '…'} />
          <VersionRow
            label={t('about.runtimeCommit')}
            value={info?.runtimeSha === undefined ? '…' : info.runtimeSha.slice(0, 12)}
            title={info?.runtimeSha}
          />
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <h3 style={sectionTitleStyle}>{t('about.updates')}</h3>
          {renderAction()}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '22px' }}>
          <StateDot state={statusDot(status)} />
          <span style={{ fontSize: '13px', lineHeight: '20px' }}>{statusText(t, status)}</span>
        </div>

        {status.phase === 'downloading' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              {...percent === undefined ? {} : { 'aria-valuenow': percent }}
              style={{ height: '6px', overflow: 'hidden', borderRadius: '3px', background: 'var(--dsw-alias-bg-skeleton)' }}
            >
              <div style={{
                width: percent === undefined ? '18%' : `${percent}%`,
                height: '100%',
                borderRadius: '3px',
                background: 'var(--dsw-alias-button-primary-fill)',
                transition: 'width 120ms linear',
              }} />
            </div>
            <span style={{ fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {progressCopy}
            </span>
          </div>
        )}

        {status.phase === 'available' && status.notes.trim() !== '' && (
          <div style={{ borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: '12px' }}>
            <div style={{ marginBottom: '6px', fontSize: '12px', lineHeight: '18px', fontWeight: 500 }}>
              {t('about.releaseNotes')}
            </div>
            <div style={{ maxHeight: '160px', overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '19px', color: 'var(--dsw-alias-label-secondary)' }}>
              {status.notes}
            </div>
          </div>
        )}

        {status.phase === 'failed' && (
          <div style={{ fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)', overflowWrap: 'anywhere' }}>
            {status.message}
          </div>
        )}
      </section>
    </div>
  )
}
