import assert from 'node:assert/strict'
import test from 'node:test'
import { THREAD_HANDOFF_GUIDANCE } from '../src/tool.ts'

test('guides the Agent by phase and task boundaries instead of a passphrase', () => {
  assert.match(THREAD_HANDOFF_GUIDANCE, /intent, not from a required phrase/)
  assert.match(THREAD_HANDOFF_GUIDANCE, /next execution stage/)
  assert.match(THREAD_HANDOFF_GUIDANCE, /materially different task or primary artifact/)
  assert.match(THREAD_HANDOFF_GUIDANCE, /just completed a meaningful stage/)
  assert.match(THREAD_HANDOFF_GUIDANCE, /concrete artifacts already produced by this stage/)
  assert.match(THREAD_HANDOFF_GUIDANCE, /do not list inputs or speculative future outputs as artifacts/)
  assert.match(THREAD_HANDOFF_GUIDANCE, /panel itself is the direct question/)
  assert.match(THREAD_HANDOFF_GUIDANCE, /target inherits this Session's Agent preset/)
  assert.match(THREAD_HANDOFF_GUIDANCE, /source Session's workspace/)
  assert.match(THREAD_HANDOFF_GUIDANCE, /only after the user confirms in the Thread panel/)
})
