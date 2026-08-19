/**
 * The update indicator, browser half: one additive shell.overlay entry that
 * stays invisible until the periodic GitHub check finds a newer desktop
 * release — then a small download icon seats at the window's top-right
 * (level with the titleband controls), one click downloads + installs +
 * restarts. Check cadence borrows the Zed / GitHub Desktop consensus (a
 * quiet background poll, an affordance only when there is something to
 * show): one check soon after mount, then every UPDATE_INTERVAL_MS with a
 * forced refresh (the shared single-flight memo is bypassed so each tick
 * sees the live endpoint). Misses (offline, dev build without an endpoint)
 * stay silent; the icon simply never appears.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { IconDownloadOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

/** Injected faces bound in apply's closure (thin wrappers over IPC). */
export interface UpdateIndicatorInjected {
  /** Updater check; `force` bypasses the shared boot memo (periodic ticks). null when current, {version} on hit. */
  checkUpdate: (force?: boolean) => Promise<{ version: string } | null>
  /** Download + install + restart (the call never resolves on success). */
  applyUpdate: () => Promise<never>
}

/** Full props: the injected faces (the slot passes its owner props too; unused). */
export type UpdateIndicatorProps = UpdateIndicatorInjected
/** Periodic check interval (Zed-style quiet poll; 2h). */
const UPDATE_INTERVAL_MS = 2 * 60 * 60 * 1000

/** First check delay after mount: past the boot burst, soon enough to matter. */
const FIRST_CHECK_DELAY_MS = 3000

type IndicatorState =
  | { kind: 'hidden' }
  | { kind: 'available'; version: string }
  | { kind: 'applying'; version: string }

/**
 * The top-right update affordance.
 * @param props - the injected faces.
 * @returns null while current/failed, the icon button when an update waits.
 */
export function UpdateIndicator(props: UpdateIndicatorProps): ReactElement | null {
  const { checkUpdate, applyUpdate } = props
  const [state, setState] = useState<IndicatorState>({ kind: 'hidden' })
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const run = (force: boolean): void => {
      checkUpdate(force).then(
        (found) => {
          if (!alive.current) return
          if (found !== null) setState((prev) => (prev.kind === 'applying' ? prev : { kind: 'available', version: found.version }))
        },
        () => undefined, // offline / no endpoint: stay hidden, retry next tick
      )
    }
    const first = setTimeout(() => { run(false) }, FIRST_CHECK_DELAY_MS)
    const interval = setInterval(() => { run(true) }, UPDATE_INTERVAL_MS)
    return () => {
      alive.current = false
      clearTimeout(first)
      clearInterval(interval)
    }
  }, [checkUpdate])

  const onApply = useCallback(() => {
    setState((prev) => (prev.kind === 'available' ? { kind: 'applying', version: prev.version } : prev))
    applyUpdate().catch(() => { if (alive.current) setState((prev) => (prev.kind === 'applying' ? { kind: 'available', version: prev.version } : prev)) })
  }, [applyUpdate])

  if (state.kind === 'hidden') return null
  const applying = state.kind === 'applying'
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
        title={applying ? '正在下载并安装，完成后自动重启…' : `更新到 v${state.version}`}
        onClick={onApply}
        disabled={applying}
        style={{
          all: 'unset',
          boxSizing: 'border-box',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '22px',
          height: '22px',
          borderRadius: '6px',
          cursor: applying ? 'default' : 'pointer',
          opacity: applying ? 0.55 : 1,
          color: 'inherit',
          pointerEvents: 'auto',
        }}
        onMouseEnter={(e) => { if (!applying) e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <IconDownloadOutline16 />
      </button>
    </div>
  )
}
