import { createHash } from 'node:crypto'
import type { ThreadLink } from './thread-types.ts'

export interface ThreadIdentity {
  linkId: string
  targetSessionId: string
}

/** Derive the stable relation identity owned by one root Session. */
export function deriveThreadId(rootSessionId: string): string {
  const digest = createHash('sha256').update(`dsh-thread-root\0${rootSessionId}`, 'utf8').digest('hex')
  return `thread-root-${digest.slice(0, 32)}`
}

/** Derive one stable Link and target pair from an immutable Draft identity. */
export function deriveThreadIdentity(draftId: string): ThreadIdentity {
  const digest = createHash('sha256').update(`dsh-thread\0${draftId}`, 'utf8').digest('hex')
  return {
    linkId: `thread-${digest.slice(0, 32)}`,
    targetSessionId: `session-thread-${digest.slice(32)}`,
  }
}

export type ThreadIdDecision =
  | { ok: true; threadId: string }
  | { ok: false; error: 'thread-id-conflict'; threadIds: string[] }

/** Inherit one Thread identity across the Link component touching the source. */
export function resolveThreadId(sourceSessionId: string, links: readonly ThreadLink[]): ThreadIdDecision {
  const sessions = new Set([sourceSessionId])
  const component: ThreadLink[] = []
  let changed = true
  while (changed) {
    changed = false
    for (const link of links) {
      if (component.includes(link)) continue
      if (!sessions.has(link.sourceSessionId) && !sessions.has(link.targetSessionId)) continue
      component.push(link)
      if (!sessions.has(link.sourceSessionId)) {
        sessions.add(link.sourceSessionId)
        changed = true
      }
      if (!sessions.has(link.targetSessionId)) {
        sessions.add(link.targetSessionId)
        changed = true
      }
    }
  }

  const inherited = [...new Set(component.flatMap(link => link.threadId === null ? [] : [link.threadId]))].sort()
  if (inherited.length > 1) return { ok: false, error: 'thread-id-conflict', threadIds: inherited }
  if (inherited.length === 1) return { ok: true, threadId: inherited[0]! }

  const targets = new Set(component.map(link => link.targetSessionId))
  const roots = [...sessions].filter(sessionId => !targets.has(sessionId)).sort()
  return { ok: true, threadId: deriveThreadId(roots[0] ?? sourceSessionId) }
}

export type BeginCreationDecision =
  | { ok: true; link: ThreadLink; changed: boolean }
  | { ok: false; error: string; state: ThreadLink['state'] }

/** Apply the direct-click single-flight checkpoint without side effects. */
export function advanceCreation(link: ThreadLink, actionId: string, now: number): BeginCreationDecision {
  if (link.state === 'active') return { ok: true, link, changed: false }
  if (link.state === 'creating') {
    if (link.creationActionId === actionId) return { ok: true, link, changed: false }
    return { ok: false, error: 'creation-in-flight', state: link.state }
  }
  if (link.state !== 'authorized') return { ok: false, error: 'cas-failed', state: link.state }
  return {
    ok: true,
    changed: true,
    link: { ...link, state: 'creating', creationActionId: actionId, updatedAt: now },
  }
}
