import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rebrandTitle } from '../src/client/title.ts'

test('rebrandTitle replaces the bare product title', () => {
  assert.equal(rebrandTitle('DSH Local Build', 'DSH Local Build', 'Oh My DSH'), 'Oh My DSH')
})

test('rebrandTitle rewrites the session-prefixed form DocumentTitle projects', () => {
  assert.equal(
    rebrandTitle('Refactor sidebar — DSH Local Build', 'DSH Local Build', 'Oh My DSH'),
    'Refactor sidebar — Oh My DSH',
  )
})

test('rebrandTitle leaves unrelated titles unchanged', () => {
  assert.equal(rebrandTitle('Some custom deployment title', 'DSH Local Build', 'Oh My DSH'),
    'Some custom deployment title')
})

test('rebrandTitle is idempotent on already-branded text', () => {
  assert.equal(rebrandTitle('Oh My DSH', 'DSH Local Build', 'Oh My DSH'), 'Oh My DSH')
})

test('rebrandTitle guards degenerate inputs', () => {
  assert.equal(rebrandTitle('anything', '', 'Oh My DSH'), 'anything')
  assert.equal(rebrandTitle('same', 'same', 'same'), 'same')
})
