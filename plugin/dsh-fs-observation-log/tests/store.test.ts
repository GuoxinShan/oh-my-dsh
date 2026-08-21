/**
 * Store tests: record/lookup round trips, restart survival (the point of the
 * plugin), fork-lineage inheritance via sidecar headers, compaction,
 * corruption tolerance, and the fail-soft write switch.
 * @module dsh-fs-observation-log/tests/store
 */

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { validateConfig } from '../src/config.ts'
import { ObservationStore, parseSidecarLine, sanitizeSessionId, serializeSidecarLine } from '../src/store.ts'

const dirs: string[] = []
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

function freshStore(overrides: Record<string, unknown> = {}): { store: ObservationStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'fs-obs-log-'))
  dirs.push(dir)
  return { store: new ObservationStore(validateConfig(overrides), dir), dir }
}

test('sanitize keeps safe ids and namespaces hostile ones', () => {
  assert.equal(sanitizeSessionId('abc-123.XYZ'), 'abc-123.XYZ')
  assert.match(sanitizeSessionId('a/b\\c:d'), /^a_b_c_d$/)
  const hostile = sanitizeSessionId('x'.repeat(200))
  assert.ok(hostile.length <= 77 && hostile.includes('-'))
})

test('parse tolerates malformed lines and skips unknown versions', () => {
  assert.equal(parseSidecarLine(''), undefined)
  assert.equal(parseSidecarLine('not json'), undefined)
  assert.equal(parseSidecarLine('42'), undefined)
  assert.equal(parseSidecarLine('{"v":2,"targetKey":"k","version":"1"}'), undefined)
  assert.equal(parseSidecarLine('{"v":1,"targetKey":"","version":"1"}'), undefined)
  assert.deepEqual(parseSidecarLine('{"hdr":1,"id":"s1","parent":"s0"}'), { hdr: 1, id: 's1', parent: 's0' })
  const record = parseSidecarLine('{"v":1,"targetKey":"k","version":"v1","at":5}')
  assert.deepEqual(record, { v: 1, targetKey: 'k', displayPath: 'k', version: 'v1', at: 5 })
})

test('record then lookup finds the evidence, including across a store restart', () => {
  const { store, dir } = freshStore()
  store.record('s1', '/tmp/x.ts', 'x.ts', 'v1', 's0')
  assert.deepEqual(store.lookup(['s1'], '/tmp/x.ts'), { version: 'v1', sessionId: 's1' })
  // New process, same dir: the sidecar is the only state.
  const revived = new ObservationStore(validateConfig({}), dir)
  assert.deepEqual(revived.lookup(['s1'], '/tmp/x.ts'), { version: 'v1', sessionId: 's1' })
  // Lineage: the fork parent is resolvable from the sidecar header.
  assert.equal(revived.parentOf('s1'), 's0')
})

test('lookup walks the lineage nearest-first and stops at the first hit', () => {
  const { store } = freshStore()
  store.record('child', '/tmp/a.ts', 'a.ts', 'vc')
  store.record('parent', '/tmp/a.ts', 'a.ts', 'vp')
  store.record('parent', '/tmp/b.ts', 'b.ts', 'vb')
  assert.deepEqual(store.lookup(['child', 'parent'], '/tmp/a.ts'), { version: 'vc', sessionId: 'child' })
  assert.deepEqual(store.lookup(['child', 'parent'], '/tmp/b.ts'), { version: 'vb', sessionId: 'parent' })
  assert.equal(store.lookup(['child', 'parent'], '/tmp/missing.ts'), undefined)
})

test('re-recording the same version does not append a duplicate line', () => {
  const { store, dir } = freshStore()
  store.record('s1', '/tmp/x.ts', 'x.ts', 'v1')
  store.record('s1', '/tmp/x.ts', 'x.ts', 'v1')
  const text = readFileSync(join(dir, `${sanitizeSessionId('s1')}.jsonl`), 'utf8')
  assert.equal(text.split('\n').filter((line) => line.length > 0).length, 2) // header + one record
})

test('compaction keeps the header and the newest half on overflow', () => {
  const { store, dir } = freshStore({ maxEntriesPerSession: 4 })
  store.record('s1', '/f0', 'f0', 'v0', 's0')
  store.record('s1', '/f1', 'f1', 'v1')
  store.record('s1', '/f2', 'f2', 'v2')
  store.record('s1', '/f3', 'f3', 'v3')
  store.record('s1', '/f4', 'f4', 'v4') // overflow: rewrite keeping newest 2
  const revived = new ObservationStore(validateConfig({ maxEntriesPerSession: 4 }), dir)
  assert.equal(revived.parentOf('s1'), 's0')
  assert.equal(revived.lookupIn('s1', '/f4') !== undefined, true)
  assert.equal(revived.lookupIn('s1', '/f3') !== undefined, true)
  assert.equal(revived.lookupIn('s1', '/f0'), undefined)
  const text = readFileSync(join(dir, `${sanitizeSessionId('s1')}.jsonl`), 'utf8')
  const lines = text.split('\n').filter((line) => line.length > 0)
  assert.equal(lines.length, 3) // header + two records
  assert.equal(lines[0].includes('"hdr"'), true)
})

test('a corrupt sidecar loads its healthy lines only', () => {
  const { store, dir } = freshStore()
  store.record('s1', '/tmp/good.ts', 'good.ts', 'v1')
  const file = join(dir, `${sanitizeSessionId('s1')}.jsonl`)
  writeFileSync(file, '{corrupt!\n' + readFileSync(file, 'utf8'), 'utf8')
  const revived = new ObservationStore(validateConfig({}), dir)
  assert.deepEqual(revived.lookup(['s1'], '/tmp/good.ts'), { version: 'v1', sessionId: 's1' })
})

test('write failures disable the store fail-soft while the mirror keeps serving', () => {
  // A directory planted where the sidecar file should be makes every write throw.
  const dir = mkdtempSync(join(tmpdir(), 'fs-obs-log-'))
  dirs.push(dir)
  mkdirSync(join(dir, `${sanitizeSessionId('s1')}.jsonl`))
  const store = new ObservationStore(validateConfig({ maxWriteFailures: 2 }), dir)
  store.record('s1', '/tmp/x.ts', 'x.ts', 'v1')
  assert.equal(store.writeDisabled, false)
  store.record('s1', '/tmp/y.ts', 'y.ts', 'v1')
  assert.equal(store.writeDisabled, true)
  // Mirror still answers this process.
  assert.deepEqual(store.lookup(['s1'], '/tmp/x.ts'), { version: 'v1', sessionId: 's1' })
})

test('serialize/parse round trips records and headers', () => {
  const record = { v: 1 as const, targetKey: '/k', displayPath: 'k', version: 'v9', at: 123 }
  assert.deepEqual(parseSidecarLine(serializeSidecarLine(record).trimEnd()), record)
  const header = { hdr: 1 as const, id: 's1' }
  assert.deepEqual(parseSidecarLine(serializeSidecarLine(header).trimEnd()), header)
})
