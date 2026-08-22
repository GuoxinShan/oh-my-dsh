/**
 * Pure visibility/busy predicates for the send-while-running button, over
 * the minimal structural facts the InputZone owner share and the session
 * standard kit expose. Kept DOM-free so they unit-test directly.
 */

/**
 * The session facts this feature reads off the ConversationSnapshot owner
 * share (structural subset; the real snapshot satisfies it).
 */
export interface SessionFacts {
  /** Whether the session's turn is currently running. */
  readonly running: boolean
  /** Catalog-discovered continuation address; null for ordinary sessions. */
  readonly subagent: unknown
  /** Set after host/session-removed; input controls refuse interaction. */
  readonly removed: boolean
}

/**
 * The input facts this feature reads off the InputState owner share
 * (structural subset; the real machine state satisfies it).
 */
export interface InputFacts {
  /** Current draft text. */
  readonly draft: string
  /** Ordered runtime-only draft image ids; bytes stay in the controller. */
  readonly imageIds: readonly unknown[]
  /** Machine phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting'. */
  readonly phase: string
}

/**
 * When the extra Send button must be visible: exactly the state where the
 * stock composer primary has flipped to Stop for an ordinary session
 * (running, no subagent continuation address, not removed) AND the user has
 * something to send (non-blank draft or at least one draft image). A
 * continuable child session already keeps Send as its primary with an
 * independent Stop beside it, so it is excluded.
 * @param session - structural session facts.
 * @param input - structural input facts.
 * @returns true when the button should render.
 */
export function sendButtonVisible(session: SessionFacts, input: InputFacts): boolean {
  if (!session.running) return false
  if (session.subagent !== null && session.subagent !== undefined) return false
  if (session.removed) return false
  return input.draft.trim() !== '' || input.imageIds.length > 0
}

/**
 * When the extra Send button must refuse clicks: the input machine is mid
 * admission (adjudicating a slash line or submitting). Mirrors the stock
 * primary's `machineBusy` disable term.
 * @param phase - the machine phase.
 * @returns true while an admission transaction is in flight.
 */
export function sendButtonBusy(phase: string): boolean {
  return phase === 'adjudicating' || phase === 'submitting'
}
