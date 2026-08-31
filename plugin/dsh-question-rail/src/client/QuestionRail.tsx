/**
 * The question rail component, browser half: a thin effect shell over the
 * pure facts (facts.ts). Mounted through the `conversation.input.dock` seat
 * as a 0-height anchor riding the composer stack — the anchor participates
 * in the column's layout motion, so the rail moves WITH the transcript and
 * composer through sidebar transitions (no JavaScript motion tracking);
 * the 120ms poll only re-measures margin redistribution after the layout
 * settles.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { QuestionRailKey } from './locales.ts'
import {
  MAX_FILL_PAGES, RAIL_MAX_QUESTIONS, collectQuestions, countQuestions, fillDecision,
  railGeometry, railVisible, sameRailGeometry,
  type RailGeometry, type RailQuestion, type RailSessionFace, type SessionLike,
} from './facts.ts'

/** Geometry poll cadence; each pass is one getBoundingClientRect pair. */
const MEASURE_INTERVAL_MS = 120
/** Jump-highlight duration, matching the flash animation. */
const FLASH_MS = 1600
/** Retry cadence while the session window is still opening. */
const WAIT_OPEN_MS = 250

/** Locale seat share (structural subset of the framework-injected t). */
type RailTranslate = (key: QuestionRailKey, params?: Record<string, unknown>) => string

/** Lifecycle-safe timer faces, bound from the apply closure's ctx. */
export interface RailTimers {
  readonly interval: (callback: () => void, delay: number) => () => void
  readonly timeout: (callback: () => void, delay: number) => () => void
}

/** Resolve the current session's outward face (history paging verb) from the
 *  sessions service; undefined while the session is neither listed nor scoped. */
export type ResolveSessionFace = (sessionId: string) => RailSessionFace | undefined

/**
 * Component props: the InputZone owner share (`session`), the session id from
 * the standard kit, plus the apply-bound timers / session-face resolver and
 * the locale seat — all optional structural subsets so the composed contract
 * stays assignable; absent shares render the bare anchor (fail-invisible,
 * never a crash).
 */
export interface QuestionRailProps {
  /** Point-in-time ConversationSnapshot share the slot dispatches with. */
  readonly session?: SessionLike
  /** The session id from the session standard kit. */
  readonly sessionId?: string
  /** Apply-closure timer faces (ctx.interval / ctx.timeout). */
  readonly timers?: RailTimers
  /** Apply-closure sessions.face resolver (ctx.sessions.binding). */
  readonly resolveFace?: ResolveSessionFace
  /** Locale seat bound by the `locale:` registration option. */
  readonly t?: RailTranslate
}

/** The scroll body hosting the transcript and the sticky composer seat. */
function findScrollBody(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-conversation-scroll]')
}

/** Locate one chat row by its engine-owned anchor key (the chat view's own
 *  lookup strategy in ChatView.tsx — dataset equality, not CSS escaping). */
function findRow(body: HTMLElement, key: string): HTMLElement | null {
  for (const row of body.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')) {
    if (row.dataset.chatAnchorKey === key) return row
  }
  return null
}

/** HH:MM for one message timestamp; empty when the node carried no time. */
function formatTime(time: number): string {
  if (time <= 0) return ''
  const d = new Date(time)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

/**
 * The rail and its expanded question list.
 * @param props - owner share + bound timers + locale seat.
 * @returns the 0-height dock anchor hosting the absolutely positioned rail.
 */
export function QuestionRailDock(props: QuestionRailProps): ReactElement {
  const { session, sessionId, timers, resolveFace, t } = props
  const [hover, setHover] = useState(false)
  const [geometry, setGeometry] = useState<RailGeometry | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Chronological questions inside the current window; the rail shows only
  // the most recent RAIL_MAX_QUESTIONS (user direction 0.3.0: recent-10
  // window, native lazy rhythm kept).
  const allQuestions: readonly RailQuestion[] = collectQuestions(session, key => t === undefined ? '[图片或附件]' : t(key))
  const questions = allQuestions.slice(-RAIL_MAX_QUESTIONS)
  const visible = railVisible(allQuestions.length)

  // Bounded background fill (0.3.0): the transcript keeps its native lazy
  // paging; the rail only pulls older pages while the CURRENT window holds
  // fewer questions than the rail wants (sparse tail page), never draining
  // history. Each landed page re-renders the dock share, so the latest-10
  // window fills in progressively; stock prepend anchoring keeps the
  // reader's scroll position stable.
  useEffect(() => {
    if (timers === undefined || resolveFace === undefined || sessionId === undefined) return undefined
    let cancelled = false
    let pages = 0
    const run = async () => {
      const face = resolveFace(sessionId)
      if (face === undefined) return
      while (!cancelled) {
        const snapshot = face.getSnapshot()
        const action = fillDecision(snapshot, countQuestions(snapshot), pages)
        if (action === 'stop') return
        if (action === 'wait-open') {
          await new Promise<void>(resume => { timers.timeout(resume, WAIT_OPEN_MS) })
          continue
        }
        await face.loadOlder()
        pages += 1
      }
    }
    void run()
    return () => { cancelled = true }
  }, [timers, resolveFace, sessionId])

  useEffect(() => {
    if (timers === undefined) return undefined
    const remeasure = () => {
      const anchor = anchorRef.current
      const body = findScrollBody()
      const next = body === null || anchor === null
        ? null
        : railGeometry(body.getBoundingClientRect(), anchor.getBoundingClientRect())
      setGeometry(prev => (sameRailGeometry(prev, next) ? prev : next))
    }
    remeasure()
    return timers.interval(remeasure, MEASURE_INTERVAL_MS)
  }, [timers, questions.length])

  // Open with the latest question in view; the user reads the list bottom-up.
  useEffect(() => {
    const list = listRef.current
    if (hover && list !== null) list.scrollTop = list.scrollHeight
  }, [hover])

  const jump = async (key: string) => {
    const body = findScrollBody()
    if (body === null) return
    let row = findRow(body, key)
    // Ensure-loaded guarantee: a shown question is normally in-window by
    // construction, but if its row is missing (e.g. a render race right after
    // a page landed), page history until it mounts, then scroll — clicking a
    // tick always lands on its message.
    if (row === null && timers !== undefined && resolveFace !== undefined && sessionId !== undefined) {
      const face = resolveFace(sessionId)
      for (let page = 0; face !== undefined && row === null && page < MAX_FILL_PAGES; page++) {
        const snapshot = face.getSnapshot()
        if (snapshot.openState !== 'open' || snapshot.hasMore !== true) break
        await face.loadOlder()
        row = findRow(body, key)
      }
    }
    if (row === null) return
    row.scrollIntoView({ behavior: 'smooth', block: 'start' })
    row.classList.add('dsh-qr-flash')
    timers?.timeout(() => { row?.classList.remove('dsh-qr-flash') }, FLASH_MS)
  }

  const onJump = (key: string) => { void jump(key) }

  const ariaLabel = t === undefined ? '我的问题刻度尺' : t('rail.ariaLabel')
  return (
    <div className="dsh-qr-anchor" ref={anchorRef}>
      {!visible || geometry === null ? null : (
        <div
          className={'dsh-qr-rail' + (hover ? ' dsh-qr-rail-open' : '')}
          style={{ left: geometry.left + 'px', top: geometry.top + 'px', height: geometry.height + 'px' }}
          role="navigation"
          aria-label={ariaLabel}
          onMouseEnter={() => { setHover(true) }}
          onMouseLeave={() => { setHover(false) }}
        >
          <div className="dsh-qr-track">
            {questions.map((q, i) => (
              <div
                key={q.key}
                className="dsh-qr-tick"
                style={{ top: (((i + 0.5) / questions.length) * 100) + '%' }}
                onClick={() => { onJump(q.key) }}
              />
            ))}
          </div>
          {hover ? (
            <div className="dsh-qr-panel">
              <div className="dsh-qr-header">
                {t === undefined ? '我的问题（' + questions.length + '）' : t('panel.header', { count: questions.length })}
              </div>
              <div className="dsh-qr-sep" />
              <div className="dsh-qr-list" ref={listRef}>
                {questions.map(q => (
                  <button
                    key={q.key}
                    type="button"
                    className="dsh-qr-item"
                    onClick={() => { onJump(q.key) }}
                  >
                    <span className="dsh-qr-text">{q.text}</span>
                    <span className="dsh-qr-time">{formatTime(q.time)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
