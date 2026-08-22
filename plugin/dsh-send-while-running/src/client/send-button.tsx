/**
 * The extra Send button, browser half: one additive `conversation.input.right`
 * list entry rendered exactly while an ordinary session's turn is running and
 * the draft has content — the state where the stock composer primary has
 * flipped to Stop, leaving pointer users no visible way to queue a follow-up.
 * Clicking goes through the session standard kit's `inputActions.submit()`,
 * the same public path the stock Send button takes (queue delivery into the
 * running turn; the keyboard's busy-Enter preference is a gesture policy and
 * does not apply to button presses).
 */
import type { ReactElement } from 'react'
import type { InputFacts, SessionFacts } from './facts.ts'
import { sendButtonBusy, sendButtonVisible } from './facts.ts'

/** The stock composer send glyph (up arrow), mirrored 1:1. */
const ARROW_PATH = 'M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z'

/** Locale seat share (structural subset of the framework-injected t). */
type TranslateLabel = (key: 'send.label') => string

/**
 * Component props: the InputZone owner share (`session`, `input`) plus the
 * session standard kit's `inputActions` and the locale seat — all optional
 * structural subsets so the composed contract stays assignable; absent
 * shares render nothing (fail-invisible, never a crash).
 */
export interface SendWhileRunningProps {
  /** Point-in-time ConversationSnapshot share the slot dispatches with. */
  readonly session?: SessionFacts
  /** Point-in-time InputState share the slot dispatches with. */
  readonly input?: InputFacts
  /** The public input action face from the session standard kit. */
  readonly inputActions?: { submit(): void }
  /** Locale seat bound by the `locale:` registration option. */
  readonly t?: TranslateLabel
}

/** Fallback label when the locale seat is somehow absent. */
const FALLBACK_LABEL = 'Send message'

/**
 * The Send twin beside Stop.
 * @param props - owner share + standard kit + locale seat.
 * @returns the button element, or null whenever the visibility terms fail.
 */
export function SendWhileRunningButton(props: SendWhileRunningProps): ReactElement | null {
  const { session, input, inputActions, t } = props
  if (session === undefined || input === undefined || inputActions === undefined) return null
  if (!sendButtonVisible(session, input)) return null
  const label = t === undefined ? FALLBACK_LABEL : t('send.label')
  return (
    <button
      type="button"
      className="dsh-send-while-running"
      aria-label={label}
      title={label}
      disabled={sendButtonBusy(input.phase)}
      // Button presses steal focus from the textarea; suppress at mousedown
      // so typing continues seamlessly (the stock controls do the same).
      onMouseDown={(e) => { e.preventDefault() }}
      onClick={() => { inputActions.submit() }}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <path d={ARROW_PATH} fill="currentColor" />
      </svg>
    </button>
  )
}
