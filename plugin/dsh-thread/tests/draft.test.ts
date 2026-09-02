import assert from 'node:assert/strict'
import test from 'node:test'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { createThreadHandoffDraft, isThreadHandoffDraft, sealThreadDraftBoundary } from '../src/draft.ts'
import type { ThreadDraftRecord } from '../src/thread-types.ts'

test('creates a bounded durable draft without undefined fields', () => {
  const draft = createThreadHandoffDraft({
    objective: 'x'.repeat(2500),
    confirmedConclusions: ['', ...Array.from({ length: 30 }, (_, index) => `fact-${index}`)],
    constraints: ['keep it explicit'],
    artifacts: Array.from({ length: 30 }, (_, index) => ({
      kind: 'file' as const,
      label: index === 0 ? 'z'.repeat(250) : `artifact-${index}`,
      uri: index === 0 ? `/${'u'.repeat(2200)}` : `/workspace/artifact-${index}`,
      summary: index === 0 ? 's'.repeat(1200) : undefined,
    })),
    nextInstruction: 'y'.repeat(4500),
  }, { callId: 'call-1', sourceSessionId: 'session-1' })

  assert.equal(draft.kind, 'thread-handoff-draft')
  assert.equal(draft.draftId, 'draft-call-1')
  assert.equal(draft.version, 1)
  assert.equal(draft.objective.length, 2000)
  assert.equal(draft.confirmedConclusions.length, 24)
  assert.equal(draft.artifacts.length, 24)
  assert.equal(draft.artifacts[0]?.label.length, 200)
  assert.equal(draft.artifacts[0]?.uri?.length, 2000)
  assert.equal(draft.artifacts[0]?.summary?.length, 1000)
  assert.equal(draft.nextInstruction.length, 4000)
  assert.equal('suggestedPreset' in draft, false)
  assert.equal(isThreadHandoffDraft(draft), true)
  assert.doesNotThrow(() => JSON.stringify(draft))
})

test('rejects unrelated presentation metadata', () => {
  assert.equal(isThreadHandoffDraft(null), false)
  assert.equal(isThreadHandoffDraft({ kind: 'thread-handoff-draft' }), false)
})

function waitingDraft(): ThreadDraftRecord {
  return {
    draftId: 'draft-call-1',
    version: 1,
    sourceSessionId: 'source-1',
    sourceAnchor: { kind: 'tool-call', callId: 'call-1' },
    sourceBoundarySeq: null,
    sourceTurn: null,
    status: 'waiting-boundary',
    handoff: { objective: 'continue', confirmedConclusions: [], constraints: [], openQuestions: [], artifacts: [] },
    instruction: 'continue',
    suggestedPreset: null,
    targetTitle: null,
    createdAt: 1,
    updatedAt: 1,
  }
}

function boundaryEvents(reason: 'completed' | 'aborted'): SessionEvent[] {
  return [
    {
      type: 'tool/call', seq: 5, time: 1,
      data: { turn: 2, step: 1, callId: 'call-1', name: 'thread_handoff', arguments: '{}' },
    } as SessionEvent,
    {
      type: 'turn/end', seq: 9, time: 2,
      data: {
        turn: 2,
        reason: reason === 'completed'
          ? { kind: 'completed' }
          : { kind: 'aborted', reason: { kind: 'legacy' } },
      },
    } as SessionEvent,
  ]
}

test('seals a Tool Draft only at its exact completed turn boundary', () => {
  const sealed = sealThreadDraftBoundary(waitingDraft(), boundaryEvents('completed'), 10)
  assert.equal(sealed.status, 'editable')
  assert.equal(sealed.sourceTurn, 2)
  assert.equal(sealed.sourceBoundarySeq, 9)
  assert.equal(sealed.updatedAt, 10)
})

test('invalidates a Tool Draft when its exact turn aborts', () => {
  const sealed = sealThreadDraftBoundary(waitingDraft(), boundaryEvents('aborted'), 10)
  assert.equal(sealed.status, 'source-invalid')
  assert.equal(sealed.sourceBoundarySeq, 9)
})
