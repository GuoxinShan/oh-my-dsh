/**
 * Healing decision tests: every arm of the veto chain, plus lineage walking
 * with fork inheritance, disabled inheritance, depth caps, and cycles.
 * @module dsh-fs-observation-log/tests/heal
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateConfig } from '../src/config.ts'
import { healDecision, sessionLineage } from '../src/heal.ts'

const config = validateConfig({})

test('a live observation needs no healing', () => {
  const decision = healDecision({ version: 'v1' }, { version: 'v1', sessionId: 's1' }, { version: 'v1' })
  assert.deepEqual(decision, { kind: 'skip', reason: 'live-observed' })
})

test('no lineage evidence means no restore', () => {
  const decision = healDecision(undefined, undefined, { version: 'v1' })
  assert.deepEqual(decision, { kind: 'skip', reason: 'no-evidence' })
})

test('a target that no longer exists is not restored', () => {
  const decision = healDecision(undefined, { version: 'v1', sessionId: 's1' }, {})
  assert.deepEqual(decision, { kind: 'skip', reason: 'target-absent' })
})

test('a changed file (version drift) is not restored', () => {
  const decision = healDecision(undefined, { version: 'v1', sessionId: 's1' }, { version: 'v2' })
  assert.deepEqual(decision, { kind: 'skip', reason: 'version-changed' })
})

test('an unchanged file restores at the live token', () => {
  const decision = healDecision(undefined, { version: 'v1', sessionId: 'parent' }, { version: 'v1' })
  assert.deepEqual(decision, { kind: 'restore', version: 'v1', fromSession: 'parent' })
})

test('lineage: self plus the fork chain from the store headers', () => {
  // child → parent → grandparent, then unknown.
  const parents = new Map([['child', 'parent'], ['parent', 'grandparent']])
  const lineage = sessionLineage({ id: 'child', parentSession: 'parent' }, config, (id) => parents.get(id))
  assert.deepEqual(lineage, ['child', 'parent', 'grandparent'])
})

test('lineage: live header parent wins over the sidecar fallback', () => {
  const lineage = sessionLineage({ id: 'child', parentSession: 'recorded-parent' }, config, () => 'sidecar-parent')
  assert.deepEqual(lineage, ['child', 'recorded-parent', 'sidecar-parent'])
})

test('lineage: header without parent falls back to the sidecar header', () => {
  const lineage = sessionLineage({ id: 'child' }, config, () => 'sidecar-parent')
  assert.deepEqual(lineage, ['child', 'sidecar-parent'])
})

test('lineage: disabled inheritance keeps the acting session only', () => {
  const lineage = sessionLineage({ id: 'child', parentSession: 'parent' }, validateConfig({ inheritFork: false }), () => 'x')
  assert.deepEqual(lineage, ['child'])
})

test('lineage: cycles are cut', () => {
  const lineage = sessionLineage({ id: 'a', parentSession: 'b' }, config, (id) => (id === 'b' ? 'a' : undefined))
  assert.deepEqual(lineage, ['a', 'b'])
})

test('lineage: depth cap bounds the walk', () => {
  const parents = new Map([['s1', 's2'], ['s2', 's3'], ['s3', 's4'], ['s4', 's5'], ['s5', 's6'], ['s6', 's7'], ['s7', 's8'], ['s8', 's9'], ['s9', 's10']])
  const lineage = sessionLineage({ id: 's1', parentSession: 's2' }, validateConfig({ maxLineageDepth: 4 }), (id) => parents.get(id))
  assert.equal(lineage.length, 5)
  assert.deepEqual(lineage, ['s1', 's2', 's3', 's4', 's5'])
})

test('lineage: a header without a usable id yields an empty lineage', () => {
  assert.deepEqual(sessionLineage({}, config, () => 'x'), [])
  assert.deepEqual(sessionLineage({ id: '' }, config, () => 'x'), [])
  assert.deepEqual(sessionLineage({ id: 42 }, config, () => 'x'), [])
})
