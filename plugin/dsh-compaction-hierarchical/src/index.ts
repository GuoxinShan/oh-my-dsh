/**
 * Hierarchical map-reduce summarizer for the stock DSH compaction transaction.
 *
 * The class inherits pressure policy, retention, durable locking, surface
 * replacement, convergence checks, `/compact`, and overflow recovery from
 * BasicCompactionEngine. Only the protected summarization hook changes.
 */

import type { Context } from '@deepseek-ai/cordis'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  BlockAssembler,
  contentHasImage,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  createUserMessage,
  LlmError,
} from '@deepseek-ai/dsh-llm'
import type {
  ContentBlock,
  FinishReason,
  GenerateOptions,
  Message,
  TokenUsage,
  ToolSchema,
} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-token-meter'
import { basicConfig, Config, resolveHierarchyConfig } from './config.ts'
import type { HierarchicalCompactionConfig, ResolvedHierarchyConfig } from './config.ts'
import { estimateMessages, planMessageChunks, toolBalancedUnits } from './planner.ts'
import {
  framePartialSummary,
  mapInstruction,
  reduceInstruction,
  validateStructuredSummary,
} from './prompts.ts'

export type { HierarchicalCompactionConfig } from './config.ts'
export { Config } from './config.ts'
export { OversizedCompactionUnitError, planMessageChunks, toolBalancedUnits } from './planner.ts'

const PLUGIN_ID = 'dsh-compaction-hierarchical'
const CHARS_PER_TOKEN = 4
const ENVELOPE_OVERHEAD = 4

interface SummarizationInput {
  readonly system?: string
  readonly tools?: readonly ToolSchema[]
  readonly messages: readonly Message[]
}

type TextBlock = Extract<ContentBlock, { type: 'text' }>

type SummaryResult = {
  summary: ContentBlock[]
  provider: string
  model: string
  maxTokens?: number
  usage?: TokenUsage
} & (
  | { rawOutput: ContentBlock[]; llmStreamCall: true }
  | { rawOutput?: ContentBlock[]; llmStreamCall?: never }
)

interface SummaryTarget {
  readonly provider: string
  readonly model: string
  readonly oneShotMaxTokens: number
}

interface StageResult {
  readonly summary: TextBlock[]
  readonly rawOutput: ContentBlock[]
  readonly usage?: TokenUsage
}

interface PartialSummary {
  readonly message: Message
  readonly result: StageResult
  readonly start: number
  readonly end: number
}

/** Compaction Provider using bounded map calls followed by recursive reduction. */
export class HierarchicalCompactionEngine extends BasicCompactionEngine {
  static override Config = Config

  /** Validated hierarchy policy, separate from the inherited pressure policy. */
  readonly hierarchy: ResolvedHierarchyConfig

  constructor(ctx: Context, config: HierarchicalCompactionConfig = {}) {
    super(ctx, basicConfig(config))
    this.hierarchy = resolveHierarchyConfig(config)
    ctx.logger.info(
      'dsh-compaction-hierarchical: active (chunkInputRatio=%d, maxDepth=%d)',
      this.hierarchy.chunkInputRatio,
      this.hierarchy.maxDepth,
    )
  }

  /**
   * Delegate fitting inputs unchanged; otherwise map balanced chunks and reduce
   * their structured checkpoints until exactly one remains.
   */
  protected override async summarize(
    input: SummarizationInput,
    agent: Agent,
    signal?: AbortSignal,
  ): Promise<SummaryResult> {
    signal?.throwIfAborted()
    const target = this.resolveSummaryTarget(agent)
    const model = await this.ctx.llm.resolveModelInfo(target.provider, target.model, signal)
    const contextWindow = model.context?.contextWindow
    if (contextWindow === undefined || !Number.isSafeInteger(contextWindow) || contextWindow < 1) {
      throw new Error(
        `hierarchical compaction: no positive integer context capacity for summary target ${target.provider}/${target.model}`,
      )
    }
    const inputBudget = Math.floor(contextWindow * this.hierarchy.chunkInputRatio)
    this.assertHierarchyOutputReserve(contextWindow, inputBudget)

    const estimate = (message: Message): number => this.ctx.tokenMeter.estimateMessage(message)
    const oneShotTokens = this.estimateCallInput(
      input,
      mapInstruction(input.messages.length, input.messages.length),
      true,
      estimate,
    )
    let failedOneShot = false
    const oneShotFits = oneShotTokens <= inputBudget
      && inputBudget + target.oneShotMaxTokens <= contextWindow
    if (oneShotFits) {
      try {
        return await super.summarize(input, agent, signal)
      } catch (error) {
        if (!hasErrorCode(error, CONTEXT_WINDOW_EXCEEDED_CODE)) throw error
        failedOneShot = true
      }
    }

    const units = toolBalancedUnits(input.messages)
    const mapReserve = this.estimateFixedInput(
      input,
      mapInstruction(units.length, units.length),
      this.hierarchy.replayTools,
      estimate,
    )
    const mapMessageBudget = this.messageBudget(inputBudget, mapReserve, 'map')
    const chunks = planMessageChunks(input.messages, mapMessageBudget, estimate)
    if (chunks.length === 0) {
      throw new Error('hierarchical compaction: oversized input produced no map chunks')
    }

    const calls: StageResult[] = []
    let partials: PartialSummary[] = []
    for (let index = 0; index < chunks.length; index += 1) {
      signal?.throwIfAborted()
      const result = await this.runStage(
        { ...input, messages: chunks[index] ?? [] },
        mapInstruction(index + 1, chunks.length),
        target,
        this.hierarchy.mapMaxTokens,
        agent,
        signal,
      )
      calls.push(result)
      partials.push(this.partial(result, index + 1, index + 1, `map chunk ${index + 1}`))
    }

    for (let round = 1; partials.length > 1; round += 1) {
      if (round > this.hierarchy.maxDepth) {
        throw new Error(
          `hierarchical compaction: reduction did not converge within ${this.hierarchy.maxDepth} round(s)`,
        )
      }
      const reduceReserve = this.estimateFixedInput(
        input,
        reduceInstruction(round, partials.length, partials.length),
        this.hierarchy.replayTools,
        estimate,
      )
      const reduceMessageBudget = this.messageBudget(inputBudget, reduceReserve, `reduce round ${round}`)
      let groups: Message[][]
      try {
        groups = planMessageChunks(
          partials.map(partial => partial.message),
          reduceMessageBudget,
          estimate,
        )
      } catch (error) {
        if (error instanceof Error) {
          error.message = `hierarchical compaction: reduce round ${round}: ${error.message}`
        }
        throw error
      }
      if (groups.length >= partials.length) {
        throw new Error(
          `hierarchical compaction: reduce round ${round} cannot combine any partial summaries; `
          + 'increase chunkInputRatio or lower mapMaxTokens/reduceMaxTokens',
        )
      }

      const byMessage = new Map(partials.map(partial => [partial.message.id, partial]))
      const next: PartialSummary[] = []
      for (let index = 0; index < groups.length; index += 1) {
        signal?.throwIfAborted()
        const group = groups[index] ?? []
        const represented = group.map((message) => {
          const partial = byMessage.get(message.id)
          if (partial === undefined) {
            throw new Error('hierarchical compaction: reducer group lost partial-summary identity')
          }
          return partial
        })
        const result = await this.runStage(
          { ...input, messages: group },
          reduceInstruction(round, index + 1, groups.length),
          target,
          this.hierarchy.reduceMaxTokens,
          agent,
          signal,
        )
        calls.push(result)
        next.push(this.partial(
          result,
          represented[0]?.start ?? 0,
          represented.at(-1)?.end ?? 0,
          `reduce round ${round} group ${index + 1}`,
        ))
      }
      partials = next
    }

    const final = partials[0]
    if (final === undefined) throw new Error('hierarchical compaction: map stage produced no summaries')
    const usage = failedOneShot
      ? undefined
      : aggregateUsage(calls.map(call => call.usage))
    const maxTokens = calls.length === chunks.length
      ? this.hierarchy.mapMaxTokens
      : this.hierarchy.reduceMaxTokens
    const result = {
      summary: final.result.summary,
      rawOutput: final.result.rawOutput,
      provider: target.provider,
      model: target.model,
      maxTokens,
      ...(usage === undefined ? {} : { usage }),
    }
    if (!failedOneShot && calls.length === 1) {
      return { ...result, llmStreamCall: true }
    }
    return result
  }

  /** Resolve the same configured/latest/agent summary route precedence as basic. */
  private resolveSummaryTarget(agent: Agent): SummaryTarget {
    const header = agent.session.requestHeader()?.config
    const routed = header !== undefined
      && header.provider.length > 0
      && header.model.length > 0
      ? { provider: header.provider, model: header.model }
      : undefined
    const agentTarget = agent.options.provider !== undefined
      && agent.options.provider.length > 0
      && agent.options.model !== undefined
      && agent.options.model.length > 0
      ? { provider: agent.options.provider, model: agent.options.model }
      : undefined
    const conversation = routed ?? agentTarget
    const override = conversation === undefined
      ? undefined
      : this.config.modelPolicies.find(policy => (
        policy.provider === conversation.provider && policy.model === conversation.model
      ))
    const provider = override?.summarizationProvider ?? this.config.summarizationProvider
    const model = override?.summarizationModel ?? this.config.summarizationModel
    const configured = provider.length === 0 ? undefined : { provider, model }
    const target = configured ?? routed ?? agentTarget
    if (target === undefined) {
      throw new Error(
        'hierarchical compaction: no summary provider/model; configure both fields or route one request',
      )
    }
    return {
      provider: target.provider,
      model: target.model,
      oneShotMaxTokens: override?.maxTokens ?? this.config.maxTokens,
    }
  }

  /** Ensure the hierarchy generation caps fit outside its input budget. */
  private assertHierarchyOutputReserve(
    contextWindow: number,
    inputBudget: number,
  ): void {
    const outputTokens = Math.max(
      this.hierarchy.mapMaxTokens,
      this.hierarchy.reduceMaxTokens,
    )
    if (inputBudget + outputTokens > contextWindow) {
      throw new Error(
        `hierarchical compaction: input budget ${inputBudget} plus output reserve ${outputTokens} `
        + `exceeds summary context ${contextWindow}`,
      )
    }
  }

  /** Price a complete auxiliary call input. */
  private estimateCallInput(
    input: SummarizationInput,
    instruction: string,
    includeTools: boolean,
    estimate: (message: Message) => number,
  ): number {
    return this.estimateFixedInput(input, instruction, includeTools, estimate)
      + estimateMessages(input.messages, estimate)
  }

  /** Price the repeated header and final instruction for one stage. */
  private estimateFixedInput(
    input: SummarizationInput,
    instruction: string,
    includeTools: boolean,
    estimate: (message: Message) => number,
  ): number {
    const systemTokens = input.system === undefined
      ? 0
      : Math.ceil(input.system.length / CHARS_PER_TOKEN) + ENVELOPE_OVERHEAD
    const toolsTokens = !includeTools || input.tools === undefined || input.tools.length === 0
      ? 0
      : Math.ceil(JSON.stringify(input.tools).length / CHARS_PER_TOKEN) + ENVELOPE_OVERHEAD
    return systemTokens + toolsTokens + estimate(this.instructionMessage(instruction))
  }

  /** Derive positive room for stage messages after fixed input. */
  private messageBudget(inputBudget: number, fixedTokens: number, stage: string): number {
    const budget = inputBudget - fixedTokens
    if (budget < 1) {
      throw new Error(
        `hierarchical compaction: ${stage} system/tools/instruction need ~${fixedTokens} tokens, `
        + `above the ${inputBudget}-token call input budget`,
      )
    }
    return budget
  }

  /** Run one private map or reduce model call and require structured text. */
  private async runStage(
    input: SummarizationInput,
    instruction: string,
    target: SummaryTarget,
    maxTokens: number,
    agent: Agent,
    signal?: AbortSignal,
  ): Promise<StageResult> {
    signal?.throwIfAborted()
    const assembler = new BlockAssembler()
    const options: GenerateOptions = {
      provider: target.provider,
      model: target.model,
      messages: [...input.messages, this.instructionMessage(instruction)],
      ...input.system === undefined ? {} : { system: input.system },
      ...this.hierarchy.replayTools && input.tools !== undefined ? { tools: [...input.tools] } : {},
      maxTokens,
      sessionId: agent.session.id,
      purpose: 'compaction',
      ...signal === undefined ? {} : { signal },
    }
    for await (const chunk of this.ctx.llm.stream(options)) assembler.push(chunk)
    const finishFailure = finishError(assembler.finish)
    if (finishFailure !== undefined) throw finishFailure

    const rawOutput = assembler.blocks()
    if (contentHasImage(rawOutput)) {
      throw new LlmError('hierarchical compaction summary cannot contain image output', 'UNSUPPORTED_CONTENT')
    }
    const summary = rawOutput.filter((block): block is TextBlock => block.type === 'text')
    validateStructuredSummary(summary, 'hierarchical compaction stage')
    return {
      summary,
      rawOutput,
      ...(assembler.usage === undefined ? {} : { usage: assembler.usage }),
    }
  }

  /** Convert one validated stage result into immutable reducer data. */
  private partial(result: StageResult, start: number, end: number, stage: string): PartialSummary {
    const text = validateStructuredSummary(result.summary, stage)
    return {
      message: createUserMessage({
        content: [{ type: 'text', text: framePartialSummary(text, start, end) }],
        source: { kind: 'plugin', plugin: PLUGIN_ID },
      }),
      result,
      start,
      end,
    }
  }

  /** Create the final user instruction for an auxiliary call. */
  private instructionMessage(text: string): Message {
    return createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: PLUGIN_ID },
    })
  }
}

/** Match a structured error code without depending on an error class instance. */
function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === code
}

/** Map a terminal stage finish to a fail-closed error. */
function finishError(finish: FinishReason): Error | undefined {
  switch (finish.kind) {
    case 'error':
    case 'aborted': {
      const error = new Error(finish.failure.message) as Error & { code?: string }
      error.code = finish.failure.code
      return error
    }
    case 'max-tokens': {
      const error = new Error(
        'hierarchical compaction stage truncated at the token cap',
      ) as Error & { code?: string }
      error.code = 'MAX_TOKENS'
      return error
    }
    default:
      return undefined
  }
}

/** Sum disjoint provider usage across every map and reduce call. */
export function aggregateUsage(usages: readonly (TokenUsage | undefined)[]): TokenUsage | undefined {
  if (usages.length === 0 || usages.some(usage => usage === undefined)) return undefined
  const present = usages as readonly TokenUsage[]
  const total: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
  }
  for (const usage of present) {
    total.inputTokens += usage.inputTokens
    total.outputTokens += usage.outputTokens
    if (usage.cacheReadTokens !== undefined) {
      total.cacheReadTokens = (total.cacheReadTokens ?? 0) + usage.cacheReadTokens
    }
    if (usage.cacheWriteTokens !== undefined) {
      total.cacheWriteTokens = (total.cacheWriteTokens ?? 0) + usage.cacheWriteTokens
    }
    if (usage.reasoningTokens !== undefined) {
      total.reasoningTokens = (total.reasoningTokens ?? 0) + usage.reasoningTokens
    }
  }
  return total
}

export default HierarchicalCompactionEngine
