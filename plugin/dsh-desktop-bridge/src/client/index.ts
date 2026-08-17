/**
 * Desktop webview bridge, browser half. Probes the desktop gate signal; in a
 * plain browser (terminal `dsh web`) the probe is 'absent' and apply returns
 * with zero registrations, so the row is always safe to mount. Inside the
 * shell it installs three effects — external-link routing, attention
 * notifications, and the shell.overlay desktop badge — all as reversible
 * effects collected by the plugin fiber.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the 'shell.overlay' SlotMap declaration (ui-layout's
// frame declares it) so the registration below typechecks against the real
// declaration — no runtime edge to ui-layout.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { AttentionEdge, AttentionRow } from './attention.ts'
import { attentionIndex, diffAttention } from './attention.ts'
import type { LinkDecision } from './links.ts'
import { classifyAnchor } from './links.ts'
import type { DesktopProbe, TauriInvoke } from './env.ts'
import { probeDesktop } from './env.ts'
import { DesktopBadge } from './badge.tsx'
import type { BadgeInjected } from './badge.tsx'

/** Required services: the slot registry and the sessions list feed. */
export const inject = ['slots', 'sessions']

/** Logger face used by the installers (the cordis logger satisfies this). */
interface WarnLog {
  warn(message: string): void
}

/**
 * Client plugin body: probe, then install the three bridges.
 * @param ctx - client root context.
 * @throws when the gate signal is present but malformed, or the Tauri IPC carrier is missing (shell-contract violation; the boot audit reports the failed fiber without affecting other plugins).
 */
export function apply(ctx: ClientContext): void {
  const logger: WarnLog = { warn: (m) => { ctx.logger.warn(m) } }
  const probe = probeDesktop(window, logger.warn)
  if (probe.status === 'absent') return
  if (probe.status === 'shell-contract-violation') {
    throw new Error(`dsh-desktop-bridge: ${probe.reason}`)
  }
  const { invoke } = probe

  ctx.effect(() => installExternalLinks(document, invoke, logger), 'desktop-bridge: external links')
  ctx.effect(() => installAttention(
    ctx.sessions.list,
    invoke,
    logger,
  ), 'desktop-bridge: attention')
  const injected = (): BadgeInjected => ({ openExternal: (url) => { void callOpenExternal(invoke, url, logger) } })
  // slots.inject waits on the ui-layout declaration (activation order is
  // unconstrained), reruns after redeclaration, and leaves with this fiber.
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({ name: 'shell.overlay', id: 'desktop-badge', order: 10, inject: injected }, DesktopBadge))
}

/**
 * Capture-phase external-link router.
 * @param doc - the document to listen on (injected for tests).
 * @param invoke - the shell IPC carrier.
 * @param logger - warning sink for rejected invokes.
 * @returns the disposer removing the listener.
 */
export function installExternalLinks(doc: Document, invoke: TauriInvoke, logger: WarnLog): () => void {
  const onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = event.target
    if (target === null || typeof (target as Element).closest !== 'function') return
    const anchor = (target as Element).closest('a')
    if (anchor === null) return
    let decision: LinkDecision
    try {
      decision = classifyAnchor(anchor as HTMLAnchorElement, doc.defaultView?.location.origin ?? '')
    } catch {
      return
    }
    if (decision.action === 'route') {
      event.preventDefault()
      void callOpenExternal(invoke, decision.url, logger)
    }
  }
  doc.addEventListener('click', onClick, true)
  return () => { doc.removeEventListener('click', onClick, true) }
}

/** Fire one open-external IPC call; on rejection fall back to window.open. */
async function callOpenExternal(invoke: TauriInvoke, url: string, logger: WarnLog): Promise<void> {
  try {
    await invoke.invoke('dsh_desktop_open_external', { url })
  } catch (error) {
    logger.warn(`dsh-desktop-bridge: open_external failed for ${url}, falling back to window.open: ${String(error)}`)
    window.open(url, '_blank', 'noopener')
  }
}

/**
 * Attention notification installer: subscribe the sessions list observable,
 * diff consecutive snapshots, gate on document visibility, and fire native
 * notifications for crossed edges.
 * @param list - the sessions list snapshot feed (raf-batched).
 * @param invoke - the shell IPC carrier.
 * @param logger - warning sink for rejected invokes.
 * @returns the unsubscriber.
 */
export function installAttention(
  list: { getSnapshot(): { ids: readonly string[]; byId: Readonly<Record<string, AttentionRowLike>> }; subscribe(fn: () => void): () => void },
  invoke: TauriInvoke,
  logger: WarnLog,
): () => void {
  let previous: ReadonlyMap<string, AttentionRow> | undefined
  const rowOf = (row: AttentionRowLike): AttentionRow => ({
    id: row.id,
    displayTitle: row.displayTitle,
    running: row.running,
    ...(row.pendingInteraction !== undefined ? { pendingInteraction: row.pendingInteraction } : {}),
  })
  const snapshot = (): AttentionRow[] => {
    const state = list.getSnapshot()
    return state.ids.map((id) => state.byId[id]).filter((row) => row !== undefined).map(rowOf)
  }
  const notify = (edge: AttentionEdge): void => {
    const body = edge.kind === 'await-input' ? '等待你的输入' : '回合已完成'
    void invoke.invoke('dsh_desktop_notify', { title: edge.title, body })
      .catch((error: unknown) => { logger.warn(`dsh-desktop-bridge: notify rejected: ${String(error)}`) })
  }
  const onFlush = (): void => {
    const rows = snapshot()
    const next = attentionIndex(rows)
    const edges = diffAttention(previous, next)
    previous = next
    if (!document.hidden) return
    for (const edge of edges) notify(edge)
  }
  previous = attentionIndex(snapshot())
  return list.subscribe(onFlush)
}

/** Structural slice of SessionSummary the attention diff consumes. */
interface AttentionRowLike {
  id: string
  displayTitle: string
  running: boolean
  pendingInteraction?: string
}

/** Re-exported probe type for same-package tests through ./src. */
export type { DesktopProbe } from './env.ts'
