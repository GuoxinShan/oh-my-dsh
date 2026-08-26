import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  applyDockGuardEnv,
  dockGuardImports,
  ensureDarwinDockGuard,
  normalizeSpawnArgs,
  rewriteDetachedSpawn,
} from './darwin-dock-guard.ts'

describe('rewriteDetachedSpawn', () => {
  it('leaves attached spawns untouched', () => {
    assert.deepEqual(
      rewriteDetachedSpawn('bash', ['-c', 'echo hi'], { detached: false }, '/tmp/dsh-pgrp'),
      { command: 'bash', args: ['-c', 'echo hi'], options: { detached: false } },
    )
  })

  it('wraps detached posix spawns so the helper becomes the group leader', () => {
    assert.deepEqual(
      rewriteDetachedSpawn('bash', ['-c', 'sleep 1'], { detached: true, stdio: 'pipe' }, '/tmp/dsh-pgrp'),
      {
        command: '/tmp/dsh-pgrp',
        args: ['bash', '-c', 'sleep 1'],
        options: { detached: false, stdio: 'pipe' },
      },
    )
  })

  it('accepts the spawn(command, options) overload', () => {
    assert.deepEqual(
      rewriteDetachedSpawn('sleep', { detached: true }, undefined, '/tmp/dsh-pgrp'),
      { command: '/tmp/dsh-pgrp', args: ['sleep'], options: { detached: false } },
    )
  })

  it('does not wrap its own helper', () => {
    const helper = '/tmp/dsh-pgrp'
    assert.deepEqual(
      rewriteDetachedSpawn(helper, ['bash'], { detached: true }, helper),
      { command: helper, args: ['bash'], options: { detached: true } },
    )
  })
})

describe('normalizeSpawnArgs', () => {
  it('treats a non-array second argument as options', () => {
    assert.deepEqual(normalizeSpawnArgs('sleep', { detached: true }), {
      command: 'sleep',
      args: [],
      options: { detached: true },
    })
  })
})

describe('dockGuardImports / applyDockGuardEnv', () => {
  it('is a no-op without a guard', () => {
    assert.deepEqual(dockGuardImports(undefined), [])
    const env: NodeJS.ProcessEnv = { DSH_DARWIN_PGRP_HELPER: 'x', DSH_DARWIN_HIDE_DOCK: 'y' }
    applyDockGuardEnv(env, undefined)
    assert.equal(env.DSH_DARWIN_PGRP_HELPER, undefined)
    assert.equal(env.DSH_DARWIN_HIDE_DOCK, undefined)
  })
})

describe('ensureDarwinDockGuard', () => {
  it('compiles the helper and dylib on macOS', { skip: process.platform !== 'darwin' }, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-dock-guard-'))
    try {
      const guard = ensureDarwinDockGuard(root)
      assert.ok(guard)
      assert.equal(fs.existsSync(guard.pgrpHelper), true)
      assert.equal(fs.existsSync(guard.hideDockLib), true)
      assert.equal(fs.existsSync(guard.hideDockJs), true)
      assert.equal(fs.existsSync(guard.spawnGuardJs), true)
      const again = ensureDarwinDockGuard(root)
      assert.equal(again?.pgrpHelper, guard.pgrpHelper)
      const probe = spawnSync(guard.pgrpHelper, ['/bin/echo', 'ok'], { encoding: 'utf8' })
      assert.equal(probe.status, 0, probe.stderr)
      assert.equal(probe.stdout.trim(), 'ok')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
