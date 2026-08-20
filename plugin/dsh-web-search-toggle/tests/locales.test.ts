import assert from 'node:assert/strict'
import test from 'node:test'
import { en, zh } from '../src/client/locales.ts'

test('uses the product name and does not expose credential references', () => {
  assert.equal(zh['row.title'], 'Web Search')
  assert.equal(en['row.title'], 'Web Search')
  assert.equal(zh['key.configured'], '密钥已配置')
  assert.equal(en['key.configured'], 'Key configured')
  assert.doesNotMatch(zh['key.configured'], /\{ref\}/)
  assert.doesNotMatch(en['key.configured'], /\{ref\}/)
})
