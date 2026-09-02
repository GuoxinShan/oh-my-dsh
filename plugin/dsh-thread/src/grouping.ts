import type { ThreadLink } from './thread-types.ts'

/** One connected Thread component projected for list surfaces. */
export interface ThreadGroup {
  /** Stable Thread id; null when the component mixes or lacks durable ids (legacy links). */
  threadId: string | null
  /** Root Session of the component (no incoming link; sorted tiebreak). */
  rootSessionId: string
  /** Sessions in stage order: root first, then breadth-first over outgoing links. */
  sessionIds: string[]
  /** The component's committed links, creation order; panel artifact projection reads these. */
  links: ThreadLink[]
}

/** Disjoint-set find with path compression. */
function findRoot(parent: Map<string, string>, sessionId: string): string {
  let root = sessionId
  while (parent.get(root) !== root) root = parent.get(root)!
  let node = sessionId
  while (parent.get(node) !== node) {
    const next = parent.get(node)!
    parent.set(node, root)
    node = next
  }
  return root
}

/** Order one component's Sessions root-first, breadth-first over outgoing links, ids sorted at rest. */
function orderComponentSessions(componentLinks: readonly ThreadLink[]): string[] {
  const all = new Set<string>()
  const targets = new Set<string>()
  for (const link of componentLinks) {
    all.add(link.sourceSessionId)
    all.add(link.targetSessionId)
    targets.add(link.targetSessionId)
  }
  const roots = [...all].filter(sessionId => !targets.has(sessionId)).sort()
  const queue = [...roots]
  const ordered: string[] = []
  const seen = new Set<string>()
  while (queue.length > 0) {
    const sessionId = queue.shift()!
    if (seen.has(sessionId)) continue
    seen.add(sessionId)
    ordered.push(sessionId)
    for (const link of componentLinks) {
      if (link.sourceSessionId === sessionId) queue.push(link.targetSessionId)
    }
  }
  for (const sessionId of [...all].sort()) {
    if (!seen.has(sessionId)) ordered.push(sessionId)
  }
  return ordered
}

/**
 * Group every committed Thread link into connected components. Uncommitted
 * creation attempts never surface. Groups order by their oldest link; list
 * surfaces re-sort by activity on top of this stable base.
 */
export function deriveThreadGroups(links: readonly ThreadLink[]): ThreadGroup[] {
  const committed = links
    .filter(link => link.relationCommit !== null)
    .sort((left, right) => left.createdAt - right.createdAt || left.linkId.localeCompare(right.linkId))
  const parent = new Map<string, string>()
  const touch = (sessionId: string): void => {
    if (!parent.has(sessionId)) parent.set(sessionId, sessionId)
  }
  for (const link of committed) {
    touch(link.sourceSessionId)
    touch(link.targetSessionId)
    const sourceRoot = findRoot(parent, link.sourceSessionId)
    const targetRoot = findRoot(parent, link.targetSessionId)
    if (sourceRoot !== targetRoot) parent.set(targetRoot, sourceRoot)
  }

  const byComponent = new Map<string, ThreadLink[]>()
  for (const link of committed) {
    const root = findRoot(parent, link.sourceSessionId)
    const bucket = byComponent.get(root)
    if (bucket === undefined) byComponent.set(root, [link])
    else bucket.push(link)
  }

  return [...byComponent.values()].map((componentLinks) => {
    const sessionIds = orderComponentSessions(componentLinks)
    const threadIds = [...new Set(componentLinks.flatMap(link => link.threadId === null ? [] : [link.threadId]))]
    return {
      threadId: threadIds.length === 1 ? threadIds[0]! : null,
      rootSessionId: sessionIds[0]!,
      sessionIds,
      links: componentLinks,
    }
  })
}
