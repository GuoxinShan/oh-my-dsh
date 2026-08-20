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
  // One blank separator line precedes the block and one newline follows its
  // end marker; user content itself is intact.
  assert.equal(before, `${FOREIGN}\n`)
  assert.equal(after, '\n')
})

test('an empty-list file becomes the block, and back to the empty list', async () => {
  const { parse } = await import('yaml')
  const off = withToggleEntry('[]\n', false)
  assert.equal(toggleStateFromText(off), false)
  // The `[]` marker is dropped: a flow-sequence line before block entries is
  // two YAML documents and the loader would reject the file.
  assert.deepEqual(parse(off), [{ id: 'tool-web', disabled: true }])
  const back = withToggleEntry(off, true)
  assert.equal(back, '[]\n')
})

test('an empty-list file with surrounding comments parses with the block', async () => {
  const { parse } = await import('yaml')
  const off = withToggleEntry('# header\n[]\n# tail\n', false)
  const parsed = parse(off) as Array<{ id?: string, disabled?: boolean }>
  assert.deepEqual(parsed, [{ id: 'tool-web', disabled: true }])
  assert.ok(off.includes('# header\n'))
})

test('undefined input creates a header plus the block', async () => {
  const { parse } = await import('yaml')
  const off = withToggleEntry(undefined, false)
  assert.ok(off.startsWith('#'))
  assert.equal(toggleStateFromText(off), false)
  assert.deepEqual(parse(off), [{ id: 'tool-web', disabled: true }])
  // Re-enabling settles on the harness-native empty-list shape; the creation
  // header was only scaffolding for the file's first write.
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
