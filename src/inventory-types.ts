/**
 * Client-safe payload vocabulary of the MCP inventory Remote. Types only —
 * the row shape is declared here (self-contained, like every other Remote
 * package's wire DTO) so the generated client contract never resolves past
 * this file into a Host implementation graph.
 *
 * @module dsh-mcp-settings/inventory-types
 */

/** Live connection phase of one composed server, as the supervisor commits it. */
export type McpConnectionPhase = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'disposed'

/**
 * Merged view of one configured server: the settings fields plus the live
 * connection state observed from the server's supervisor. `connection` is
 * `null` while the entry is disabled or never composed.
 */
export interface McpServerStatus {
  readonly serverName: string
  readonly transport: 'stdio' | 'streamable-http'
  readonly enabled: boolean
  readonly connection: McpConnectionPhase | null
  /** Tools this server currently has registered on `ctx.tools`. */
  readonly toolCount: number
}

/** Point-in-time inventory returned by the MCP inventory Remote. */
export interface McpInventorySnapshot {
  readonly servers: readonly McpServerStatus[]
}
