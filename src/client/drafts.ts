/**
 * Browser-local draft model for editing the `mcp` settings section. Types
 * only — the stored-entry wire shape is declared here (self-contained; the
 * Host settings schema owns its validation) and the draft keeps editable
 * fields as strings so a half-typed form stays representable until submit.
 *
 * @module dsh-mcp-settings/client
 */


/** Wire shape of one stored stdio entry in the `mcp` settings section. */
export interface StdioMcpEntry {
  readonly transport: 'stdio'
  readonly serverName: string
  readonly enabled: boolean
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly cwd: string
  readonly toolCallTimeoutMs: number
}

/** Wire shape of one stored Streamable HTTP entry. */
export interface HttpMcpEntry {
  readonly transport: 'streamable-http'
  readonly serverName: string
  readonly enabled: boolean
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly toolCallTimeoutMs: number
}

/** Wire shape of one stored entry; the Host schema owns its validation. */
export type McpServerEntry = StdioMcpEntry | HttpMcpEntry

/** Editable transport selector values. */
export type McpTransport = 'stdio' | 'streamable-http'

/**
 * One server row under edit. Numeric and map fields stay textual while the
 * form holds them; `reconnect` is intentionally not edited here — the
 * manager's defaults apply unless the document carries an override.
 */
export interface McpServerDraft {
  readonly key: string
  serverName: string
  transport: McpTransport
  enabled: boolean
  command: string
  args: string
  env: string
  cwd: string
  url: string
  headers: string
}

/** Default blank draft with a stable identity for React keys.
 * @returns a stdio-transport draft with every field empty.
 */
export function blankDraft(): McpServerDraft {
  return {
    key: crypto.randomUUID(),
    serverName: '',
    transport: 'stdio',
    enabled: true,
    command: '',
    args: '',
    env: '',
    cwd: '',
    url: '',
    headers: '',
  }
}

/** Format one JSON-ish map field (`env`/`headers`) from a stored record.
 * @param value - the stored string-to-string record, or undefined when absent.
 * @returns pretty-printed JSON, or an empty string for an absent or empty record.
 */
export function mapToText(value: Readonly<Record<string, string>> | undefined): string {
  if (value === undefined || Object.keys(value).length === 0) return ''
  return JSON.stringify(value, null, 2)
}

/** Parse one edited map field back to a record.
 * @param text - the edited field text; blank means an empty record.
 * @returns the parsed record, or a stable error kind for invalid JSON or shape.
 */
export function mapFromText(text: string): { value: Record<string, string> } | { error: string } {
  const trimmed = text.trim()
  if (trimmed === '') return { value: {} }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { error: 'invalidShape' }
    }
    const value: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== 'string') return { error: 'invalidValue' }
      value[k] = v
    }
    return { value }
  } catch {
    return { error: 'invalidJson' }
  }
}

/** Parse the space-separated args field into the entry's argument array.
 * @param text - the edited args text; blank means no arguments.
 * @returns the argument tokens in order.
 */
export function argsFromText(text: string): string[] {
  const trimmed = text.trim()
  return trimmed === '' ? [] : trimmed.split(/\s+/)
}

/** Project one stored entry into an editable draft.
 * @param entry - the stored wire entry to edit.
 * @param key - the stable React key for the row.
 * @returns the editable draft with map fields rendered as text.
 */
export function draftFromEntry(entry: McpServerEntry, key: string): McpServerDraft {
  const base: McpServerDraft = {
    key,
    serverName: entry.serverName,
    transport: entry.transport,
    enabled: entry.enabled,
    command: '',
    args: '',
    env: '',
    cwd: '',
    url: '',
    headers: '',
  }
  return entry.transport === 'stdio'
    ? {
      ...base,
      command: entry.command,
      args: entry.args.join(' '),
      env: mapToText(entry.env),
      cwd: entry.cwd,
    }
    : {
      ...base,
      url: entry.url,
      headers: mapToText(entry.headers),
    }
}

/** Draft validation outcome for the pre-submit check. */
export interface DraftIssues {
  /** The serverName field, when it duplicates another row. */
  readonly duplicateName?: string
  /** Field-level messages keyed by draft field. */
  readonly fields: Readonly<Record<string, string>>
}

/**
 * Validate the drafts before submit. Only locally decidable rules run here —
 * serverName shape and reconnect bounds belong to the host schema and come
 * back as the mutate call's error result.
 * @param drafts - every row under edit.
 * @returns per-row issues keyed by draft key; rows without issues are absent.
 */
export function validateDrafts(drafts: readonly McpServerDraft[]): Map<string, DraftIssues> {
  const seen = new Map<string, string>()
  const issues = new Map<string, DraftIssues>()
  for (const draft of drafts) {
    const fields: Record<string, string> = {}
    if (draft.serverName.trim() === '') fields.serverName = 'required'
    const name = draft.serverName.trim()
    if (name !== '') {
      const firstKey = seen.get(name)
      if (firstKey !== undefined) {
        fields.serverName = 'duplicate'
        if (!issues.has(firstKey)) issues.set(firstKey, { duplicateName: name, fields: {} })
      } else {
        seen.set(name, draft.key)
      }
    }
    if (draft.transport === 'stdio' && draft.command.trim() === '') fields.command = 'required'
    if (draft.transport === 'streamable-http' && draft.url.trim() === '') fields.url = 'required'
    if (Object.keys(fields).length > 0) issues.set(draft.key, { fields })
  }
  return issues
}
