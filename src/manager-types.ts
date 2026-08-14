/**
 * Client-safe type surface of the MCP manager seam: the `mcp` settings-section
 * entry union and the merged status DTO read-only consumers project. Types
 * only — no runtime code, so the inventory Remote reuses these declarations
 * verbatim.
 *
 * @module dsh-mcp-settings/manager-types
 */

import type { ReconnectConfig } from '@deepseek-ai/dsh-mcp-client'

/** Connection phases emitted by the matching mcp-client supervisor. */
export type McpClientStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'disposed'

/** One stdio MCP server configured in the `mcp` settings section. */
export interface StdioMcpServerEntry {
  /** Selects child-process stdio transport. */
  readonly transport: 'stdio'
  /** Namespace for this server's model-facing tool names; unique within the section. */
  readonly serverName: string
  /** Whether the manager composes an mcp-client fiber for this entry. */
  readonly enabled: boolean
  /** Executable to spawn. */
  readonly command: string
  /** Arguments passed to the command. */
  readonly args: readonly string[]
  /** Extra env vars merged on top of scrubbed ambient env. */
  readonly env: Readonly<Record<string, string>>
  /** Working directory for the child process. */
  readonly cwd: string
  /** Per-tool-call timeout in milliseconds. */
  readonly toolCallTimeoutMs: number
  /** Automatic reconnect policy; omission uses the mcp-client defaults. */
  readonly reconnect?: ReconnectConfig
}

/** One Streamable HTTP MCP server configured in the `mcp` settings section. */
export interface HttpMcpServerEntry {
  /** Selects Streamable HTTP transport. */
  readonly transport: 'streamable-http'
  /** Namespace for this server's model-facing tool names; unique within the section. */
  readonly serverName: string
  /** Whether the manager composes an mcp-client fiber for this entry. */
  readonly enabled: boolean
  /** MCP endpoint URL. */
  readonly url: string
  /** Additional headers attached to MCP requests. */
  readonly headers: Readonly<Record<string, string>>
  /** Per-tool-call timeout in milliseconds. */
  readonly toolCallTimeoutMs: number
  /** Automatic reconnect policy; omission uses the mcp-client defaults. */
  readonly reconnect?: ReconnectConfig
}

/** One configured MCP server entry in the `mcp` settings section. */
export type McpServerEntry = StdioMcpServerEntry | HttpMcpServerEntry

/** Resolved shape of the `mcp` settings section. */
export interface McpSettings {
  /** Configured servers in document order; the manager composes each enabled entry. */
  readonly servers: readonly McpServerEntry[]
}

/**
 * Merged view of one configured server for read-only consumers: the settings
 * fields plus the live connection state observed from the server's supervisor.
 */
export interface McpServerStatus {
  readonly serverName: string
  readonly transport: 'stdio' | 'streamable-http'
  readonly enabled: boolean
  /** Live connection status, or null while disabled or never composed. */
  readonly connection: McpClientStatus | null
  /** Tools this server currently has registered on `ctx.tools`. */
  readonly toolCount: number
}
