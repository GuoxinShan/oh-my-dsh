/**
 * dsh-send-while-running, browser half. Occupies the additive
 * `conversation.input.right` list seat (declared by ui-conversation's
 * conversation entry) with one extra Send button that appears exactly while
 * an ordinary session's turn is running and the draft has content — the
 * state where the stock composer primary has flipped to Stop. No desktop
 * gate: terminal `dsh web`, plain browsers, and the desktop shell all get
 * the same composer. Effects are reversible and collected by this fiber.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls ui-conversation's SlotMap declarations (the
// 'conversation.input.right' list seat and the session standard kit) so the
// registration below typechecks against the real declaration — no runtime
// edge to ui-conversation.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { SendWhileRunningButton } from './send-button.tsx'
import { installSendWhileRunningCss } from './stylesheet.ts'
import { en, zh, type SendWhileRunningKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The send-while-running button labels. */
    'send-while-running': SendWhileRunningKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'send-while-running'

/** Required services: the slot registry (declaration-aware) and the locale registry. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: install the composer stylesheet, register the
 * dictionaries, and occupy the input.right seat.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => installSendWhileRunningCss(document), 'send-while-running: composer css')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'send-while-running: dictionaries')
  // slots.inject waits on the conversation entry's declaration (activation
  // order is unconstrained), reruns after redeclaration, and leaves with
  // this fiber; register's disposer is the injection effect.
  ctx.slots.inject('conversation.input.right', () =>
    ctx.slots.register(
      { name: 'conversation.input.right', id: 'send-while-running', order: 100, locale: NS },
      SendWhileRunningButton,
    ),
  )
}
