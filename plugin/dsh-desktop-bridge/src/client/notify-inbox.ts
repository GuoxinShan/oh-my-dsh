/**
 * In-process notification inbox. Attention edges land here even when the
 * native banner is suppressed, so the in-app center is a complete log of
 * the current shell session. Nothing is persisted.
 */
import type { AttentionEdge } from './attention.ts'

/** One inbox row. */
export interface InboxItem {
  id: string
  sessionId: string
  kind: AttentionEdge['kind']
  title: string
  at: number
  unread: boolean
}

/** Published inbox snapshot. */
export interface InboxSnapshot {
  items: readonly InboxItem[]
  unread: number
}

const DEFAULT_LIMIT = 30

/** Count unread rows. */
export function unreadCount(items: readonly InboxItem[]): number {
  let count = 0
  for (const item of items) {
    if (item.unread) count += 1
  }
  return count
}

/** Compact unread badge: empty / 1–9 / 9+. */
export function unreadBadge(count: number): string {
  if (count <= 0) return ''
  return count > 9 ? '9+' : String(count)
}

/** Relative age for an inbox row. */
export function formatInboxAge(at: number, now: number, copy: {
  justNow: string
  minutesAgo: string
  hoursAgo: string
}): string {
  const delta = Math.max(0, now - at)
  if (delta < 60_000) return copy.justNow
  if (delta < 3_600_000) return copy.minutesAgo.replace('{n}', String(Math.floor(delta / 60_000)))
  return copy.hoursAgo.replace('{n}', String(Math.floor(delta / 3_600_000)))
}

/** Mutable inbox used by the installer and the center UI. */
export interface NotifyInbox {
  getSnapshot(): InboxSnapshot
  subscribe(fn: () => void): () => void
  push(edge: AttentionEdge, now?: number): InboxItem
  markRead(id: string): void
  markAllRead(): void
  clear(): void
}

/**
 * Create an in-memory inbox.
 * @param limit - max retained rows, newest first.
 */
export function createNotifyInbox(limit = DEFAULT_LIMIT): NotifyInbox {
  let items: InboxItem[] = []
  let seq = 0
  const listeners = new Set<() => void>()
  const emit = (): void => {
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => ({ items, unread: unreadCount(items) }),
    subscribe: (fn) => {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    push(edge, now = Date.now()) {
      seq += 1
      const item: InboxItem = {
        id: `${String(now)}-${String(seq)}`,
        sessionId: edge.sessionId,
        kind: edge.kind,
        title: edge.title,
        at: now,
        unread: true,
      }
      items = [item, ...items].slice(0, limit)
      emit()
      return item
    },
    markRead(id) {
      let changed = false
      items = items.map((item) => {
        if (item.id !== id || !item.unread) return item
        changed = true
        return { ...item, unread: false }
      })
      if (changed) emit()
    },
    markAllRead() {
      if (unreadCount(items) === 0) return
      items = items.map((item) => (item.unread ? { ...item, unread: false } : item))
      emit()
    },
    clear() {
      if (items.length === 0) return
      items = []
      emit()
    },
  }
}
