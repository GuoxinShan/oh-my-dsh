/**
 * Desktop notification installer. Diffs the sessions list into attention
 * edges, decides whether a native banner is warranted, and opens the
 * matching session when the user clicks the banner.
 */
import type { AttentionEdge, AttentionRow } from './attention.ts'
import { attentionIndex, diffAttention } from './attention.ts'
import type { DesktopInvoke } from './env.ts'

/** Shell → webview event name for a notification click. */
export const NOTIFY_CLICK_EVENT = 'dsh-desktop-notify-click'

/** Logger face used by the installer. */
export interface NotifyLog {
  warn(message: string): void
}

/** Visibility / focus facts at the moment an edge is considered. */
export interface NotifySurface {
  hidden: boolean
  focused: boolean
  currentSessionId?: string
}

/** Sessions-list snapshot the installer consumes. */
export interface NotifyListState {
  ids: readonly string[]
  byId: Readonly<Record<string, NotifyRowLike>>
  current?: string
}

export interface NotifyRowLike {
  id: string
  displayTitle: string
  running: boolean
  pendingInteraction?: string
}

export interface NotifyList {
  getSnapshot(): NotifyListState
  subscribe(fn: () => void): () => void
}

/** Copy the installer needs; bound from `ctx.locale`. */
export interface NotifyCopy {
  turnDone: string
  awaitInput: string
}

/**
 * Whether a crossed attention edge should raise a native banner.
 * Hidden or unfocused windows notify every edge. A focused visible window
 * only notifies for sessions that are not the current one.
 */
export function shouldNotify(edge: Pick<AttentionEdge, 'sessionId'>, surface: NotifySurface): boolean {
  if (surface.hidden || !surface.focused) return true
  return surface.currentSessionId !== edge.sessionId
}

/** Read a session id off a notify-click payload. */
export function parseNotifyClick(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== 'object') return undefined
  const sessionId = (payload as { sessionId?: unknown }).sessionId
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : undefined
}

export function bodyForEdge(kind: AttentionEdge['kind'], copy: NotifyCopy): string {
  return kind === 'await-input' ? copy.awaitInput : copy.turnDone
}

/**
 * Subscribe the sessions list, fire native notifications, and open a session
 * when the shell reports a banner click.
 */
export function installNotifications(opts: {
  list: NotifyList
  invoke: DesktopInvoke
  logger: NotifyLog
  copy: NotifyCopy | (() => NotifyCopy)
  openSession: (sessionId: string) => void
  record?: (edge: AttentionEdge) => void
  surface?: () => NotifySurface
}): () => void {
  const surfaceOf = opts.surface ?? browserSurface
  let previous: ReadonlyMap<string, AttentionRow> | undefined

  const snapshot = (): { rows: AttentionRow[]; current?: string } => {
    const state = opts.list.getSnapshot()
    return {
      rows: state.ids.map((id) => state.byId[id]).filter((row) => row !== undefined).map(rowOf),
      ...(state.current !== undefined ? { current: state.current } : {}),
    }
  }

  const notify = (edge: AttentionEdge): void => {
    void opts.invoke.invoke('dsh_desktop_notify', {
      title: edge.title,
      body: bodyForEdge(edge.kind, typeof opts.copy === 'function' ? opts.copy() : opts.copy),
      sessionId: edge.sessionId,
    }).catch((error: unknown) => {
      opts.logger.warn(`dsh-desktop-bridge: notify rejected: ${String(error)}`)
    })
  }

  const onFlush = (): void => {
    const { rows, current } = snapshot()
    const next = attentionIndex(rows)
    const edges = diffAttention(previous, next)
    previous = next
    const surface: NotifySurface = { ...surfaceOf(), ...(current !== undefined ? { currentSessionId: current } : {}) }
    for (const edge of edges) {
      opts.record?.(edge)
      if (shouldNotify(edge, surface)) notify(edge)
    }
  }

  const onClick = (payload: unknown): void => {
    const sessionId = parseNotifyClick(payload)
    if (sessionId === undefined) return
    try {
      opts.openSession(sessionId)
    } catch (error) {
      opts.logger.warn(`dsh-desktop-bridge: notify click could not open ${sessionId}: ${String(error)}`)
    }
  }

  previous = attentionIndex(snapshot().rows)
  const stopList = opts.list.subscribe(onFlush)
  const stopClick = opts.invoke.on?.(NOTIFY_CLICK_EVENT, onClick)
  return () => {
    stopList()
    stopClick?.()
  }
}

function rowOf(row: NotifyRowLike): AttentionRow {
  return {
    id: row.id,
    displayTitle: row.displayTitle,
    running: row.running,
    ...(row.pendingInteraction !== undefined ? { pendingInteraction: row.pendingInteraction } : {}),
  }
}

function browserSurface(): NotifySurface {
  return { hidden: document.hidden, focused: document.hasFocus() }
}
