import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveHierarchyConfig } from '../src/config.ts'

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
