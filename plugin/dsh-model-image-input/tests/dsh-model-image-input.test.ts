import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply } from '../src/index.ts'
import { apply as clientApply, inject } from '../src/client/index.ts'
import {
  choiceOf, collectOps, ownedRoutes, rowLabel, withChoice,
} from '../src/client/drafts.ts'
import type { InputChoice, ModelEntry } from '../src/client/drafts.ts'
import { SECTION_CSS, injectStyles } from '../src/client/styles.ts'
import { en, zh } from '../src/client/locales.ts'

test('host half exports a loadable surface entry', () => {
  assert.equal(typeof apply, 'function')
})

test('client half exports a loadable plugin', () => {
  assert.equal(typeof clientApply, 'function')
  assert.ok(Array.isArray(inject))
  for (const service of ['slots', 'locale', 'settingsScope', 'connection']) {
    assert.ok(inject.includes(service), `inject must declare ${service}`)
  }
})

test('dictionaries share one key set', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
})

test('stylesheet injects only through --dsw-* tokens', () => {
  assert.equal(typeof SECTION_CSS, 'string')
  assert.ok(!/--[0-9a-f]{6}/i.test(SECTION_CSS), 'no hard-coded colors')
  assert.ok(SECTION_CSS.includes('--dsw-alias-'))
  assert.equal(typeof injectStyles(), 'function')
})

test('choiceOf maps stored declarations to picker choices', () => {
  assert.equal(choiceOf({ id: 'm' }), 'inherit')
  assert.equal(choiceOf({ id: 'm', input: ['text', 'image'] }), 'text,image')
  assert.equal(choiceOf({ id: 'm', input: ['image'] }), 'text,image')
  assert.equal(choiceOf({ id: 'm', input: ['text'] }), 'text')
  // An empty or unrecognized declaration states no answer and reads as inherit.
  assert.equal(choiceOf({ id: 'm', input: [] }), 'inherit')
  assert.equal(choiceOf({ id: 'm', input: ['audio'] }), 'inherit')
  assert.equal(choiceOf({ id: 'm', input: 'text,image' }), 'inherit')
})

test('withChoice stores and clears declarations without mutating the row', () => {
  const model: ModelEntry = { id: 'm', name: 'M', contextWindow: 1024, input: ['text', 'image'] }
  const cleared = withChoice(model, 'inherit')
  assert.deepEqual(cleared, { id: 'm', name: 'M', contextWindow: 1024 })
  assert.equal(Object.hasOwn(cleared, 'input'), false)
  assert.deepEqual(withChoice({ id: 'm' }, 'text'), { id: 'm', input: ['text'] })
  assert.deepEqual(withChoice({ id: 'm' }, 'text,image'), { id: 'm', input: ['text', 'image'] })
  assert.deepEqual(model, { id: 'm', name: 'M', contextWindow: 1024, input: ['text', 'image'] })
})

test('ownedRoutes lists only user-owned model catalogs', () => {
  assert.deepEqual(ownedRoutes(undefined), [])
  assert.deepEqual(ownedRoutes('nope'), [])
  const user = {
    providers: {
      catalog: { displayName: 'Catalog', baseURL: 'https://x' },
      custom: { displayName: 'Custom', models: [{ id: 'a' }, 'junk', { id: 'b' }] },
    },
  }
  assert.deepEqual(ownedRoutes(user), [
    { route: 'custom', displayName: 'Custom', models: [{ id: 'a' }, { id: 'b' }] },
  ])
  // No display name stored → the route key names the route.
  assert.equal(ownedRoutes({ providers: { acme: { models: [] } } })[0]?.displayName, 'acme')
  // Non-record profiles are skipped, not fatal.
  assert.deepEqual(
    ownedRoutes({ providers: { broken: 'nope', good: { models: [] } } }).map(r => r.route),
    ['good'],
  )
})

test('collectOps folds overrides onto the current stored arrays', () => {
  const routes = ownedRoutes({
    providers: {
      one: { models: [{ id: 'a' }, { id: 'b', input: ['text'] }] },
      two: { models: [{ id: 'c' }] },
    },
  })
  assert.deepEqual(collectOps(routes, new Map()), [])

  // An override restating the stored declaration changes nothing.
  const one = collectOps(routes, new Map([['one', ['text,image', 'text']]]))
  assert.equal(one.length, 1)
  assert.deepEqual(one[0]?.value, [
    { id: 'a', input: ['text', 'image'] },
    { id: 'b', input: ['text'] },
  ])

  // Untouched rows and fields ride along verbatim.
  const extras = ownedRoutes({
    providers: { one: { models: [{ id: 'a', name: 'A', contextWindow: 4096 }] } },
  })
  assert.deepEqual(collectOps(extras, new Map([['one', ['inherit']]])), [])
  assert.deepEqual(
    collectOps(extras, new Map([['one', ['text,image']]]))[0]?.value,
    [{ id: 'a', name: 'A', contextWindow: 4096, input: ['text', 'image'] }],
  )

  // One op per changed route, in route order; undefined entries are untouched.
  const both = collectOps(routes, new Map<string, (InputChoice | undefined)[]>([
    ['two', ['text,image']],
    ['one', [undefined, 'inherit']],
  ]))
  assert.deepEqual(both.map(op => op.path), [
    ['providers', 'one', 'models'],
    ['providers', 'two', 'models'],
  ])
  assert.deepEqual(both[0]?.value, [{ id: 'a' }, { id: 'b' }])
  assert.deepEqual(both[1]?.value, [{ id: 'c', input: ['text', 'image'] }])
})

test('rowLabel prefers the display name, then the id, then the position', () => {
  assert.equal(rowLabel({ id: 'm', name: 'M' }, 2), 'M')
  assert.equal(rowLabel({ id: 'm' }, 2), 'm')
  assert.equal(rowLabel({}, 2), '#3')
})
