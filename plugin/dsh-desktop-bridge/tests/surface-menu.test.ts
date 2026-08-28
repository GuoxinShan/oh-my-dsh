import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  installSurfaceMenu,
  isBrandArea,
  SURFACE_SWITCH_COMMAND,
} from '../src/client/surface-menu.ts'

interface StubElement {
  closest: (selector: string) => unknown
}

function el(matched: string | null): StubElement {
  return { closest: () => matched }
}

describe('isBrandArea', () => {
  it('matches inside the brand mark and brand name slot wrappers', () => {
    assert.equal(isBrandArea(el('[data-slot="sidebar.brand.mark"]')), true)
    assert.equal(isBrandArea(el('[data-slot="sidebar.brand.name"]')), true)
  })
  it('rejects unrelated targets and non-elements', () => {
    assert.equal(isBrandArea(el(null)), false)
    assert.equal(isBrandArea(null), false)
    assert.equal(isBrandArea({}), false)
  })
})

interface Recorded {
  type: string
  listener: (event: unknown) => void
  capture: boolean
}

function fakeDocument(): { doc: Document; added: Recorded[]; removed: Recorded[] } {
  const added: Recorded[] = []
  const removed: Recorded[] = []
  const doc = {
    addEventListener: (type: string, listener: (event: unknown) => void, capture: boolean) => {
      added.push({ type, listener, capture })
    },
    removeEventListener: (type: string, listener: (event: unknown) => void, capture: boolean) => {
      removed.push({ type, listener, capture })
    },
  } as unknown as Document
  return { doc, added, removed }
}

function contextMenuEvent(target: unknown): { target: unknown; defaultPrevented: boolean; preventDefault: () => void } {
  return {
    target,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true },
  }
}

describe('installSurfaceMenu', () => {
  it('fires the shell command only for brand-area right-clicks', async () => {
    const { doc, added } = fakeDocument()
    const calls: string[] = []
    const invoke = { invoke: (cmd: string) => { calls.push(cmd); return Promise.resolve() } }
    const warnings: string[] = []
    const dispose = installSurfaceMenu(doc, invoke, { warn: (m) => { warnings.push(m) } })
    assert.equal(added.length, 1)
    assert.equal(added[0]!.type, 'contextmenu')
    assert.equal(added[0]!.capture, true)

    const outside = contextMenuEvent(el(null))
    added[0]!.listener(outside)
    assert.equal(outside.defaultPrevented, false)
    assert.deepEqual(calls, [])

    const inside = contextMenuEvent(el('[data-slot="sidebar.brand.mark"]'))
    added[0]!.listener(inside)
    assert.equal(inside.defaultPrevented, true)
    assert.deepEqual(calls, [SURFACE_SWITCH_COMMAND])
    assert.deepEqual(warnings, [])
    dispose()
  })

  it('warns instead of throwing when the shell rejects the command', async () => {
    const { doc, added } = fakeDocument()
    const invoke = { invoke: () => Promise.reject(new Error('unknown command')) }
    const warnings: string[] = []
    installSurfaceMenu(doc, invoke, { warn: (m) => { warnings.push(m) } })
    added[0]!.listener(contextMenuEvent(el('[data-slot="sidebar.brand.name"]')))
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /unknown command/)
  })

  it('dispose removes the listener', () => {
    const { doc, added, removed } = fakeDocument()
    const dispose = installSurfaceMenu(doc, { invoke: () => Promise.resolve() }, { warn: () => {} })
    dispose()
    assert.deepEqual(removed, added)
  })
})
