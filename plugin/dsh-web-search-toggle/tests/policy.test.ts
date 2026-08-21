import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import {
  NATIVE_WEB_SEARCH_DISABLED_REASON,
  NATIVE_WEB_SEARCH_SECTION,
  NATIVE_WEB_SEARCH_TOOL,
  installNativeWebSearchAssemblyPolicy,
  nativeWebSearchDenial,
  suppressNativeWebSearch,
} from '../src/policy.ts'

test('suppresses the native search schema and matching prompt section', () => {
  const assembly = {
    sections: [
      { name: 'tool:web_fetch', text: 'fetch guidance' },
      { name: NATIVE_WEB_SEARCH_SECTION, text: 'search guidance' },
      { name: 'foreign', text: 'foreign guidance' },
    ],
    contexts: [{ name: 'runtime', text: 'context' }],
    tools: [
      { name: 'web_fetch', description: 'fetch' },
      { name: NATIVE_WEB_SEARCH_TOOL, description: 'search' },
      { name: 'foreign_tool', description: 'foreign' },
    ],
    variables: { cwd: '/tmp' },
  }

  const filtered = suppressNativeWebSearch(assembly)

  assert.deepEqual(filtered.sections.map(section => section.name), ['tool:web_fetch', 'foreign'])
  assert.deepEqual(filtered.tools.map(tool => tool.name), ['web_fetch', 'foreign_tool'])
  assert.strictEqual(filtered.contexts, assembly.contexts)
  assert.strictEqual(filtered.variables, assembly.variables)
  assert.deepEqual(assembly.sections.map(section => section.name), [
    'tool:web_fetch',
    NATIVE_WEB_SEARCH_SECTION,
    'foreign',
  ])
})

test('suppression is an identity no-op when native search is absent', () => {
  const assembly = {
    sections: [{ name: 'foreign', text: 'foreign guidance' }],
    tools: [{ name: 'foreign_tool', description: 'foreign' }],
  }

  assert.strictEqual(suppressNativeWebSearch(assembly), assembly)
})

test('assembly policy opts into every Agent scope and preserves its disposer', () => {
  const dispose = () => undefined
  let options: unknown
  const fake = {
    on(_event: string, _listener: unknown, passedOptions: unknown) {
      options = passedOptions
      return dispose
    },
  }

  const returned = installNativeWebSearchAssemblyPolicy(
    fake as unknown as Context,
    async () => false,
  )

  assert.deepEqual(options, { global: true })
  assert.strictEqual(returned, dispose)
})

test('execution denial targets only disabled native search', () => {
  assert.equal(
    nativeWebSearchDenial(NATIVE_WEB_SEARCH_TOOL, false),
    NATIVE_WEB_SEARCH_DISABLED_REASON,
  )
  assert.equal(nativeWebSearchDenial(NATIVE_WEB_SEARCH_TOOL, true), undefined)
  assert.equal(nativeWebSearchDenial('mcp__web-search-prime__web_search_prime', false), undefined)
})
