/** Read-only projection of the MCP manager's merged server status. */

import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
// Type-only: pulls the ctx.mcpManager Context merge into this program.
import type {} from './manager.ts'
import type { McpInventorySnapshot, McpServerStatus } from './inventory-types.ts'

export type * from './inventory-types.ts'

/**
 * Remote-only service exposing the manager's merged status. Each call reads
 * the manager's current snapshot directly: the manager owns the registry and
 * its supervisor-fed updates, so a second cache here would only add another
 * lifecycle truth to keep synchronized. The manager's rows must satisfy this
 * package's wire rows structurally — the local assignment is the drift gate.
 */
export class McpInventoryGateway extends TypertRemoteService {
  static inject = ['mcpManager']

  constructor(ctx: Context) {
    super(ctx, 'mcpInventory')
  }

  /**
   * Read the manager at every call.
   * @returns one status row per configured server, disabled rows included.
   */
  @Remote('list')
  list(): McpInventorySnapshot {
    const servers: readonly McpServerStatus[] = this.ctx.mcpManager.snapshot()
    return { servers }
  }
}

export default McpInventoryGateway
