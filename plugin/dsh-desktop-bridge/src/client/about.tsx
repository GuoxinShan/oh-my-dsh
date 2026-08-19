/**
 * The About settings section, browser half: one `settings.section` list entry
 * ("关于" nav page) showing the desktop app version and the bundled DeepSeek
 * Harness version, plus the updater row — auto-checked once per app boot
 * (shared memoized call with the boot-time check), manually re-checkable,
 * one-click download/install/restart on hit. Update failures are soft —
 * dev builds have no endpoint, offline is normal — the row shows the shell's
 * plain-English error instead of throwing. Styles use --dsw-* tokens only.
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { DesktopBridgeKey } from './locales.ts'

/** Injected faces bound in apply's closure (thin wrappers over IPC + bound translate). */
export interface AboutInjected {
  /** Version info from the shell. */
  versionInfo: () => Promise<{ version: string; harnessVersion: string; runtimeRef: string }>
  /** Memoized updater check shared with the boot-time auto check: null when current, {version, notes} on hit, throws a plain-English error otherwise. */
  checkUpdate: () => Promise<{ version: string; notes: string } | null>
  /** Download + install + restart (the call never resolves on success). */
  applyUpdate: () => Promise<never>
  /** Bound translate for the desktop-bridge namespace (settings.section carries no locale seat). */
  t: (key: DesktopBridgeKey) => string
}

/** Full props: the injected faces (the slot passes its owner props too; unused). */
export type AboutSectionProps = AboutInjected

/** One update-row state machine. */
type UpdateState =
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; version: string; notes: string }
  | { kind: 'applying' }
  | { kind: 'failed'; message: string }

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '12px', padding: '4px 0' }

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  fontSize: '13px',
}

const labelStyle: CSSProperties = { color: 'var(--dsw-alias-text-secondary)' }
const valueStyle: CSSProperties = { color: 'var(--dsw-alias-text-primary)' }

const actionStyle: CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  padding: '4px 12px',
  borderRadius: '6px',
  fontSize: '12px',
  color: 'var(--dsw-alias-brand-text)',
  background: 'var(--dsw-alias-interactive-bg)',
  whiteSpace: 'nowrap',
}

/**
 * The About settings section.
 * @param props - the injected faces plus the locale seat.
 * @returns the section element.
 */
export function AboutSection(props: AboutSectionProps): ReactElement {
  const { versionInfo, checkUpdate, applyUpdate, t } = props
  const [info, setInfo] = useState<{ version: string; harnessVersion: string; runtimeRef: string }>()
  const [update, setUpdate] = useState<UpdateState>({ kind: 'checking' })

  useEffect(() => {
    let alive = true
    versionInfo().then((v) => { if (alive) setInfo(v) }, () => undefined)
    checkUpdate().then(
      (found) => { if (alive) setUpdate(found === null ? { kind: 'current' } : { kind: 'available', version: found.version, notes: found.notes }) },
      (error: unknown) => { if (alive) setUpdate({ kind: 'failed', message: String(error) }) },
    )
    return () => { alive = false }
  }, [versionInfo, checkUpdate])

  const onRecheck = useCallback(() => {
    setUpdate({ kind: 'checking' })
    checkUpdate().then(
      (found) => setUpdate(found === null ? { kind: 'current' } : { kind: 'available', version: found.version, notes: found.notes }),
      (error: unknown) => setUpdate({ kind: 'failed', message: String(error) }),
    )
  }, [checkUpdate])

  const onApply = useCallback(() => {
    setUpdate({ kind: 'applying' })
    applyUpdate().catch((error: unknown) => setUpdate({ kind: 'failed', message: String(error) }))
  }, [applyUpdate])

  const updateRow = (): ReactElement => {
    switch (update.kind) {
      case 'checking':
        return <span style={labelStyle}>{t('about.checking')}</span>
      case 'current':
        return <span style={labelStyle}>{t('about.current')}</span>
      case 'available':
        return <button type="button" style={actionStyle} onClick={onApply}>{`${t('about.apply')} v${update.version}`}</button>
      case 'applying':
        return <span style={labelStyle}>{t('about.applying')}</span>
      case 'failed':
        return (
          <span title={update.message} style={{ ...labelStyle, cursor: 'default' }}>
            {t('about.failed')}
          </span>
        )
    }
  }

  return (
    <div style={sectionStyle} data-desktop-about="">
      <div style={rowStyle}>
        <span style={labelStyle}>{t('about.desktopVersion')}</span>
        <span style={valueStyle}>v{info?.version ?? '…'}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>{t('about.harnessVersion')}</span>
        <span style={valueStyle}>{info?.harnessVersion ?? '…'}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>{t('about.runtime')}</span>
        <span style={valueStyle}>{info?.runtimeRef ?? '…'}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>{t('about.updates')}</span>
        {updateRow()}
      </div>
      {update.kind === 'available' && update.notes !== '' && (
        <div style={{ ...labelStyle, maxHeight: '96px', overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: '12px' }}>
          {update.notes}
        </div>
      )}
      {(update.kind === 'current' || update.kind === 'failed') && (
        <div style={rowStyle}>
          <span />
          <button type="button" style={{ ...actionStyle, background: 'transparent', padding: '4px 0' }} onClick={onRecheck}>
            {t('about.check')}
          </button>
        </div>
      )}
    </div>
  )
}
