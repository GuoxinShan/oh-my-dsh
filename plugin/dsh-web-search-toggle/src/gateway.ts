/**
 * Host gateway serving the web_search toggle over the Typert Remote seam.
 *
 * `get` projects the toggle state plus whether the DeepSeek search credential
 * resolves; `set` rewrites the managed block in the home patch file, whose
 * live watcher re-composes the tree so the row's next fiber reflects the
 * toggle without a restart. The tool row itself stays owned by the harness
 * composition — this gateway only edits the user patch layer, exactly as a
 * hand edit would.
 *
 * @module dsh-web-search-toggle/gateway
 */

import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef, } from '@deepseek-ai/dsh-credentials'
import { settingsNamespace, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { toggleStateFromText, withToggleEntry } from './patch-file.ts'
import type { WebSearchToggleSnapshot } from './toggle-types.ts'

/** Default credential reference web-search-deepseek resolves. */
const DEFAULT_KEY_REF = 'DEEPSEEK_API_KEY'

/** The settings namespace carrying the search provider's section. */
const WEB_SEARCH_NS: SettingsNamespace = settingsNamespace('web-search-deepseek')

/**
 * Resolve the home patch file path exactly like the harness's `homePatchPath`:
 * `$DSH_HOME/cordis.patch.yml`, defaulting to `~/.dsh`.
 * @param env - environment to read; injectable for tests.
 * @returns the absolute path of the home patch layer.
 */
export function homePatchPath(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.DSH_HOME !== undefined && env.DSH_HOME !== ''
    ? env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(root, 'cordis.patch.yml')
}

/** Read the patch file's text, mapping absence to undefined. */
async function readPatchText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return undefined
    throw error
  }
}

/** Remote-only gateway for the native web_search toggle. */
export class WebSearchToggleGateway extends TypertRemoteService {
  static inject = ['settings', 'credentials']

  constructor(ctx: Context) {
    super(ctx, 'webSearchToggle')
  }

  /**
   * Project the toggle and credential state.
   * @returns one snapshot for the settings row.
   */
  @Remote('get')
  async get(): Promise<WebSearchToggleSnapshot> {
    const text = await readPatchText(homePatchPath())
    return {
      enabled: toggleStateFromText(text),
      ...(await this.keyState()),
    }
  }

  /**
   * Flip the toggle by rewriting the managed block; the file's live watcher
   * re-composes the composition, so the change applies without a restart.
   * @param params - the requested state.
   * @returns the snapshot after the write.
   */
  @Remote('set')
  async set(params: { enabled: boolean }): Promise<WebSearchToggleSnapshot> {
    const path = homePatchPath()
    const text = await readPatchText(path)
    const next = withToggleEntry(text, params.enabled)
    if (next !== text) await writeFile(path, next, 'utf8')
    return {
      enabled: toggleStateFromText(next),
      ...(await this.keyState()),
    }
  }

  /** Resolve the search credential the provider would use, mirroring its order. */
  private async keyState(): Promise<Pick<WebSearchToggleSnapshot, 'keyConfigured' | 'keyRef'>> {
    const section = this.ctx.settings.get(WEB_SEARCH_NS) as
      | { apiKey?: unknown; apiKeyEnv?: unknown }
      | undefined
    const literal = typeof section?.apiKey === 'string' && section.apiKey.length > 0
      ? section.apiKey
      : undefined
    const ref = typeof section?.apiKeyEnv === 'string' && section.apiKeyEnv.length > 0
      ? section.apiKeyEnv
      : DEFAULT_KEY_REF
    if (literal !== undefined) return { keyConfigured: true, keyRef: ref }
    try {
      const hit = await this.ctx.credentials.resolve(credentialRef(ref))
      return { keyConfigured: (hit?.value?.length ?? 0) > 0, keyRef: ref }
    } catch {
      // A refusal answers nothing; the row shows "not configured" and the
      // toggle keeps working — the credential hint is advisory, not a gate.
      return { keyConfigured: false, keyRef: ref }
    }
  }
}

export default WebSearchToggleGateway
