import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ThreadArtifact, ThreadDraftRecord } from './thread-types.ts'

export const THREAD_HANDOFF_DRAFT = 'thread-handoff-draft' as const

const FINAL_DRAFT_REASONS = new Set(['completed', 'blocked', 'max-tokens'])

export function isFinalThreadDraftReason(kind: string): boolean {
  return FINAL_DRAFT_REASONS.has(kind)
}

export interface ThreadHandoffDraft {
  kind: typeof THREAD_HANDOFF_DRAFT
  draftId: string
  version: number
  sourceSessionId: string
  objective: string
  confirmedConclusions: string[]
  constraints: string[]
  openQuestions: string[]
  artifacts: ThreadArtifact[]
  suggestedPreset?: string
  targetTitle?: string
  nextInstruction: string
}

export interface ThreadHandoffArgs {
  objective: string
  confirmedConclusions: string[]
  constraints?: string[]
  openQuestions?: string[]
  artifacts?: Array<{
    kind: ThreadArtifact['kind']
    label: string
    uri?: string
    summary?: string
  }>
  suggestedPreset?: string
  targetTitle?: string
  nextInstruction: string
}

export interface ThreadDraftIdentity {
  callId: string
  sourceSessionId: string
}

function boundedText(value: string, limit: number): string {
  return value.slice(0, limit)
}

function boundedList(value: readonly string[] | undefined): string[] {
  return (value ?? [])
    .filter(item => item.trim().length > 0)
    .slice(0, 24)
    .map(item => boundedText(item, 1000))
}

function boundedArtifacts(value: ThreadHandoffArgs['artifacts']): ThreadArtifact[] {
  return (value ?? [])
    .filter(artifact => artifact.label.trim().length > 0)
    .slice(0, 24)
    .map(artifact => ({
      kind: artifact.kind,
      label: boundedText(artifact.label.trim(), 200),
      uri: artifact.uri === undefined ? null : boundedText(artifact.uri, 2000),
      summary: artifact.summary === undefined ? null : boundedText(artifact.summary, 1000),
    }))
}

/** Build the only durable model-to-client handoff projection. */
export function createThreadHandoffDraft(
  args: ThreadHandoffArgs,
  identity: ThreadDraftIdentity,
): ThreadHandoffDraft {
  return {
    kind: THREAD_HANDOFF_DRAFT,
    draftId: `draft-${identity.callId}`,
    version: 1,
    sourceSessionId: identity.sourceSessionId,
    objective: boundedText(args.objective, 2000),
    confirmedConclusions: boundedList(args.confirmedConclusions),
    constraints: boundedList(args.constraints),
    openQuestions: boundedList(args.openQuestions),
    artifacts: boundedArtifacts(args.artifacts),
    ...(args.suggestedPreset === undefined
      ? {}
      : { suggestedPreset: boundedText(args.suggestedPreset, 200) }),
    ...(args.targetTitle === undefined
      ? {}
      : { targetTitle: boundedText(args.targetTitle, 200) }),
    nextInstruction: boundedText(args.nextInstruction, 4000),
  }
}

/** Seal one Tool Draft only from its exact durable tool-call turn boundary. */
export function sealThreadDraftBoundary(
  draft: ThreadDraftRecord,
  events: readonly SessionEvent[],
  now: number,
): ThreadDraftRecord {
  if (draft.status !== 'waiting-boundary' || draft.sourceAnchor.kind !== 'tool-call') return draft
  const callId = draft.sourceAnchor.callId
  const call = events.find(event => event.type === 'tool/call' && String(event.data.callId) === callId)
  if (call?.type !== 'tool/call') return draft
  const boundary = events.find(event => event.type === 'turn/end' && event.data.turn === call.data.turn)
  if (boundary?.type !== 'turn/end') return draft
  return {
    ...draft,
    sourceBoundarySeq: boundary.seq,
    sourceTurn: boundary.data.turn,
    status: isFinalThreadDraftReason(boundary.data.reason.kind) ? 'editable' : 'source-invalid',
    updatedAt: now,
  }
}

export function isThreadHandoffDraft(value: unknown): value is ThreadHandoffDraft {
  if (value === null || typeof value !== 'object') return false
  const draft = value as Partial<ThreadHandoffDraft>
  return draft.kind === THREAD_HANDOFF_DRAFT
    && typeof draft.draftId === 'string'
    && typeof draft.sourceSessionId === 'string'
    && typeof draft.objective === 'string'
    && Array.isArray(draft.confirmedConclusions)
    && Array.isArray(draft.constraints)
    && Array.isArray(draft.openQuestions)
    && (draft.artifacts === undefined || Array.isArray(draft.artifacts))
    && typeof draft.nextInstruction === 'string'
}
