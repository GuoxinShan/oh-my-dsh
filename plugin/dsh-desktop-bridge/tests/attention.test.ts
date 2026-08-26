import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { attentionIndex, diffAttention } from '../src/client/attention.ts'
import type { AttentionRow } from '../src/client/attention.ts'

function row(over: Partial<AttentionRow> & { id: string }): AttentionRow {
  return { displayTitle: `t-${over.id}`, running: false, ...over }
}

describe('diffAttention', () => {
  it('reports nothing on the first sample (boot)', () => {
    const after = attentionIndex([row({ id: 'a', running: true })])
    assert.deepEqual(diffAttention(undefined, after), [])
  })
  it('reports running true→false as turn-done', () => {
    const before = attentionIndex([row({ id: 'a', running: true })])
    const after = attentionIndex([row({ id: 'a', running: false })])
    assert.deepEqual(diffAttention(before, after), [{ sessionId: 'a', kind: 'turn-done', title: 't-a' }])
  })
  it('reports pendingInteraction appearing as await-input only for survivors', () => {
    const before = attentionIndex([row({ id: 'a' })])
    const after = attentionIndex([row({ id: 'a', pendingInteraction: 'approval' }), row({ id: 'b', pendingInteraction: 'question' })])
    assert.deepEqual(diffAttention(before, after), [
      { sessionId: 'a', kind: 'await-input', title: 't-a' },
    ])
  })
  it('prefers await-input when a transition raises both edges', () => {
    const before = attentionIndex([row({ id: 'a', running: true })])
    const after = attentionIndex([row({ id: 'a', running: false, pendingInteraction: 'plan-review' })])
    assert.deepEqual(diffAttention(before, after), [{ sessionId: 'a', kind: 'await-input', title: 't-a' }])
  })
  it('stays silent when idle sessions first appear (boot / list hydration)', () => {
    const before = attentionIndex([row({ id: 'x' })])
    const after = attentionIndex([row({ id: 'x' }), row({ id: 'a' }), row({ id: 'b' })])
    assert.deepEqual(diffAttention(before, after), [])
    assert.deepEqual(diffAttention(attentionIndex([]), after), [])
  })
  it('stays silent for steady state and for newly running rows', () => {
    const steady = attentionIndex([row({ id: 'a' }), row({ id: 'b', running: true })])
    assert.deepEqual(diffAttention(steady, attentionIndex([row({ id: 'a' }), row({ id: 'b', running: true })])), [])
    assert.deepEqual(diffAttention(steady, attentionIndex([row({ id: 'a', running: true })])), [])
  })
  it('stays silent when pending persists across samples', () => {
    const before = attentionIndex([row({ id: 'a', pendingInteraction: 'question' })])
    const after = attentionIndex([row({ id: 'a', pendingInteraction: 'question' })])
    assert.deepEqual(diffAttention(before, after), [])
  })
})
