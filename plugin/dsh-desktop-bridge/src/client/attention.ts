/**
 * Attention diff: pure state-transition logic behind native notifications.
 * Consumes consecutive snapshots of the sessions list (the runtime's
 * raf-batched observable) and reports which sessions crossed a
 * user-attention edge: a running turn finishing, or a blocking interaction
 * appearing. No notification side effects live here.
 */

/** Minimal session-row view the diff needs (structurally satisfied by SessionSummary). */
export interface AttentionRow {
  id: string
  /** Human-facing title (SessionSummary.displayTitle). */
  displayTitle: string
  running: boolean
  /** Blocking user interaction, absent = none (SessionSummary.pendingInteraction). */
  pendingInteraction?: string
}

/** One attention edge crossed between two consecutive list snapshots. */
export interface AttentionEdge {
  sessionId: string
  /** 'turn-done': running true→false; 'await-input': pendingInteraction none→present. */
  kind: 'turn-done' | 'await-input'
  /** Row title at the after-side of the transition. */
  title: string
}

/**
 * Diff two list snapshots into attention edges.
 *
 * A session appearing on the after-side with `running: false` and no pending
 * interaction counts as turn-done (a session that finished between two list
 * arrivals — including brand-new rows the host reports completed). A session
 * present on both sides crossing running true→false also counts. Pending
 * edges likewise fire for both survivors and newcomers. When one transition
 * produces both edges, only the await-input edge is reported — the more
 * actionable fact wins.
 *
 * @param before - ids/rows of the earlier snapshot (absent = first sample; first arrival reports nothing to avoid a notification storm at boot).
 * @param after - ids/rows of the later snapshot.
 * @returns edges to evaluate against the visibility gate; order follows the after-side id order.
 */
export function diffAttention(
  before: ReadonlyMap<string, AttentionRow> | undefined,
  after: ReadonlyMap<string, AttentionRow>,
): AttentionEdge[] {
  if (before === undefined) return []
  const edges: AttentionEdge[] = []
  for (const row of after.values()) {
    const prior = before.get(row.id)
    const startedPending = prior === undefined || prior.pendingInteraction === undefined
    const nowPending = row.pendingInteraction !== undefined
    if (nowPending && startedPending) {
      edges.push({ sessionId: row.id, kind: 'await-input', title: row.displayTitle })
      continue
    }
    const finished = prior === undefined ? !row.running && !nowPending : prior.running && !row.running
    if (finished) edges.push({ sessionId: row.id, kind: 'turn-done', title: row.displayTitle })
  }
  return edges
}

/**
 * Fold a snapshot's rows into the diff input map.
 * @param rows - rows of one list snapshot.
 * @returns id-keyed map for the next diff call.
 */
export function attentionIndex(rows: readonly AttentionRow[]): Map<string, AttentionRow> {
  return new Map(rows.map((row) => [row.id, row]))
}
