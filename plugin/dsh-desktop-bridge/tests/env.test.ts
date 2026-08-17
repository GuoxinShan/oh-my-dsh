import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { probeDesktop } from '../src/client/env.ts'

const noop = (): void => {}

function windowWith(gate: unknown, internals?: unknown): { __DSH_DESKTOP__?: unknown; __TAURI_INTERNALS__?: { invoke: () => Promise<string> } } {
  return { __DSH_DESKTOP__: gate, __TAURI_INTERNALS__: internals as { invoke: () => Promise<string> } | undefined }
}

const GOOD_GATE = { version: 1, shell: 'dsh-desktop', platform: 'darwin' }
const INTERNALS = { invoke: async () => 'ok' }

describe('probeDesktop', () => {
  it('reports absent in a plain browser', () => {
    assert.deepEqual(probeDesktop(windowWith(undefined), noop), { status: 'absent' })
    assert.deepEqual(probeDesktop(windowWith(undefined, INTERNALS), noop), { status: 'absent' })
  })
  it('reports ready when both signals are present and well-formed', () => {
    const probe = probeDesktop(windowWith(GOOD_GATE, INTERNALS), noop)
    assert.equal(probe.status, 'ready')
    if (probe.status !== 'ready') return
    assert.equal(probe.gate.shell, 'dsh-desktop')
    assert.equal(typeof probe.invoke.invoke, 'function')
  })
  it('downgrades an unknown future gate version to 1 with a warning', () => {
    const warnings: string[] = []
    const probe = probeDesktop(windowWith({ ...GOOD_GATE, version: 7 }, INTERNALS), (m) => { warnings.push(m) })
    assert.equal(probe.status, 'ready')
    if (probe.status !== 'ready') return
    assert.equal(probe.gate.version, 1)
    assert.equal(warnings.length, 1)
  })
  it('reports a contract violation when the gate is malformed', () => {
    assert.equal(probeDesktop(windowWith('yes', INTERNALS), noop).status, 'shell-contract-violation')
    assert.equal(probeDesktop(windowWith({ version: 0, shell: 'x', platform: 'y' }, INTERNALS), noop).status, 'shell-contract-violation')
    assert.equal(probeDesktop(windowWith({ shell: 'x', platform: 'y' }, INTERNALS), noop).status, 'shell-contract-violation')
  })
  it('reports a contract violation when the Tauri carrier is missing', () => {
    const probe = probeDesktop(windowWith(GOOD_GATE, undefined), noop)
    assert.equal(probe.status, 'shell-contract-violation')
    if (probe.status !== 'shell-contract-violation') return
    assert.match(probe.reason, /__TAURI_INTERNALS__/)
  })
})
