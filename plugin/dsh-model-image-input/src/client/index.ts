/**
 * dsh-model-image-input, browser half. Contributes an "Image input" page to
 * the Web Settings panel: every pi-ai route whose user layer owns a `models`
 * array (custom-provider catalogs) lists its rows with a tri-state modality
 * picker; saves land as whole-array `settings.mutate` ops on the `llm-pi-ai`
 * namespace — the same write path the stock Models editor uses — so they take
 * effect immediately and refresh every settings surface (a successful write
 * publishes the Host's settings/document-updated, which reloads the shared
 * describe mirror this section's scope derives from).
 *
 * The capability itself already lives in the harness: pi-ai materializes
 * `models[].input` declarations and the API proxy refuses image attachments
 * for models without `image` in them. This plugin only supplies the missing
 * editing surface; it reads and writes settings exclusively through ctx
 * services and never patches harness behavior.
 */
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ConnectionHandle, SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { ModelImageSection, type ModelImageSectionInjected } from './ModelImageSection.tsx'
import type { ModelPathOp, PiAiUserSection } from './drafts.ts'
import { en, zh, type ModelImageLocaleKey } from './locales.ts'
import { injectStyles } from './styles.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Image-input settings section copy. */
    'settings.modelImage': ModelImageLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.modelImage'

/** The `llm-pi-ai` settings namespace this section edits. */
export const PI_AI_NS = 'llm-pi-ai'

/** Required services: the slot registry, locale, the settings scope binder, and the RPC connection. */
export const inject = ['slots', 'locale', 'settingsScope', 'connection']

/**
 * Client plugin body: register dictionaries, bind the namespace scope, and
 * contribute the section to the Settings panel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-model-image: dictionaries')

  const t = ctx.locale.bind(NS)
  const scope = ctx.settingsScope.bind<PiAiUserSection>({ namespace: PI_AI_NS })
  const connection = ctx.get('connection') as ConnectionHandle

  const mutate = async (ops: readonly ModelPathOp[], expectedRevision: number | undefined): Promise<void> => {
    const payload: { ns: string; ops: SettingsPathOpView[]; expectedRevision?: number } = {
      ns: PI_AI_NS,
      ops: [...ops],
    }
    if (expectedRevision !== undefined) payload.expectedRevision = expectedRevision
    const response = await connection.api.settings.mutate(payload)
    if (!response.result.ok) throw new Error(response.result.error.message)
  }

  ctx.effect(() => injectStyles(), 'ui-model-image: styles')

  const injected = (): ModelImageSectionInjected => ({ scope, mutate, t })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'model-image-input',
    order: 13,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, ModelImageSection))
}
