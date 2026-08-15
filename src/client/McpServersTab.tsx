import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { McpInventorySnapshot, McpServerStatus } from '../inventory-types.ts'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  Button,
  IconChevronLeftOutline14,
  IconEditOutline16,
  IconLoadingOutline16,
  IconPlusOutline16,
  IconRefreshOutline16,
  IconSearchOutline16,
  IconTrashOutline16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { IconPlugOutline16 } from './IconPlug.tsx'
import type { TranslateSection } from './McpSettingsSection.tsx'
import type { McpSettingsLocaleKey } from './locales.ts'
import {
  argsFromText,
  type McpServerEntry,
  blankDraft,
  draftFromEntry,
  mapFromText,
  type McpServerDraft,
  validateDrafts,
} from './drafts.ts'
import css from './McpSettingsSection.module.css'

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'
type EditorMode = 'form' | 'json'

const CONNECTION_POLL_INTERVAL_MS = 2_000
const CONNECTION_POLL_LIMIT = 30

interface EditorState {
  readonly index: number | null
  readonly draft: McpServerDraft
  readonly mode: EditorMode
  readonly json: string
  readonly attempted: boolean
}

const CONNECTION_KEYS = {
  connecting: 'connectionConnecting',
  connected: 'connectionConnected',
  reconnecting: 'connectionReconnecting',
  failed: 'connectionFailed',
  disposed: 'connectionDisposed',
} satisfies Record<Exclude<McpServerStatus['connection'], null>, McpSettingsLocaleKey>

function connectionLabel(server: McpServerEntry, status: McpServerStatus | undefined, t: TranslateSection): string {
  if (!server.enabled) return t('connectionDisabled')
  if (status?.connection == null) return t('connectionConnecting')
  return t(CONNECTION_KEYS[status.connection])
}

function validMap(text: string): Record<string, string> {
  const parsed = mapFromText(text)
  return 'value' in parsed ? parsed.value : {}
}

function entryFromDraft(draft: McpServerDraft): McpServerEntry {
  const shared = { serverName: draft.serverName.trim(), enabled: draft.enabled, toolCallTimeoutMs: 60_000 }
  return draft.transport === 'stdio'
    ? {
      transport: 'stdio',
      ...shared,
      command: draft.command.trim(),
      args: argsFromText(draft.args),
      env: validMap(draft.env),
      cwd: draft.cwd.trim(),
    }
    : {
      transport: 'streamable-http',
      ...shared,
      url: draft.url.trim(),
      headers: validMap(draft.headers),
    }
}

function jsonFromDraft(draft: McpServerDraft): string {
  const name = draft.serverName.trim() || 'my-mcp-server'
  const config = draft.transport === 'stdio'
    ? {
      type: 'stdio',
      command: draft.command,
      args: argsFromText(draft.args),
      env: validMap(draft.env),
      cwd: draft.cwd,
      enabled: draft.enabled,
    }
    : {
      type: 'streamable-http',
      url: draft.url,
      headers: validMap(draft.headers),
      enabled: draft.enabled,
    }
  return JSON.stringify({ [name]: config }, null, 2)
}

/** Parse one-server JSON editor text into a form draft.
 * @param text - complete one-server MCP JSON object.
 * @param key - stable draft identity retained across editor modes.
 * @returns the parsed draft, or null when the document is not a supported one-server configuration.
 */
export function draftFromJson(text: string, key: string): McpServerDraft | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const rows = Object.entries(parsed)
    if (rows.length !== 1) return null
    const [serverName, raw] = rows[0]!
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
    const config = raw as Record<string, unknown>
    const type = config.type ?? config.transport
    const enabled = typeof config.enabled === 'boolean' ? config.enabled : true
    if (type === 'stdio') {
      if (typeof config.command !== 'string') return null
      if (config.args !== undefined && (!Array.isArray(config.args) || config.args.some(value => typeof value !== 'string'))) return null
      if (config.env !== undefined && !isStringMap(config.env)) return null
      if (config.cwd !== undefined && typeof config.cwd !== 'string') return null
      return {
        ...blankDraft(), key, serverName, transport: 'stdio', enabled,
        command: config.command,
        args: Array.isArray(config.args) ? config.args.join(' ') : '',
        env: config.env === undefined ? '' : JSON.stringify(config.env, null, 2),
        cwd: typeof config.cwd === 'string' ? config.cwd : '',
      }
    }
    if (type === 'streamable-http') {
      if (typeof config.url !== 'string') return null
      if (config.headers !== undefined && !isStringMap(config.headers)) return null
      return {
        ...blankDraft(), key, serverName, transport: 'streamable-http', enabled,
        url: config.url,
        headers: config.headers === undefined ? '' : JSON.stringify(config.headers, null, 2),
      }
    }
    return null
  } catch {
    return null
  }
}

function isStringMap(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every(item => typeof item === 'string')
}

function summary(entry: McpServerEntry): string {
  return entry.transport === 'stdio'
    ? [entry.command, ...entry.args].join(' ')
    : entry.url
}

/** List, create, edit, toggle, delete, and inspect settings-owned MCP servers. */
export function McpServersTab(props: {
  scope: SettingsScope<{ servers: McpServerEntry[] }>
  listStatus: () => Promise<McpInventorySnapshot>
  t: TranslateSection
}): ReactNode {
  const { scope, listStatus, t } = props
  const snapshot = useSyncExternalStore(scope.subscribe.bind(scope), scope.getSnapshot.bind(scope))
  const [servers, setServers] = useState<McpServerEntry[]>([])
  const [hydratedFrom, setHydratedFrom] = useState<object | undefined>()
  const [query, setQuery] = useState('')
  const [save, setSave] = useState<SaveState>('idle')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [inventory, setInventory] = useState<McpInventorySnapshot | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusFailed, setStatusFailed] = useState(false)
  const [connectionPollsRemaining, setConnectionPollsRemaining] = useState(CONNECTION_POLL_LIMIT)

  const refreshStatus = useCallback((): void => {
    setStatusLoading(true)
    setStatusFailed(false)
    void listStatus().then(
      (next) => {
        setInventory(next)
        setStatusLoading(false)
      },
      () => {
        setStatusFailed(true)
        setStatusLoading(false)
      },
    )
  }, [listStatus])

  useEffect(() => { refreshStatus() }, [refreshStatus])

  useEffect(() => {
    if (snapshot.value === undefined || hydratedFrom === snapshot.value) return
    setHydratedFrom(snapshot.value)
    setServers([...snapshot.value.servers])
  }, [hydratedFrom, snapshot.value])

  const waitingForConnection = servers.some((server) => {
    if (!server.enabled) return false
    return inventory?.servers.find(item => item.serverName === server.serverName)?.connection !== 'connected'
  })

  useEffect(() => {
    if (!waitingForConnection || statusLoading || connectionPollsRemaining === 0) return
    const timer = setTimeout(() => {
      setConnectionPollsRemaining(remaining => remaining - 1)
      refreshStatus()
    }, CONNECTION_POLL_INTERVAL_MS)
    return () => { clearTimeout(timer) }
  }, [connectionPollsRemaining, refreshStatus, statusLoading, waitingForConnection])

  const persist = (next: McpServerEntry[], awaitConnection = false): void => {
    setServers(next)
    setSave('saving')
    if (awaitConnection) {
      setInventory(null)
      setConnectionPollsRemaining(0)
    }
    void scope.set('servers', next).then(
      () => {
        setSave('saved')
        if (awaitConnection) setConnectionPollsRemaining(CONNECTION_POLL_LIMIT)
        refreshStatus()
      },
      () => {
        setConnectionPollsRemaining(0)
        setSave('failed')
      },
    )
  }

  if (snapshot.status === 'unavailable') return <p className={css.status}>{t('writeUnavailable')}</p>
  if (snapshot.value === undefined) return <p className={css.status}>{t('loadFailed')}</p>

  if (editor !== null) {
    const parsedJson = editor.mode === 'json' ? draftFromJson(editor.json, editor.draft.key) : editor.draft
    const draft = parsedJson ?? editor.draft
    const validationRows = servers
      .filter((_server, index) => index !== editor.index)
      .map((entry, index) => draftFromEntry(entry, `existing-${index}`))
    validationRows.push(draft)
    const issues = validateDrafts(validationRows).get(draft.key)
    const mapText = draft.transport === 'stdio' ? draft.env : draft.headers
    const mapInvalid = mapText.trim() !== '' && 'error' in mapFromText(mapText)
    const invalid = parsedJson === null || issues !== undefined || mapInvalid
    const update = (patch: Partial<McpServerDraft>): void => {
      const nextDraft = { ...editor.draft, ...patch }
      setEditor({ ...editor, draft: nextDraft, json: jsonFromDraft(nextDraft) })
    }
    const selectMode = (mode: EditorMode): void => {
      if (mode === 'form') {
        const nextDraft = draftFromJson(editor.json, editor.draft.key)
        if (nextDraft === null) return
        setEditor({ ...editor, mode, draft: nextDraft })
      } else {
        setEditor({ ...editor, mode, json: jsonFromDraft(editor.draft) })
      }
    }
    const submit = (): void => {
      if (invalid) {
        setEditor({ ...editor, attempted: true })
        return
      }
      const next = [...servers]
      const entry = entryFromDraft(draft)
      if (editor.index === null) next.push(entry)
      else next[editor.index] = entry
      persist(next, entry.enabled)
      setEditor(null)
    }

    return (
      <div className={css.editor}>
        <div className={css.editorHeader}>
          <button type="button" className={css.back} onClick={() => { setEditor(null) }}>
            <IconChevronLeftOutline14 size={14} />
            {t('back')}
          </button>
          <div className={css.editorHeading}>
            <div>
              <h3>{editor.index === null ? t('createTitle') : t('editTitle')}</h3>
              <p>{editor.index === null ? t('createDescription') : t('editDescription')}</p>
            </div>
            <div className={css.segmented} role="tablist" aria-label={t('editorMode')}>
              <button type="button" role="tab" aria-selected={editor.mode === 'form'} onClick={() => { selectMode('form') }}>{t('formMode')}</button>
              <button type="button" role="tab" aria-selected={editor.mode === 'json'} onClick={() => { selectMode('json') }}>{t('jsonMode')}</button>
            </div>
          </div>
        </div>

        {editor.mode === 'json' ? (
          <label className={css.jsonField}>
            <span>{t('fullConfiguration')}</span>
            <textarea value={editor.json} spellCheck={false} aria-invalid={parsedJson === null} onChange={(event) => { setEditor({ ...editor, json: event.currentTarget.value }) }} />
            {parsedJson === null ? <em>{t('invalidServerJson')}</em> : null}
          </label>
        ) : (
          <div className={css.formSurface}>
            <div className={css.formTopRow}>
              <label className={css.field}>
                <span>{t('serverName')}<b className={css.requiredMark} aria-hidden="true">*</b></span>
                <input required aria-label={t('serverName')} value={editor.draft.serverName} aria-invalid={editor.attempted && issues?.fields.serverName !== undefined} onChange={(event) => { update({ serverName: event.currentTarget.value }) }} />
                {editor.attempted && issues?.fields.serverName === 'duplicate' ? <em>{t('duplicate')}</em> : null}
              </label>
              <label className={css.field}>
                <span>{t('transport')}</span>
                <select value={editor.draft.transport} onChange={(event) => { update({ transport: event.currentTarget.value as McpServerDraft['transport'] }) }}>
                  <option value="stdio">{t('transportStdio')}</option>
                  <option value="streamable-http">{t('transportHttp')}</option>
                </select>
              </label>
            </div>
            {editor.draft.transport === 'stdio' ? (
              <>
                <label className={css.field}><span>{t('command')}<b className={css.requiredMark} aria-hidden="true">*</b></span><input required aria-label={t('command')} value={editor.draft.command} aria-invalid={editor.attempted && issues?.fields.command !== undefined} onChange={(event) => { update({ command: event.currentTarget.value }) }} /></label>
                <label className={css.field}><span>{t('args')}</span><input value={editor.draft.args} onChange={(event) => { update({ args: event.currentTarget.value }) }} /></label>
                <label className={css.field}><span>{t('cwd')}</span><input value={editor.draft.cwd} onChange={(event) => { update({ cwd: event.currentTarget.value }) }} /></label>
                <label className={css.field}><span>{t('env')}</span><textarea rows={7} value={editor.draft.env} aria-invalid={mapInvalid} onChange={(event) => { update({ env: event.currentTarget.value }) }} />{mapInvalid ? <em>{t('invalidJson')}</em> : null}</label>
              </>
            ) : (
              <>
                <label className={css.field}><span>{t('url')}<b className={css.requiredMark} aria-hidden="true">*</b></span><input required aria-label={t('url')} value={editor.draft.url} aria-invalid={editor.attempted && issues?.fields.url !== undefined} onChange={(event) => { update({ url: event.currentTarget.value }) }} /></label>
                <label className={css.field}><span>{t('headers')}</span><textarea rows={7} value={editor.draft.headers} aria-invalid={mapInvalid} onChange={(event) => { update({ headers: event.currentTarget.value }) }} />{mapInvalid ? <em>{t('invalidJson')}</em> : null}</label>
              </>
            )}
          </div>
        )}
        <div className={css.editorActions}>
          {editor.attempted && invalid ? <p className={css.validationSummary} role="alert">{t('fixValidation')}</p> : null}
          <Button variant="primary" size="sm" disabled={save === 'saving'} onClick={submit}>{t('save')}</Button>
          <Button variant="ghost" size="sm" onClick={() => { setEditor(null) }}>{t('cancel')}</Button>
        </div>
      </div>
    )
  }

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = servers.filter(server => `${server.serverName} ${summary(server)}`.toLocaleLowerCase().includes(normalizedQuery))
  const openEditor = (index: number | null): void => {
    const draft = index === null ? blankDraft() : draftFromEntry(servers[index]!, `edit-${servers[index]!.serverName}`)
    setEditor({ index, draft, mode: 'form', json: jsonFromDraft(draft), attempted: false })
  }

  return (
    <div className={css.pane}>
      <div className={css.toolbar}>
        <label className={css.search}>
          <IconSearchOutline16 aria-hidden="true" />
          <span className={css.visuallyHidden}>{t('searchServers')}</span>
          <input type="search" value={query} placeholder={t('searchServers')} onChange={(event) => { setQuery(event.currentTarget.value) }} />
        </label>
        <Tooltip label={t('refresh')} side="top">
          <button type="button" className={css.iconButton} aria-label={t('refresh')} disabled={statusLoading} onClick={refreshStatus}>
            <IconRefreshOutline16 size={15} />
          </button>
        </Tooltip>
        <Button variant="toolbar" size="sm" icon={<IconPlusOutline16 size={14} />} onClick={() => { openEditor(null) }}>{t('addServer')}</Button>
      </div>
      <div className={css.listHeading}>
        <h3>{t('configuredServers')}</h3><span>{t('serverCount', { count: String(servers.length) })}</span>
        {statusFailed ? <span role="alert">{t('statusLoadFailed')}</span> : null}
      </div>
      {servers.length === 0 ? <p className={css.status}>{t('emptyServers')}</p> : null}
      {servers.length > 0 && filtered.length === 0 ? <p className={css.status}>{t('emptySearch')}</p> : null}
      {filtered.length > 0 ? (
        <ul className={css.serverList}>
          {filtered.map((server) => {
            const index = servers.indexOf(server)
            const live = inventory?.servers.find(item => item.serverName === server.serverName)
            const connection = server.enabled
              ? statusFailed ? 'failed' : live?.connection ?? 'connecting'
              : 'disabled'
            const connectionPending = connection === 'connecting' || connection === 'reconnecting'
            const connectionText = statusFailed && server.enabled
              ? t('connectionFailed')
              : connectionLabel(server, live, t)
            return (
              <li className={css.serverRow} key={server.serverName} data-enabled={server.enabled} data-connection={connection}>
                <div className={css.serverGlyph}><IconPlugOutline16 size={17} /></div>
                <div className={css.serverMain}>
                  <div className={css.serverTitle}>
                    {connectionPending
                      ? <span className={css.connectionSpinner} role="status" aria-label={connectionText}><IconLoadingOutline16 size={13} /></span>
                      : <span className={css.connectionDot} role="status" aria-label={connectionText} />}
                    <strong>{server.serverName}</strong>
                    <span className={css.transportTag}>{server.transport === 'stdio' ? t('transportStdio') : t('transportHttp')}</span>
                    {!connectionPending && connection !== 'connected' ? <span className={css.connectionLabel}>{connectionText}</span> : null}
                    {server.enabled && live?.connection === 'connected' ? <span className={css.toolTag}>{t('toolCount', { count: String(live.toolCount) })}</span> : null}
                  </div>
                  <code>{summary(server)}</code>
                </div>
                <div className={css.rowActions}>
                  <label className={css.switch}>
                    <input type="checkbox" checked={server.enabled} disabled={save === 'saving'} aria-label={t('toggleServer', { name: server.serverName })} onChange={() => { persist(servers.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: !item.enabled } : item), !server.enabled) }} />
                    <span />
                  </label>
                  <Tooltip label={t('editServer')} side="top"><button type="button" className={css.iconButton} aria-label={t('editServer')} onClick={() => { openEditor(index) }}><IconEditOutline16 size={15} /></button></Tooltip>
                  <Tooltip label={t('removeServer')} side="top"><button type="button" className={css.iconButton} aria-label={t('removeServer')} onClick={() => { persist(servers.filter((_item, itemIndex) => itemIndex !== index)) }}><IconTrashOutline16 size={15} /></button></Tooltip>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
      <div className={css.saveStatus} aria-live="polite">
        {save === 'saving' ? t('saving') : null}
        {save === 'saved' ? t('saved') : null}
        {save === 'failed' ? <span role="alert">{t('saveFailed', { message: '' }).replace(': ', '')}</span> : null}
      </div>
    </div>
  )
}
