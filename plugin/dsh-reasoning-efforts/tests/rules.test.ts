/**
 * Unit tests for dsh-reasoning-efforts' pure planning logic: config
 * validation (fail-loud mirroring of llm-pi-ai's resolution rules), the two
 * pure candidate gates, and the path-op construction.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFillOps,
  collectCandidates,
  validateConfig,
  validateEfforts,
} from '../src/rules.ts'

const grokRules = validateConfig({
  rules: [
    { routes: ['grok'], include: 'non-reasoning', efforts: false },
    { routes: ['grok'], include: '^(grok$|grok-latest$|composer|grok-4|grok-composer)', efforts: { low: 'low', medium: 'medium', high: 'high' } },
  ],
}).rules

/** The user-layer providers shape these tests read. */
function userProviders(): Record<string, unknown> {
  return {
    grok: {
      models: [
        { id: 'grok-4.6', name: 'Grok 4.6', contextWindow: 500000 },
        { id: 'grok-4.20-non-reasoning', name: 'Grok 4.20 Non Reasoning' },
        { id: 'grok-imagine', name: 'Grok Imagine' },
        { id: 'grok-4.6-pinned', name: 'Pinned', reasoningEfforts: false },
        { id: 'grok-4.6-declared', name: 'Declared', reasoningEfforts: { high: 'high' } },
      ],
    },
    'zai-coding-cn': {
      models: [{ id: 'glm-5.3', name: 'GLM-5.3', reasoningEfforts: { off: null, high: 'high', max: 'max' } }],
    },
  }
}

test('validateConfig accepts the dormant postures', () => {
  assert.deepEqual(validateConfig(undefined), { rules: [] })
  assert.deepEqual(validateConfig(null), { rules: [] })
  assert.deepEqual(validateConfig({}), { rules: [] })
})

test('validateConfig rejects malformed rules naming the field', () => {
  assert.throws(() => validateConfig({ rules: {} }), /config\.rules must be an array/)
  assert.throws(() => validateConfig({ rules: [{ routes: [], include: 'x', efforts: false }] }), /routes/)
  assert.throws(() => validateConfig({ rules: [{ routes: ['grok'], include: '[', efforts: false }] }), /include.*not a valid regex/)
  assert.throws(() => validateConfig({ rules: [{ routes: ['grok'], include: 'x', efforts: true }] }), /efforts/)
})

test('validateEfforts mirrors llm-pi-ai resolution rules', () => {
  assert.equal(validateEfforts(false, 'efforts'), false)
  assert.deepEqual(validateEfforts({ off: null, high: 'high' }, 'efforts'), { off: null, high: 'high' })
  assert.throws(() => validateEfforts({}, 'efforts'), /empty/)
  assert.throws(() => validateEfforts({ off: null }, 'efforts'), /no level beyond "off"/)
  assert.throws(() => validateEfforts({ high: null }, 'efforts'), /high.*needs the wire value/)
  assert.throws(() => validateEfforts({ high: '' }, 'efforts'), /non-empty string/)
  assert.throws(() => validateEfforts({ ultra: 'ultra' }, 'efforts'), /not a pi-ai thinking level/)
})

test('collectCandidates applies gate 1 (explicit declarations win) and gate 2 (ordered rules)', () => {
  const candidates = collectCandidates(userProviders(), grokRules)
  assert.deepEqual(
    candidates.map(candidate => [candidate.route, candidate.modelId, candidate.source, candidate.index]),
    [
      ['grok', 'grok-4.6', 'models', 0],
      ['grok', 'grok-4.20-non-reasoning', 'models', 1],
    ],
  )
  // The narrowing rule pins non-reasoning; the broad rule fills reasoning ids;
  // imagine (no match), pinned, and declared entries are invisible.
  assert.equal(candidates[0]?.efforts, grokRules[1]?.efforts)
  assert.equal(candidates[1]?.efforts, false)
})

test('collectCandidates sees modelOverrides entries too', () => {
  const providers = { openai: { modelOverrides: { 'gpt-5.4': {}, 'o3': { reasoningEfforts: false } } } }
  const rules = validateConfig({ rules: [{ routes: ['openai'], include: '.', efforts: { high: 'high' } }] }).rules
  const candidates = collectCandidates(providers, rules)
  assert.deepEqual(candidates.map(candidate => [candidate.modelId, candidate.source]), [['gpt-5.4', 'modelOverrides']])
})

test('collectCandidates ignores routes no rule names', () => {
  const candidates = collectCandidates(userProviders(), grokRules)
  assert.ok(candidates.every(candidate => candidate.route === 'grok'))
})

test('buildFillOps writes one models-array op per route and surgical override ops', () => {
  const providers = userProviders()
  const candidates = collectCandidates(providers, grokRules)
  const ops = buildFillOps(candidates, providers)
  assert.equal(ops.length, 1)
  assert.deepEqual(ops[0]?.path, ['providers', 'grok', 'models'])
  const models = ops[0]?.value as Record<string, unknown>[]
  assert.equal(models.length, 5)
  assert.deepEqual(models[0]?.reasoningEfforts, { low: 'low', medium: 'medium', high: 'high' })
  assert.equal(models[1]?.reasoningEfforts, false)
  assert.equal(models[2]?.reasoningEfforts, undefined) // untouched: no rule matched
  assert.equal(models[3]?.reasoningEfforts, false) // untouched: already declared
  assert.deepEqual(models[4]?.reasoningEfforts, { high: 'high' }) // untouched: already declared
  // Sibling fields ride along verbatim.
  assert.equal(models[0]?.name, 'Grok 4.6')
  assert.equal(models[0]?.contextWindow, 500000)

  const overrideOps = buildFillOps(
    [{ route: 'openai', modelId: 'gpt-5.4', efforts: { high: 'high' }, source: 'modelOverrides', index: -1 }],
    { openai: { modelOverrides: { 'gpt-5.4': { name: 'GPT-5.4' } } } },
  )
  assert.deepEqual(overrideOps.map(op => op.path), [['providers', 'openai', 'modelOverrides', 'gpt-5.4', 'reasoningEfforts']])
})

test('buildFillOps detaches declaration data from the config', () => {
  const efforts = { high: 'high' } as { high: string }
  const ops = buildFillOps(
    [{ route: 'r', modelId: 'm', efforts, source: 'models', index: 0 }],
    { r: { models: [{ id: 'm' }] } },
  )
  const written = (ops[0]?.value as { reasoningEfforts: unknown }[])[0]?.reasoningEfforts as { high: string }
  assert.notEqual(written, efforts)
  written.high = 'mutated'
  assert.equal(efforts.high, 'high')
})

test('buildFillOps groups multiple models of one route into a single array op', () => {
  const ops = buildFillOps(
    [
      { route: 'grok', modelId: 'a', efforts: false, source: 'models', index: 0 },
      { route: 'grok', modelId: 'b', efforts: { high: 'high' }, source: 'models', index: 2 },
    ],
    { grok: { models: [{ id: 'a' }, { id: 'other' }, { id: 'b' }] } },
  )
  assert.equal(ops.length, 1)
  const models = ops[0]?.value as Record<string, unknown>[]
  assert.deepEqual(models.map(entry => entry.reasoningEfforts), [false, undefined, { high: 'high' }])
})
