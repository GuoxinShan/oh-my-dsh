import assert from 'node:assert/strict'
import test from 'node:test'
import { isElectronCutoverNotes, parseUpdateNotes } from '../src/client/update-notes.ts'

test('parseUpdateNotes keeps changelog headings and bullets', () => {
  assert.deepEqual(parseUpdateNotes(`### Fixed

- titlebar drift
- updater notes

### Changed
Keep the dialog quiet when notes are empty.
`), [
    { type: 'heading', text: 'Fixed' },
    { type: 'list', items: ['titlebar drift', 'updater notes'] },
    { type: 'heading', text: 'Changed' },
    { type: 'paragraph', text: 'Keep the dialog quiet when notes are empty.' },
  ])
})

test('parseUpdateNotes skips an electron-cutover HTML comment', () => {
  assert.equal(isElectronCutoverNotes('<!-- dsh-electron-cutover -->\n请下载新包'), true)
  assert.equal(isElectronCutoverNotes('regular notes'), false)
  assert.deepEqual(parseUpdateNotes('<!-- dsh-electron-cutover -->\n请下载新包'), [
    { type: 'paragraph', text: '请下载新包' },
  ])
})

test('parseUpdateNotes treats blank input as no blocks', () => {
  assert.deepEqual(parseUpdateNotes(''), [])
  assert.deepEqual(parseUpdateNotes('   \n\n'), [])
})
