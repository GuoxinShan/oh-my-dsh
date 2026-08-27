import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  attentionIndex,
  diffAttention,
  filterBirthTurnDone,
  rememberFirstSeen,
  TURN_DONE_BIRTH_GRACE_MS,
} from '../src/client/attention.ts'
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

describe('rememberFirstSeen / filterBirthTurnDone', () => {
  const turnDone = { sessionId: 'a', kind: 'turn-done' as const, title: 't-a' }
  const awaitInput = { sessionId: 'a', kind: 'await-input' as const, title: 't-a' }

  it('stamps new ids with now and keeps earlier stamps', () => {
    const first = rememberFirstSeen(new Map(), ['a'], 1000)
    assert.equal(first.get('a'), 1000)
    const next = rememberFirstSeen(first, ['a', 'b'], 1100)
    assert.equal(next.get('a'), 1000)
    assert.equal(next.get('b'), 1100)
  })
  it('drops ids that left the list so a recreate starts a new window', () => {
    const prev = rememberFirstSeen(new Map(), ['a'], 1000)
    const gone = rememberFirstSeen(prev, [], 2000)
    assert.equal(gone.size, 0)
    const reborn = rememberFirstSeen(gone, ['a'], 3000)
    assert.equal(reborn.get('a'), 3000)
  })
  it('suppresses turn-done inside the birth grace and keeps it after', () => {
    const seen = new Map([['a', 1000]])
    assert.deepEqual(filterBirthTurnDone([turnDone], seen, 1000 + TURN_DONE_BIRTH_GRACE_MS - 1), [])
    assert.deepEqual(filterBirthTurnDone([turnDone], seen, 1000 + TURN_DONE_BIRTH_GRACE_MS), [turnDone])
  })
  it('never suppresses await-input, even inside the grace', () => {
    const seen = new Map([['a', 1000]])
    assert.deepEqual(filterBirthTurnDone([awaitInput], seen, 1001), [awaitInput])
  })
  it('passes turn-done when first-seen is unknown', () => {
    assert.deepEqual(filterBirthTurnDone([turnDone], new Map(), 1000), [turnDone])
  })
})
