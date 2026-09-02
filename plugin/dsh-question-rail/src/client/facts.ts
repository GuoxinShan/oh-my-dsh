/**
 * Pure rail facts, browser half. Every decision the rail makes — which chat
 * nodes count as "my questions", when the rail shows at all, and where the
 * rail sits relative to its dock anchor — is a DOM-free function here so the
 * node:test suite can pin it. The component (QuestionRail.tsx) is a thin
 * effect shell over these.
 */

/** The rail appears only once the conversation is worth navigating. */
export const MIN_QUESTIONS = 6
/** The rail shows at most this many questions — the most recent ones. */
export const RAIL_MAX_QUESTIONS = 10
/** Collapsed rail height cap; the rail is vertically centered in the scroll body. */
export const RAIL_MAX_HEIGHT = 320
/** Vertical pitch of one tick/item slot. Ticks and panel rows share this
 *  grid, so expanding the rail widens in place — row i sits at the exact Y
 *  of tick i, one slot per question, zero layout jump (0.5.0). */
export const RAIL_SLOT_PX = 32
/** Horizontal inset from the scroll body's left edge. */
export const RAIL_INSET_X = 6
/** Fill-page safety cap: history pages the rail's background pager pulls to
 *  collect RAIL_MAX_QUESTIONS questions before giving up (bounded fill — the
 *  transcript keeps its native lazy rhythm; 0.2.0's full-history pull was
 *  rolled back on review). */
export const MAX_FILL_PAGES = 10

/** Structural slice of one content block (text-bearing or not). */
export interface ContentBlockLike {
  readonly type?: unknown
  readonly text?: unknown
}

/** Structural slice of one chat node the rail reads. */
export interface ChatNodeLike {
  readonly kind?: unknown
  readonly key: string
  /** Sortable render position (event-seq axis); the transcript orders by this. */
  readonly anchorSeq?: unknown
  readonly data?: unknown
}

/** Structural slice of the ConversationSnapshot's chat store. */
export interface ChatLike {
  readonly nodes?: {
    values(): Iterable<ChatNodeLike>
  }
}

/** Structural slice of the dispatched ConversationSnapshot owner share. */
export interface SessionLike {
  readonly chat?: ChatLike | null
}

/** One question row, reduced to exactly what the rail renders and jumps to. */
export interface RailQuestion {
  readonly key: string
  readonly text: string
  readonly time: number
}

/** Copy keys the rail needs (structural subset of the locale seat's t). */
export type RailTranslate = (key: 'message.nonText') => string

/**
 * Flatten one message's content blocks to a single-line preview.
 * @param content - the node's content block array (untrusted shape).
 * @returns whitespace-collapsed text; empty when no text block carries text.
 */
export function questionText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const block of content as readonly ContentBlockLike[]) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      out += (out === '' ? '' : ' ') + block.text
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * Reduce the chat store to the user's own messages (turn-opening `user`
 * nodes plus mid-turn `steering` admissions), in flow order.
 * @param session - the dispatched ConversationSnapshot share (structural).
 * @param t - locale seat for the attachment-only fallback text.
 * @returns one rail row per user/steering node, in conversation order
 *   (oldest first). `nodes.values()` is INSERTION order — prepended history
 *   pages land after the tail page, so without this sort the rail reads
 *   newest-block-first once older history loads; the transcript itself uses
 *   anchorSeq ordering (`orderedVisible`), which is the order mirrored here.
 */
export function collectQuestions(session: SessionLike | null | undefined, t: RailTranslate): RailQuestion[] {
  const chat = session?.chat
  const nodes = chat?.nodes
  if (nodes === undefined || typeof nodes.values !== 'function') return []
  const questions: { question: RailQuestion; seq: number }[] = []
  for (const node of nodes.values()) {
    if (node === null || typeof node !== 'object') continue
    if (node.kind !== 'user' && node.kind !== 'steering') continue
    // data is the runtime's unknown payload; read the two leaves defensively.
    const data: unknown = node.data
    const content = data !== null && typeof data === 'object'
      ? (data as { readonly content?: unknown }).content
      : undefined
    const rawTime = data !== null && typeof data === 'object'
      ? (data as { readonly time?: unknown }).time
      : undefined
    const rawSeq = data !== null && typeof data === 'object'
      ? (data as { readonly seq?: unknown }).seq
      : undefined
    const text = questionText(content)
    questions.push({
      question: {
        key: node.key,
        text: text === '' ? t('message.nonText') : text,
        time: typeof rawTime === 'number' ? rawTime : 0,
      },
      // Ordering key: the node's anchorSeq (event-seq axis, same order the
      // transcript renders); fall back to the message's own seq, then time.
      seq: typeof node.anchorSeq === 'number'
        ? node.anchorSeq
        : typeof rawSeq === 'number' ? rawSeq : typeof rawTime === 'number' ? rawTime : 0,
    })
  }
  questions.sort((left, right) => left.seq - right.seq || left.question.key.localeCompare(right.question.key))
  return questions.map(entry => entry.question)
}

/**
 * The rail's visibility gate: short conversations need no navigation aid.
 * @param count - collected question count.
 * @returns whether the rail renders.
 */
export function railVisible(count: number): boolean {
  return count >= MIN_QUESTIONS
}

/** DOM-rect slice the geometry math consumes (test-friendly). */
export interface RectLike {
  readonly left: number
  readonly top: number
  readonly height: number
}

/** The rail's geometry in anchor-relative coordinates. */
export interface RailGeometry {
  readonly left: number
  readonly top: number
  readonly height: number
}

/**
 * Place the rail: horizontally hugging the scroll body's left edge,
 * vertically centered on the scroll body, capped at RAIL_MAX_HEIGHT. The
 * anchor element rides the composer stack inside the scroll body, so the
 * anchor-relative offset carries the rail WITH the layout during sidebar
 * transitions; only margin redistribution needs re-measuring.
 * @param body - the [data-conversation-scroll] element's bounding rect.
 * @param anchor - the dock anchor element's bounding rect.
 * @returns anchor-relative geometry, or null when the body is too short to
 *   host a rail (degenerate layout).
 */
export function railGeometry(body: RectLike, anchor: RectLike, slots: number): RailGeometry | null {
  if (body.height < 60) return null
  // One slot per question at RAIL_SLOT_PX pitch; the shared grid means the
  // expanded panel's rows align 1:1 with the collapsed ticks.
  const height = Math.max(80, Math.min(RAIL_MAX_HEIGHT, slots * RAIL_SLOT_PX, Math.round(body.height - 24)))
  return {
    left: Math.round(body.left + RAIL_INSET_X - anchor.left),
    top: Math.round(body.top + body.height / 2 - anchor.top - height / 2),
    height,
  }
}

/**
 * Cheap change detector so the 120ms measure poll never re-renders on a
 * stable layout.
 * @param a - previous geometry.
 * @param b - next geometry.
 * @returns whether both describe the same placement.
 */
export function sameRailGeometry(a: RailGeometry | null, b: RailGeometry | null): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  return a.left === b.left && a.top === b.top && a.height === b.height
}

/** Structural slice of the session snapshot the panel-paging decision reads. */
export interface RailSessionSnapshot {
  readonly openState?: unknown
  readonly hasMore?: unknown
}

/** Structural slice of the outward session face (ISession verb + snapshot
 *  source) the rail's panel paging and click-to-jump path consume. */
export interface RailSessionFace {
  getSnapshot(): RailSessionSnapshot & SessionLike
  loadOlder(): Promise<void>
}

/**
 * Whether scrolling the expanded panel to its top edge should pull one
 * older page. Panel paging is user-driven only — the mount path never pages
 * (0.4.0 rolled back 0.2.0's full-history pull and 0.3.0's mount fill), so
 * the transcript's native lazy rhythm stays untouched on open; only the
 * reader's own scroll intent moves history into the shared window.
 * @param snapshot - the session's current snapshot slice.
 * @param loading - a page is already in flight.
 * @returns whether one loadOlder page should start now.
 */
export function shouldPanelPage(
  snapshot: RailSessionSnapshot,
  loading: boolean,
): boolean {
  return !loading && snapshot.openState === 'open' && snapshot.hasMore === true
}

/** Scroll-spy: which question the reader is currently at. Rows are in DOM
 *  (chronological) order; the active one is the LAST whose top sits above
 *  the reference line — i.e. the question the reader just scrolled into. */
export function computeActiveKey(
  rows: readonly { readonly key: string; readonly top: number }[],
  refTop: number,
): string | null {
  let first: string | null = null
  let active: string | null = null
  for (const row of rows) {
    if (first === null) first = row.key
    if (row.top <= refTop) active = row.key
  }
  return active ?? first
}

/**
 * Which slice of the question list the collapsed rail displays. Default is
 * the most recent `max`; when the reader scrolls to an older question, the
 * window slides to center the active one so its highlight is always on the
 * rail (0.6.0 scroll-spy).
 * @param total - questions currently in the window.
 * @param activeIndex - index of the active question, or -1 when none.
 * @param max - rail slot budget (RAIL_MAX_QUESTIONS).
 * @returns the slice [start, start + count) of the question list to render.
 */
export function windowTicks(
  total: number,
  activeIndex: number,
  max: number,
): { readonly start: number; readonly count: number } {
  const count = Math.min(total, max)
  if (count <= 0) return { start: 0, count: 0 }
  if (activeIndex < 0 || activeIndex >= total - count) return { start: total - count, count }
  const start = Math.max(0, Math.min(activeIndex - Math.floor(count / 2), total - count))
  return { start, count }
}
