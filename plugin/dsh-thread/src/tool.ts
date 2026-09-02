import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createThreadHandoffDraft } from './draft.ts'
import type { ThreadGateway } from './gateway.ts'

export const name = 'dsh-thread-tool'
export const inject = ['tools', 'thread', 'systemPrompt']

export const THREAD_HANDOFF_GUIDANCE = `# Thread handoff

Recognize a Thread boundary from intent, not from a required phrase. Prepare a Thread handoff when:
- the user is ready to move an objective from planning, research, or decision-making into its next execution stage;
- the user starts a materially different task or primary artifact that should use conclusions already established here;
- the next work benefits from a different specialist focus while this Session should remain cognitively homogeneous;
- you have just completed a meaningful stage and a concrete dependent next stage is apparent, even if the user has not requested the transition yet; or
- the user explicitly asks to continue in a new or next Session.

Do not hand off ordinary follow-up work that belongs to this Session. When the boundary is materially ambiguous, ask one concise clarification question. When it is clear, call thread_handoff before doing the next stage's substantive work. Include only concrete artifacts already produced by this stage, such as named files, directories, documents, URLs, or other inspectable outputs; do not list inputs or speculative future outputs as artifacts. The Thread panel itself is the direct question asking whether to continue in a new Session; do not require a separate confirmation before preparing it. The Tool only prepares an inert, bounded Draft. The target inherits this Session's Agent preset and stays in the source Session's workspace. A Session is created only after the user confirms in the Thread panel; never claim that the Tool call created it.`

/**
 * Register the handoff Tool and its guidance while the Thread master switch
 * (settings namespace `dsh-thread`) is on; flip-responsive through the
 * gateway's host-plane subscription so no restart is needed.
 */
export function apply(ctx: Context): void {
  const thread = ctx.get('thread') as ThreadGateway | undefined
  if (thread === undefined) throw new Error('dsh-thread: thread gateway service is not mounted')

  let dispose: (() => void) | undefined
  const mount = (): void => {
    const disposeSection = ctx.systemPrompt.section({ name: 'tool:thread-handoff', order: 118, text: THREAD_HANDOFF_GUIDANCE })
    const disposeTool = ctx.tools.register(defineTool({
      name: 'thread_handoff',
      description: 'Prepare an inert Thread Draft at a clear objective phase, task, artifact, or specialist boundary. Use established conclusions as bounded context for a possible new Session running the same Agent preset in the same workspace. This is intent-based and does not require a fixed phrase. Do not use for ordinary follow-ups in the same stage. If the boundary is ambiguous, clarify first. The Tool never creates, opens, or wakes a Session; only the user can authorize that from the version-bound Thread confirmation panel.',
      parameters: {
        objective: { type: 'string', required: true, description: 'Concrete objective for the next Session.' },
        confirmedConclusions: {
          type: 'array',
          required: true,
          items: { type: 'string' },
          description: 'Established facts or decisions worth preserving; may be empty when the request is new.',
        },
        constraints: { type: 'array', items: { type: 'string' }, description: 'Constraints the next Session must preserve.' },
        openQuestions: { type: 'array', items: { type: 'string' }, description: 'Questions intentionally left unresolved.' },
        artifacts: {
          type: 'array',
          description: 'Concrete outputs already produced in this Session. Do not include planned outputs.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', enum: ['file', 'directory', 'url', 'note', 'other'], required: true },
              label: { type: 'string', required: true },
              uri: { type: 'string' },
              summary: { type: 'string' },
            },
          },
        },
        targetTitle: { type: 'string', description: 'Optional concise title for the next Session.' },
        nextInstruction: { type: 'string', required: true, description: 'Direct instruction that wakes the next Agent after confirmation.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', required: true },
            draftId: { type: 'string', required: true },
            version: { type: 'number', required: true },
            sourceSessionId: { type: 'string', required: true },
            objective: { type: 'string', required: true },
            confirmedConclusions: { type: 'array', required: true, items: { type: 'string' } },
            constraints: { type: 'array', required: true, items: { type: 'string' } },
            openQuestions: { type: 'array', required: true, items: { type: 'string' } },
            artifacts: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kind: { type: 'string', required: true },
                  label: { type: 'string', required: true },
                  uri: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
                  summary: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
                },
              },
            },
            suggestedPreset: { type: 'string' },
            targetTitle: { type: 'string' },
            nextInstruction: { type: 'string', required: true },
          },
        },
        render: (_args, draft) => [{
          type: 'text',
          text: `Thread 交接草稿已准备：${draft.objective}。新会话尚未创建，请在当前 Tool 行直接确认“在 Thread 中继续”；如果只看到这段文本，请刷新页面以加载 Thread 界面。`,
        }],
        presentationMeta: (_args, draft) => draft,
      },
      async execute(args, exec) {
        if (exec.agent === undefined) {
          throw new Error('thread_handoff requires an Agent-backed Session')
        }
        const draft = createThreadHandoffDraft(args, {
          callId: exec.callId,
          sourceSessionId: String(exec.agent.id),
        })
        await ctx.thread.prepareDraft(draft, exec.callId)
        exec.concludeTurn()
        return draft
      },
    }))
    dispose = () => {
      disposeTool()
      disposeSection()
    }
  }
  const unmount = (): void => {
    dispose?.()
    dispose = undefined
  }

  if (thread.isEnabled()) mount()
  ctx.effect(() => thread.subscribeEnabled(() => {
    unmount()
    if (thread.isEnabled()) mount()
  }), 'dsh-thread: tool toggle')
  ctx.effect(() => unmount, 'dsh-thread: tool unload')
}
