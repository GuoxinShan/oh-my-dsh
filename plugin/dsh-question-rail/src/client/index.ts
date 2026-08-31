/**
 * dsh-question-rail, browser half. Mounts the question rail through the
 * additive `conversation.input.dock` list seat (declared by ui-conversation's
 * conversation entry): once a session holds at least six of the user's own
 * messages, an evenly-ticked ruler floats at the conversation's left edge,
 * vertically centered; hovering expands it into a scrollable list, and
 * clicking a tick or a row smooth-scrolls the transcript to that message
 * with a brief highlight. No desktop gate: terminal `dsh web`, plain
 * browsers, and the desktop shell all get the same rail. Effects are
 * reversible and collected by this fiber.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls ui-conversation's SlotMap declarations (the
// 'conversation.input.dock' list seat and its InputZone owner share) so the
// registration below typechecks against the real declaration — no runtime
// edge to ui-conversation.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { QuestionRailDock, type RailTimers } from './QuestionRail.tsx'
import { installQuestionRailCss } from './stylesheet.ts'
import { en, zh, type QuestionRailKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The question rail's copy. */
    'question-rail': QuestionRailKey
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Timer mixin members, merged identically by the client timer Service
     *  (cordis-client-runner); redeclared here so this package typechecks
     *  without importing the runner. */
    interval(callback: () => void, delay: number): () => void
    timeout(callback: () => void, delay: number): () => void
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'question-rail'

/** Required services: the slot registry (declaration-aware), the locale
 *  registry, and the timer Service whose mixin the rail polls/flashes with. */
export const inject = ['slots', 'locale', 'timer']

/**
 * Client plugin body: install the rail stylesheet, register the dictionaries,
 * and occupy the input.dock seat with the rail anchor.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => installQuestionRailCss(document), 'dsh-question-rail: css')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-question-rail: dictionaries')
  const timers: RailTimers = {
    interval: (callback, delay) => (ctx as Context).interval(callback, delay),
    timeout: (callback, delay) => (ctx as Context).timeout(callback, delay),
  }
  /** Registration-stable component closure binding the fiber's timers. */
  function QuestionRailDockWithTimers(props: Omit<Parameters<typeof QuestionRailDock>[0], 'timers'>) {
    return QuestionRailDock({ ...props, timers })
  }
  // slots.inject waits on the conversation entry's declaration (activation
  // order is unconstrained), reruns after redeclaration, and leaves with
  // this fiber; register's disposer is the injection effect.
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'question-rail', order: 30, locale: NS },
      QuestionRailDockWithTimers,
    ),
  )
}
