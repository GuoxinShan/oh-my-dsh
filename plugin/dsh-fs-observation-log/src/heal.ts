/**
 * The healing decision core. Everything here is a pure function over
 * plain data so the restore policy is exhaustively testable; the event
 * wiring lives in src/index.ts.
 *
 * The invariant the decision enforces: evidence alone never authorizes.
 * A restore happens only when the live provider's stat reports the very
 * same freshness token the record holds — i.e. the file provably did not
 * change since the remembered observation. Anything else falls through to
 * the stock policy (which keeps demanding a read).
 * @module dsh-fs-observation-log/heal
 */

import type { ObservationLogConfig } from './config.ts'
import type { EvidenceHit } from './store.ts'

/**
 * Minimal structural view of a session header: all the identity this plugin
 * needs. The real `SessionHeader` (dsh-session) contains these fields; the
 * narrowing stays structural so no harness value import exists at runtime.
 */
export interface SessionHeaderView {
  readonly id?: unknown
  readonly parentSession?: unknown
}

/** A session lineage resolved from a header: self first, then ancestors. */
export type Lineage = readonly string[]

/**
 * Resolve the observation lineage of a session: itself, then the fork parent
 * chain, bounded by `maxLineageDepth` and guarded against cycles. Ancestor
 * parents come from the injected `parentOf` (the store's sidecar headers);
 * the chain ends where lineage is unknown or disabled.
 * @param header - the acting session's header view.
 * @param config - resolved plugin config (`inheritFork`, `maxLineageDepth`).
 * @param parentOf - sidecar-backed ancestor-parent lookup.
 * @returns distinct session ids nearest-first; empty when the header carries
 *   no usable id (a non-agent caller).
 */
export function sessionLineage(
  header: SessionHeaderView,
  config: ObservationLogConfig,
  parentOf: (sessionId: string) => string | undefined,
): Lineage {
  const self = header.id
  if (typeof self !== 'string' || self.length === 0) return []
  const lineage: string[] = [self]
  if (!config.inheritFork) return lineage
  const seen = new Set<string>(lineage)
  let cursor: string | undefined = typeof header.parentSession === 'string' && header.parentSession.length > 0
    ? header.parentSession
    : parentOf(self)
  while (cursor !== undefined && lineage.length < config.maxLineageDepth + 1) {
    if (seen.has(cursor)) break
    seen.add(cursor)
    lineage.push(cursor)
    cursor = parentOf(cursor)
  }
  return lineage
}

/** What the live provider reported about the target right now. */
export interface LiveStat {
  /** The target's current freshness token; undefined when the target is absent. */
  version?: string
}

/** Why a restore was skipped — surfaced in debug logging only. */
export type HealDecision =
  | { kind: 'restore'; version: string; fromSession: string }
  | { kind: 'skip'; reason: 'live-observed' | 'no-evidence' | 'target-absent' | 'version-changed' }

/**
 * Decide whether the stock policy's missing observation may be restored.
 *
 * Order of checks (each can veto):
 * 1. `liveRecord` — this process already observed the target for the acting
 *    session; the stock policy has it too and there is nothing to heal.
 * 2. `evidence` — no lineage record ever observed the target; nothing to
 *    restore, the stock policy's demand for a read stands.
 * 3. `stat.version` undefined — the target does not exist right now; let the
 *    stock policy answer `FS_NOT_FOUND` semantics for itself.
 * 4. `stat.version !== evidence.version` — the file changed since the
 *    remembered observation; the evidence is stale, the guard must demand a
 *    fresh read.
 * 5. Otherwise restore: re-emit `present` at the live token.
 *
 * @param liveRecord - this process's mirror entry for the acting session.
 * @param evidence - the lineage lookup hit, when any.
 * @param stat - the provider stat performed moments ago.
 */
export function healDecision(liveRecord: unknown, evidence: EvidenceHit | undefined, stat: LiveStat): HealDecision {
  if (liveRecord !== undefined) return { kind: 'skip', reason: 'live-observed' }
  if (evidence === undefined) return { kind: 'skip', reason: 'no-evidence' }
  if (stat.version === undefined) return { kind: 'skip', reason: 'target-absent' }
  if (stat.version !== evidence.version) return { kind: 'skip', reason: 'version-changed' }
  return { kind: 'restore', version: stat.version, fromSession: evidence.sessionId }
}
