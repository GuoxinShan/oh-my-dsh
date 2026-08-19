/**
 * Wire types shared by the gateway (Host) and the settings row (Client).
 *
 * @module dsh-web-search-toggle/toggle-types
 */

/** One snapshot of the native web_search tool's toggle and credential state. */
export interface WebSearchToggleSnapshot {
  /** Whether the tool-web row is enabled (native web_search registered). */
  enabled: boolean
  /** Whether the DeepSeek search credential resolves to a non-empty value. */
  keyConfigured: boolean
  /** The credential reference the answer describes, for display. */
  keyRef: string
}
