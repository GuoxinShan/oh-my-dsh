/** Configuration schema and validated defaults for hierarchical compaction. */

import z from '@deepseek-ai/schemastery'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'
import type { BasicCompactionConfig } from '@deepseek-ai/dsh-compaction-basic'

/** Additional policy fields owned by the hierarchical summarizer. */
export interface HierarchicalCompactionConfig extends BasicCompactionConfig {
  /** Fraction of the summary model context available to each auxiliary call input. */
  chunkInputRatio?: number
  /** Maximum generated tokens for one map call. */
  mapMaxTokens?: number
  /** Maximum generated tokens for one reduce call. */
  reduceMaxTokens?: number
  /** Maximum recursive reduce rounds after the map stage. */
  maxDepth?: number
  /** Replay the conversation tool schemas into map and reduce calls. */
  replayTools?: boolean
}

/** Fully resolved hierarchical-only policy. */
export interface ResolvedHierarchyConfig {
  readonly chunkInputRatio: number
  readonly mapMaxTokens: number
  readonly reduceMaxTokens: number
  readonly maxDepth: number
  readonly replayTools: boolean
}

/** Loader schema retaining every basic policy field and adding hierarchy controls. */
export const Config = z.intersect([
  BasicCompactionEngine.Config,
  z.object({
    chunkInputRatio: z.number().min(0.1).max(0.9),
    mapMaxTokens: z.number().step(1).min(1),
    reduceMaxTokens: z.number().step(1).min(1),
    maxDepth: z.number().step(1).min(1).max(8),
    replayTools: z.boolean(),
  }),
]) as unknown as z<HierarchicalCompactionConfig>

/**
 * Remove subclass-only fields before stock basic config validation.
 * @param config - complete hierarchical plugin configuration.
 * @returns the exact field set accepted by BasicCompactionEngine.
 */
export function basicConfig(
  config: HierarchicalCompactionConfig,
): BasicCompactionConfig {
  const base = { ...config }
  delete base.chunkInputRatio
  delete base.mapMaxTokens
  delete base.reduceMaxTokens
  delete base.maxDepth
  delete base.replayTools
  return base
}

/**
 * Validate and materialize hierarchy policy before any model call.
 * @param config - loader-validated plugin configuration.
 * @returns immutable hierarchy settings.
 */
export function resolveHierarchyConfig(
  config: HierarchicalCompactionConfig = {},
): ResolvedHierarchyConfig {
  const chunkInputRatio = config.chunkInputRatio ?? 0.6
  const mapMaxTokens = config.mapMaxTokens ?? 4096
  const reduceMaxTokens = config.reduceMaxTokens ?? 8192
  const maxDepth = config.maxDepth ?? 4
  const replayTools = config.replayTools ?? false

  if (!Number.isFinite(chunkInputRatio) || chunkInputRatio < 0.1 || chunkInputRatio > 0.9) {
    throw new Error('HierarchicalCompactionConfig: chunkInputRatio must be between 0.1 and 0.9')
  }
  assertPositiveInteger(mapMaxTokens, 'mapMaxTokens')
  assertPositiveInteger(reduceMaxTokens, 'reduceMaxTokens')
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 8) {
    throw new Error('HierarchicalCompactionConfig: maxDepth must be an integer from 1 through 8')
  }
  if (typeof replayTools !== 'boolean') {
    throw new Error('HierarchicalCompactionConfig: replayTools must be a boolean')
  }

  return Object.freeze({
    chunkInputRatio,
    mapMaxTokens,
    reduceMaxTokens,
    maxDepth,
    replayTools,
  })
}

/** Reject a non-positive or fractional generation cap. */
function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`HierarchicalCompactionConfig: ${field} must be a positive integer`)
  }
}
