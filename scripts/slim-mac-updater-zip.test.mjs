import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadBuildBlockMap } from './slim-mac-updater-zip.mjs'

test('loadBuildBlockMap resolves electron-builder 26 JS implementation', () => {
  assert.equal(typeof loadBuildBlockMap(), 'function')
})
