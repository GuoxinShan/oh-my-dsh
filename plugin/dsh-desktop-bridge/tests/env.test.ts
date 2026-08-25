import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { probeDesktop } from '../src/client/env.ts'

const noop = (): void => {}

function windowWith(
  gate: unknown,
  internals?: unknown,
  ipc?: unknown,
): {
  __DSH_DESKTOP__?: unknown
  __TAURI_INTERNALS__?: { invoke: () => Promise<string> }
  __DSH_DESKTOP_IPC__?: { invoke: () => Promise<string> }
} {
  return {
    __DSH_DESKTOP__: gate,
    __TAURI_INTERNALS__: internals as { invoke: () => Promise<string> } | undefined,
    __DSH_DESKTOP_IPC__: ipc as { invoke: () => Promise<string> } | undefined,
  }
}

const GOOD_GATE = { version: 1, shell: 'dsh-desktop', platform: 'darwin' }
const INTERNALS = { invoke: async () => 'ok' }

describe('probeDesktop', () => {
  it('reports absent in a plain browser', () => {
    assert.deepEqual(probeDesktop(windowWith(undefined), noop), { status: 'absent' })
    assert.deepEqual(probeDesktop(windowWith(undefined, INTERNALS), noop), { status: 'absent' })
  })
  it('reports ready when the Electron IPC carrier is present', () => {
    const probe = probeDesktop(windowWith(GOOD_GATE, undefined, INTERNALS), noop)
    assert.equal(probe.status, 'ready')
    if (probe.status !== 'ready') return
    assert.equal(probe.gate.shell, 'dsh-desktop')
    assert.equal(typeof probe.invoke.invoke, 'function')
  })
  it('reports ready when the archived Tauri carrier is present', () => {
    const probe = probeDesktop(windowWith(GOOD_GATE, INTERNALS), noop)
    assert.equal(probe.status, 'ready')
  })
  it('forwards the Electron on() listener when present', () => {
    const seen: unknown[] = []
    const electron = {
      invoke: async () => 'ok',
      on: (_event: string, handler: (payload: unknown) => void) => {
        handler({ sessionId: 's' })
        return () => {}
      },
    }
    const probe = probeDesktop(windowWith(GOOD_GATE, undefined, electron), noop)
    assert.equal(probe.status, 'ready')
    if (probe.status !== 'ready') return
    probe.invoke.on?.('dsh-desktop-notify-click', (payload) => { seen.push(payload) })
    assert.deepEqual(seen, [{ sessionId: 's' }])
  })
  it('prefers the Electron carrier when both are present', () => {
    const electron = { invoke: async () => 'electron' }
    const tauri = { invoke: async () => 'tauri' }
    const probe = probeDesktop(windowWith(GOOD_GATE, tauri, electron), noop)
    assert.equal(probe.status, 'ready')
    if (probe.status !== 'ready') return
    return probe.invoke.invoke('noop').then((value) => {
      assert.equal(value, 'electron')
    })
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
  it('reports a contract violation when no invoke carrier is present', () => {
    const probe = probeDesktop(windowWith(GOOD_GATE, undefined), noop)
    assert.equal(probe.status, 'shell-contract-violation')
    if (probe.status !== 'shell-contract-violation') return
    assert.match(probe.reason, /invoke carrier/)
  })
})
