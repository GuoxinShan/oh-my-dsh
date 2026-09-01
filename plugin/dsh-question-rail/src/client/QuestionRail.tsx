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
  MAX_FILL_PAGES, RAIL_MAX_QUESTIONS, collectQuestions,
  railGeometry, railVisible, sameRailGeometry, shouldPanelPage,
  type RailGeometry, type RailQuestion, type RailSessionFace, type SessionLike,
} from './facts.ts'

/** Geometry poll cadence; each pass is one getBoundingClientRect pair. */
const MEASURE_INTERVAL_MS = 120
/** Jump-highlight duration, matching the flash animation. */
const FLASH_MS = 1600
/** Panel-top scroll threshold that triggers one older page. */
const PANEL_TOP_THRESHOLD_PX = 24

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
  const loadingOlderRef = useRef(false)
  const pendingPanelAdjust = useRef(0)

  // Chronological questions inside the current window. The collapsed rail
  // shows only the most recent RAIL_MAX_QUESTIONS ticks (user direction
  // 0.3.0); the expanded panel lists every question currently in the window
  // and pages older history on scroll-to-top (0.4.0).
  const allQuestions: readonly RailQuestion[] = collectQuestions(session, key => t === undefined ? '[图片或附件]' : t(key))
  const ticks = allQuestions.slice(-RAIL_MAX_QUESTIONS)
  const visible = railVisible(allQuestions.length)
  const ticksRef = useRef(ticks.length)
  ticksRef.current = ticks.length

  useEffect(() => {
    if (timers === undefined) return undefined
    const remeasure = () => {
      const anchor = anchorRef.current
      const body = findScrollBody()
      const next = body === null || anchor === null
        ? null
        : railGeometry(body.getBoundingClientRect(), anchor.getBoundingClientRect(), Math.max(ticksRef.current, 1))
      setGeometry(prev => (sameRailGeometry(prev, next) ? prev : next))
    }
    remeasure()
    return timers.interval(remeasure, MEASURE_INTERVAL_MS)
  }, [timers, allQuestions.length])

  // The drawer list stays mounted across hovers (cross-fade, persistent
  // scroll); only the FIRST expansion opens on the latest question.
  const didInitScrollRef = useRef(false)
  useEffect(() => {
    const list = listRef.current
    if (hover && list !== null && !didInitScrollRef.current) {
      didInitScrollRef.current = true
      list.scrollTop = list.scrollHeight
    }
  }, [hover])

  // Panel paging (0.4.0): scrolling the expanded list to its top edge pulls
  // one older page through the sanctioned SessionFace.loadOlder verb — user-
  // driven only, the mount path never pages, so the transcript's native lazy
  // rhythm stays untouched on open. The transcript's own prepend anchoring
  // keeps its scroll position stable while shared pages land.
  const onListScroll = () => {
    const list = listRef.current
    if (list === null || list.scrollTop > PANEL_TOP_THRESHOLD_PX || loadingOlderRef.current) return
    if (resolveFace === undefined || sessionId === undefined) return
    const face = resolveFace(sessionId)
    if (face === undefined || !shouldPanelPage(face.getSnapshot(), loadingOlderRef.current)) return
    loadingOlderRef.current = true
    pendingPanelAdjust.current = list.scrollHeight
    void face.loadOlder().finally(() => { loadingOlderRef.current = false })
  }

  // After an older page lands, push the panel's scrollTop down by the added
  // content height so the reader's row stays put (items prepend above).
  useEffect(() => {
    const list = listRef.current
    if (list !== null && pendingPanelAdjust.current > 0) {
      list.scrollTop += list.scrollHeight - pendingPanelAdjust.current
      pendingPanelAdjust.current = 0
    }
  }, [allQuestions.length])

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
  const slotPx = geometry === null ? 0 : geometry.height / Math.max(ticks.length, 1)
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
          <div className="dsh-qr-track" aria-hidden={hover}>
            {ticks.map((q, i) => (
              <div
                key={q.key}
                className="dsh-qr-tick"
                // Same grid as the rows below: tick i center === row i center.
                style={{ top: ((i + 0.5) * slotPx) + 'px' }}
                onClick={() => { onJump(q.key) }}
              />
            ))}
          </div>
          {/* Drawer layer: always mounted; width reveal + cross-fade (0.5.1). */}
          <div className="dsh-qr-list" ref={listRef} onScroll={onListScroll} aria-hidden={!hover}>
            {allQuestions.map(q => (
              <button
                key={q.key}
                type="button"
                className="dsh-qr-item"
                // One slot per question: row i sits at the exact Y of tick i.
                style={{ height: slotPx + 'px' }}
                tabIndex={hover ? 0 : -1}
                onClick={() => { onJump(q.key) }}
              >
                <span className="dsh-qr-text">{q.text}</span>
                <span className="dsh-qr-time">{formatTime(q.time)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
