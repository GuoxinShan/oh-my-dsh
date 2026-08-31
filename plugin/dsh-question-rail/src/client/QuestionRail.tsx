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
  collectQuestions, railGeometry, railVisible, sameRailGeometry,
  type RailGeometry, type RailQuestion, type SessionLike,
} from './facts.ts'

/** Geometry poll cadence; each pass is one getBoundingClientRect pair. */
const MEASURE_INTERVAL_MS = 120
/** Jump-highlight duration, matching the flash animation. */
const FLASH_MS = 1600

/** Locale seat share (structural subset of the framework-injected t). */
type RailTranslate = (key: QuestionRailKey, params?: Record<string, unknown>) => string

/** Lifecycle-safe timer faces, bound from the apply closure's ctx. */
export interface RailTimers {
  readonly interval: (callback: () => void, delay: number) => () => void
  readonly timeout: (callback: () => void, delay: number) => () => void
}

/**
 * Component props: the InputZone owner share (`session`) plus the apply-bound
 * timers and the locale seat — all optional structural subsets so the
 * composed contract stays assignable; absent shares render the bare anchor
 * (fail-invisible, never a crash).
 */
export interface QuestionRailProps {
  /** Point-in-time ConversationSnapshot share the slot dispatches with. */
  readonly session?: SessionLike
  /** Apply-closure timer faces (ctx.interval / ctx.timeout). */
  readonly timers?: RailTimers
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
  const { session, timers, t } = props
  const [hover, setHover] = useState(false)
  const [geometry, setGeometry] = useState<RailGeometry | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const questions: readonly RailQuestion[] = collectQuestions(session, key => t === undefined ? '[图片或附件]' : t(key))
  const visible = railVisible(questions.length)

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

  const jump = (key: string) => {
    const body = findScrollBody()
    if (body === null) return
    const row = findRow(body, key)
    if (row === null) return
    row.scrollIntoView({ behavior: 'smooth', block: 'start' })
    row.classList.add('dsh-qr-flash')
    timers?.timeout(() => { row.classList.remove('dsh-qr-flash') }, FLASH_MS)
  }

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
                onClick={() => { jump(q.key) }}
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
                    onClick={() => { jump(q.key) }}
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
