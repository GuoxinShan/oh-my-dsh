/** Pure tool-balanced grouping and greedy token-budget planning. */

import type { Message } from '@deepseek-ai/dsh-llm'

/** A selected message unit cannot fit one auxiliary model call. */
export class OversizedCompactionUnitError extends Error {
  override name = 'OversizedCompactionUnitError'
}

/** Callback matching the shared token meter's message estimator. */
export type EstimateMessage = (message: Message) => number

/**
 * Sum estimated tokens for an ordered message list.
 * @param messages - model-visible messages to price.
 * @param estimate - shared message estimator.
 * @returns non-negative estimated tokens.
 */
export function estimateMessages(
  messages: readonly Message[],
  estimate: EstimateMessage,
): number {
  return messages.reduce((total, message) => total + estimated(message, estimate), 0)
}

/**
 * Group messages into units whose boundaries never split tool calls from results.
 * @param messages - messages in provider order.
 * @returns balanced, non-empty units in the same order.
 */
export function toolBalancedUnits(messages: readonly Message[]): Message[][] {
  const units: Message[][] = []
  const pending = new Set<string>()
  let current: Message[] = []

  for (const message of messages) {
    current.push(message)
    for (const block of message.content) {
      switch (block.type) {
        case 'tool-call':
          if (pending.has(block.id)) {
            throw new Error(`hierarchical compaction: duplicate tool call id ${block.id}`)
          }
          pending.add(block.id)
          break
        case 'tool-result':
          if (!pending.delete(block.toolCallId)) {
            throw new Error(
              `hierarchical compaction: tool result ${block.toolCallId} has no call in the selected input`,
            )
          }
          break
        default:
          break
      }
    }
    if (pending.size === 0) {
      units.push(current)
      current = []
    }
  }

  if (pending.size > 0) {
    throw new Error(
      `hierarchical compaction: selected input ends with ${pending.size} unresolved tool call(s)`,
    )
  }
  return units
}

/**
 * Greedily pack tool-balanced units under one message-token budget.
 * @param messages - messages in provider order.
 * @param budgetTokens - tokens available after header and instruction reserves.
 * @param estimate - shared message estimator.
 * @returns non-empty chunks in the same order.
 */
export function planMessageChunks(
  messages: readonly Message[],
  budgetTokens: number,
  estimate: EstimateMessage,
): Message[][] {
  if (!Number.isSafeInteger(budgetTokens) || budgetTokens < 1) {
    throw new Error('hierarchical compaction: message budget must be a positive integer')
  }
  const chunks: Message[][] = []
  let chunk: Message[] = []
  let chunkTokens = 0

  for (const unit of toolBalancedUnits(messages)) {
    const unitTokens = estimateMessages(unit, estimate)
    if (unitTokens > budgetTokens) {
      throw new OversizedCompactionUnitError(
        `hierarchical compaction: one indivisible message/tool unit needs ~${unitTokens} tokens, `
        + `above the ${budgetTokens}-token message budget`,
      )
    }
    if (chunk.length > 0 && chunkTokens + unitTokens > budgetTokens) {
      chunks.push(chunk)
      chunk = []
      chunkTokens = 0
    }
    chunk.push(...unit)
    chunkTokens += unitTokens
  }
  if (chunk.length > 0) chunks.push(chunk)
  return chunks
}

/** Validate one estimator result at its same-process API boundary. */
function estimated(message: Message, estimate: EstimateMessage): number {
  const tokens = estimate(message)
  if (!Number.isSafeInteger(tokens) || tokens < 0) {
    throw new Error('hierarchical compaction: message estimator returned an invalid token count')
  }
  return tokens
}
