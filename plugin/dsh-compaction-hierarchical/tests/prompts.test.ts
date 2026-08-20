import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  framePartialSummary,
  mapInstruction,
  reduceInstruction,
  SUMMARY_SECTIONS,
  validateStructuredSummary,
} from '../src/prompts.ts'

const summary = SUMMARY_SECTIONS.map(section => `## ${section}\n- value`).join('\n\n')

test('map and reduce prompts require the complete checkpoint structure', () => {
  for (const section of SUMMARY_SECTIONS) {
    assert.match(mapInstruction(1, 3), new RegExp(`## ${section}`))
    assert.match(reduceInstruction(2, 1, 2), new RegExp(`## ${section}`))
  }
  assert.match(mapInstruction(1, 3), /chunk 1 of 3/)
  assert.match(reduceInstruction(2, 1, 2), /reduce round 2, group 1 of 2/)
})

test('structured summary validation joins text blocks and rejects omissions', () => {
  assert.equal(
    validateStructuredSummary([{ type: 'text', text: summary }], 'map'),
    summary,
  )
  assert.throws(
    () => validateStructuredSummary([
      { type: 'text', text: summary.replace('## Next Step', '## Missing') },
    ], 'reduce'),
    /Next Step/,
  )
  assert.throws(() => validateStructuredSummary([], 'map'), /no text/)
})

test('partial framing records the represented map-chunk range', () => {
  assert.equal(
    framePartialSummary('checkpoint', 2, 5),
    '<partial-summary start="2" end="5">\ncheckpoint\n</partial-summary>',
  )
})
