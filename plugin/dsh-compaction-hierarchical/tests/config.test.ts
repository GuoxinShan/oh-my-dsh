import { test } from 'node:test'
import assert from 'node:assert/strict'
import { basicConfig, basicSupportsHierarchy, resolveHierarchyConfig } from '../src/config.ts'

test('pre-hierarchy basic strips fields its strict resolver rejects', () => {
  const schema = { dict: { thresholdRatio: {} } }
  assert.equal(basicSupportsHierarchy(schema), false)
  assert.deepEqual(basicConfig({
    thresholdRatio: 0.7,
    chunkInputRatio: 0.5,
    mapMaxTokens: 512,
    reduceMaxTokens: 768,
    maxDepth: 3,
    replayTools: true,
  }, schema), {
    thresholdRatio: 0.7,
  })
})

test('hierarchy-aware basic receives the compatibility provider policy', () => {
  const schema = {
    dict: {
      chunkInputRatio: {},
      mapMaxTokens: {},
      reduceMaxTokens: {},
      maxDepth: {},
      replayTools: {},
    },
  }
  const config = {
    thresholdRatio: 0.7,
    chunkInputRatio: 0.5,
    mapMaxTokens: 512,
    reduceMaxTokens: 768,
    maxDepth: 3,
    replayTools: true,
  }
  assert.equal(basicSupportsHierarchy(schema), true)
  assert.deepEqual(basicConfig(config, schema), config)
})

test('partial hierarchy schema support fails closed to legacy basic fields', () => {
  const schema = { dict: { chunkInputRatio: {}, mapMaxTokens: {} } }
  assert.equal(basicSupportsHierarchy(schema), false)
  assert.deepEqual(basicConfig({ chunkInputRatio: 0.5, mapMaxTokens: 512 }, schema), {})
})

test('hierarchy config resolves conservative defaults', () => {
  assert.deepEqual(resolveHierarchyConfig(), {
    chunkInputRatio: 0.6,
    mapMaxTokens: 4096,
    reduceMaxTokens: 8192,
    maxDepth: 4,
    replayTools: false,
  })
})

test('hierarchy config accepts every explicit field', () => {
  assert.deepEqual(resolveHierarchyConfig({
    chunkInputRatio: 0.75,
    mapMaxTokens: 2048,
    reduceMaxTokens: 4096,
    maxDepth: 6,
    replayTools: true,
  }), {
    chunkInputRatio: 0.75,
    mapMaxTokens: 2048,
    reduceMaxTokens: 4096,
    maxDepth: 6,
    replayTools: true,
  })
})

test('hierarchy config fails loud on invalid budgets', () => {
  assert.throws(() => resolveHierarchyConfig({ chunkInputRatio: 0.09 }), /chunkInputRatio/)
  assert.throws(() => resolveHierarchyConfig({ chunkInputRatio: 0.91 }), /chunkInputRatio/)
  assert.throws(() => resolveHierarchyConfig({ mapMaxTokens: 0 }), /mapMaxTokens/)
  assert.throws(() => resolveHierarchyConfig({ reduceMaxTokens: 1.5 }), /reduceMaxTokens/)
  assert.throws(() => resolveHierarchyConfig({ maxDepth: 0 }), /maxDepth/)
  assert.throws(() => resolveHierarchyConfig({ maxDepth: 9 }), /maxDepth/)
  assert.throws(
    () => resolveHierarchyConfig({ replayTools: 'yes' as unknown as boolean }),
    /replayTools/,
  )
})
