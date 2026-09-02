import assert from 'node:assert/strict'
import test from 'node:test'
import { createThreadPanelVisibility } from '../src/client/panel-visibility.ts'

test('panel visibility toggles once per state change', () => {
  const visibility = createThreadPanelVisibility()
  const snapshots: boolean[] = []
  const dispose = visibility.subscribe(() => { snapshots.push(visibility.getSnapshot()) })

  assert.equal(visibility.getSnapshot(), false)
  visibility.open()
  visibility.open()
  visibility.toggle()
  visibility.close()

  assert.deepEqual(snapshots, [true, false])
  assert.equal(visibility.getSnapshot(), false)
  dispose()
})

test('panel visibility survives subscriber replacement across Session navigation', () => {
  const visibility = createThreadPanelVisibility()
  let firstCalls = 0
  let secondCalls = 0
  const disposeFirst = visibility.subscribe(() => { firstCalls += 1 })

  visibility.open()
  disposeFirst()
  const disposeSecond = visibility.subscribe(() => { secondCalls += 1 })

  assert.equal(visibility.getSnapshot(), true)
  visibility.close()
  assert.equal(firstCalls, 1)
  assert.equal(secondCalls, 1)
  disposeSecond()
})
