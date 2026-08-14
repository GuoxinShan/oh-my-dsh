/** MCP server configuration and live status registered into Web Settings. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from 'dsh-mcp-settings/remote'
import type { McpServerEntry } from './drafts.ts'
import { McpSettingsSection, type McpSettingsSectionInjected } from './McpSettingsSection.tsx'
import { en, zh, type McpSettingsLocaleKey } from './locales.ts'

export type { McpSettingsSectionInjected, McpSettingsSectionProps } from './McpSettingsSection.tsx'
export type { McpSettingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** MCP settings section copy. */
    'settings.mcp': McpSettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.mcp'

/** The `mcp` settings namespace this section edits (matches the manager's registration). */
export const MCP_SETTINGS_NS = 'mcp'

/** Services required by the Settings registration, the settings transport, and the status Remote. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'remote.mcpInventory', 'settingsScope']

/** Contribute the MCP server manager to the Settings panel. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-mcp: dictionaries')

  const t = ctx.locale.bind(NS)
  // Bound eagerly on this plugin's fiber: the scope's listeners and invalidation
  // subscriptions unload with the contribution, not with a component unmount.
  const scope = ctx.settingsScope.bind<{ servers: McpServerEntry[] }>({ namespace: MCP_SETTINGS_NS })
  const injected = (): McpSettingsSectionInjected => ({
    scope,
    listStatus: async () => {
      const result = await ctx.remote.mcpInventory.list()
      if (!result.ok) {
        throw new Error(`mcpInventory.list failed: ${result.error.code}: ${result.error.message}`)
      }
      return result.value
    },
    t: t,
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'mcp',
    order: 12,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, McpSettingsSection))
}
