/**
 * Unit tests for the home-patch text editing: the managed-block splice is
 * idempotent, preserves foreign content byte-for-byte, and keeps the document
 * a valid YAML list in every reachable shape.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BEGIN_MARKER, END_MARKER, toggleStateFromText, withToggleEntry } from '../src/patch-file.ts'

const FOREIGN = [
  '# my own comment stays',
  '- id: some-other-row',
  '  config: { a: 1 }',
  '',
].join('\n')

test('absent file reads as enabled', () => {
  assert.equal(toggleStateFromText(undefined), true)
})

test('disabling appends the managed block and enables again round-trips', () => {
  const off = withToggleEntry(FOREIGN, false)
  assert.ok(off.includes(BEGIN_MARKER) && off.includes(END_MARKER))
  assert.equal(toggleStateFromText(off), false)
  const back = withToggleEntry(off, true)
  assert.equal(toggleStateFromText(back), true)
  assert.equal(back, FOREIGN)
})

test('foreign entries are preserved byte-for-byte around the block', () => {
  const off = withToggleEntry(FOREIGN, false)
  const before = off.slice(0, off.indexOf(BEGIN_MARKER))
  const after = off.slice(off.indexOf(END_MARKER) + END_MARKER.length)
  assert.equal(before, FOREIGN)
  assert.equal(after, '')
})

test('an empty-list file becomes the block, and back to the empty list', () => {
  const off = withToggleEntry('[]\n', false)
  assert.equal(toggleStateFromText(off), false)
  const back = withToggleEntry(off, true)
  assert.equal(back, '[]\n')
})

test('undefined input creates a header plus the block', () => {
  const off = withToggleEntry(undefined, false)
  assert.ok(off.startsWith('#'))
  assert.equal(toggleStateFromText(off), false)
  const back = withToggleEntry(off, true)
  assert.equal(back, '[]\n')
})

test('re-disabling an already-disabled file is a no-op (idempotent)', () => {
  const off = withToggleEntry(FOREIGN, false)
  assert.equal(withToggleEntry(off, false), off)
})

test('re-enabling an already-enabled file is a no-op (idempotent)', () => {
  assert.equal(withToggleEntry(FOREIGN, true), FOREIGN)
})

test('a comments-only file left after removal resolves to the empty list', () => {
  const commented = '# just a comment\n'
  const off = withToggleEntry(commented, false)
  const back = withToggleEntry(off, true)
  assert.equal(back, '[]\n')
})

test('the managed block is valid YAML list content', async () => {
  const { parse } = await import('yaml')
  const off = withToggleEntry(FOREIGN, false)
  const parsed = parse(off) as Array<{ id?: string, disabled?: boolean }>
  assert.ok(Array.isArray(parsed))
  const ours = parsed.find(entry => entry?.id === 'tool-web')
  assert.deepEqual(ours, { id: 'tool-web', disabled: true })
  assert.ok(parsed.some(entry => entry?.id === 'some-other-row'))
})
