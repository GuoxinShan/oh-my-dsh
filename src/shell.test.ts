import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { planProfileAdoption } from './adoption-plan.ts'
import { shouldRetainBackground } from './keep-alive.ts'
import { sanitizeDownloadName, uniquePath } from './files.ts'
import { composeProcessPath, bundledRuntime, oneNodeForRuntimeDir, selectAssembledRuntimeDir, sidecarEnv } from './runtime.ts'
import { sweepDecision } from './sidecar.ts'
import {
  claimUpdateCheck,
  resetUpdateStatusForTests,
  updateStatusSnapshot,
} from './updater-state.ts'
import { allowedExternalUrl } from './urls.ts'

describe('sidecarEnv', () => {
  it('does not leak ELECTRON_RUN_AS_NODE onto a two-node sidecar', () => {
    const previous = process.env.ELECTRON_RUN_AS_NODE
    process.env.ELECTRON_RUN_AS_NODE = '1'
    const runtime = {
      node: '/usr/bin/node',
      argsPrefix: [],
      cli: 'cli.js',
      cwd: '/',
      pathPrepend: [],
      oneNode: false,
    }
    try {
      assert.equal(sidecarEnv(runtime).ELECTRON_RUN_AS_NODE, undefined)
      assert.equal(sidecarEnv({ ...runtime, oneNode: true }).ELECTRON_RUN_AS_NODE, '1')
    } finally {
      if (previous === undefined) delete process.env.ELECTRON_RUN_AS_NODE
      else process.env.ELECTRON_RUN_AS_NODE = previous
    }
  })
})

describe('bundledRuntime one-node PATH', () => {
  it('puts the Electron node shim ahead of tools/.bin and drops dead node stubs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-onenode-'))
    try {
      const cli = path.join(root, 'dsh/node_modules/@deepseek-ai/dsh/lib')
      fs.mkdirSync(cli, { recursive: true })
      fs.writeFileSync(path.join(cli, 'bin.js'), '')
      const toolsBin = path.join(root, 'tools/node_modules/.bin')
      fs.mkdirSync(toolsBin, { recursive: true })
      fs.writeFileSync(path.join(toolsBin, 'node'), '#!/bin/sh\nexit 1\n')
      fs.chmodSync(path.join(toolsBin, 'node'), 0o755)
      const runtime = bundledRuntime(root, true, '/Applications/Electron.app/Contents/MacOS/Electron', false)
      assert.equal(runtime.oneNode, true)
      assert.equal(runtime.pathPrepend.length, 2)
      assert.ok(runtime.pathPrepend[0]!.endsWith(`${path.sep}node-shim`))
      assert.equal(runtime.pathPrepend[1], toolsBin)
      assert.equal(fs.existsSync(path.join(toolsBin, 'node')), false)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('selectAssembledRuntimeDir', () => {
  it('uses the pinned sha when that tree exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-runtime-'))
    const pinned = path.join(root, 'abc')
    fs.mkdirSync(path.join(pinned, 'dsh/node_modules/@deepseek-ai/dsh/lib'), { recursive: true })
    fs.writeFileSync(path.join(pinned, 'dsh/node_modules/@deepseek-ai/dsh/lib/bin.js'), '')
    assert.equal(selectAssembledRuntimeDir(root, 'abc'), pinned)
    fs.rmSync(root, { recursive: true, force: true })
  })
  it('falls back to the only assembled tree when the pin is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-runtime-'))
    const other = path.join(root, 'def')
    fs.mkdirSync(path.join(other, 'dsh/node_modules/@deepseek-ai/dsh/lib'), { recursive: true })
    fs.writeFileSync(path.join(other, 'dsh/node_modules/@deepseek-ai/dsh/lib/bin.js'), '')
    assert.equal(selectAssembledRuntimeDir(root, 'abc'), other)
    fs.rmSync(root, { recursive: true, force: true })
  })
  it('does not guess when multiple trees exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-runtime-'))
    for (const sha of ['aaa', 'bbb']) {
      const dir = path.join(root, sha)
      fs.mkdirSync(path.join(dir, 'dsh/node_modules/@deepseek-ai/dsh/lib'), { recursive: true })
      fs.writeFileSync(path.join(dir, 'dsh/node_modules/@deepseek-ai/dsh/lib/bin.js'), '')
    }
    assert.equal(selectAssembledRuntimeDir(root, 'missing'), undefined)
    fs.rmSync(root, { recursive: true, force: true })
  })
})

describe('oneNodeForRuntimeDir', () => {
  it('packaged builds always share Electron Node', () => {
    const previous = process.env.DSH_ELECTRON_ONE_NODE
    delete process.env.DSH_ELECTRON_ONE_NODE
    try {
      assert.equal(oneNodeForRuntimeDir(true, undefined), true)
    } finally {
      if (previous === undefined) delete process.env.DSH_ELECTRON_ONE_NODE
      else process.env.DSH_ELECTRON_ONE_NODE = previous
    }
  })
  it('unpackaged follows the rebuild marker on the selected tree', () => {
    const previous = process.env.DSH_ELECTRON_ONE_NODE
    delete process.env.DSH_ELECTRON_ONE_NODE
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-abi-'))
    try {
      assert.equal(oneNodeForRuntimeDir(false, root), false)
      fs.writeFileSync(path.join(root, '.electron-abi'), '37.2.6\n')
      assert.equal(oneNodeForRuntimeDir(false, root), true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
      if (previous === undefined) delete process.env.DSH_ELECTRON_ONE_NODE
      else process.env.DSH_ELECTRON_ONE_NODE = previous
    }
  })
  it('env override wins over the marker', () => {
    const previous = process.env.DSH_ELECTRON_ONE_NODE
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-abi-'))
    fs.writeFileSync(path.join(root, '.electron-abi'), '37.2.6\n')
    try {
      process.env.DSH_ELECTRON_ONE_NODE = '0'
      assert.equal(oneNodeForRuntimeDir(true, root), false)
      process.env.DSH_ELECTRON_ONE_NODE = '1'
      assert.equal(oneNodeForRuntimeDir(false, undefined), true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
      if (previous === undefined) delete process.env.DSH_ELECTRON_ONE_NODE
      else process.env.DSH_ELECTRON_ONE_NODE = previous
    }
  })
})

describe('composeProcessPath', () => {
  it('prepends preferred dirs and de-duplicates', () => {
    const composed = composeProcessPath(['/a', '/b'], `/b${path.delimiter}/c`)
    assert.equal(composed, ['/a', '/b', '/c'].join(path.delimiter))
  })
})

describe('shouldRetainBackground', () => {
  it('hides the macOS window instead of quitting, except on Cmd+Q', () => {
    assert.equal(shouldRetainBackground('darwin', false), true)
    assert.equal(shouldRetainBackground('darwin', true), false)
    assert.equal(shouldRetainBackground('win32', false), false)
    assert.equal(shouldRetainBackground('linux', false), false)
  })
})

describe('sweepDecision', () => {
  it('keeps a live shell with a live sidecar', () => {
    assert.equal(sweepDecision(true, true), 'keep')
  })
  it('forgets a dead sidecar', () => {
    assert.equal(sweepDecision(true, false), 'forget')
    assert.equal(sweepDecision(false, false), 'forget')
  })
  it('reaps an orphan sidecar', () => {
    assert.equal(sweepDecision(false, true), 'reap')
  })
})

describe('planProfileAdoption', () => {
  it('prompts only for unowned existing or restored homes', () => {
    assert.equal(planProfileAdoption(false, undefined), 'startFresh')
    assert.equal(planProfileAdoption(true, undefined), 'askExisting')
    assert.equal(planProfileAdoption(true, 'adopting'), 'resume')
    assert.equal(planProfileAdoption(true, 'active'), 'resume')
    assert.equal(planProfileAdoption(true, 'restorePending'), 'resume')
    for (const status of ['consentRequired', 'restored', 'restoreAbandoned'] as const) {
      assert.equal(planProfileAdoption(false, status), 'askExisting')
    }
  })
})

describe('openExternal schemes', () => {
  it('allows http https mailto tel', () => {
    assert.equal(allowedExternalUrl('https://example.com'), true)
    assert.equal(allowedExternalUrl('mailto:a@b.c'), true)
    assert.equal(allowedExternalUrl('tel:+1'), true)
    assert.equal(allowedExternalUrl('file:///tmp/x'), false)
    assert.equal(allowedExternalUrl('javascript:alert(1)'), false)
  })
})

describe('saveFile helpers', () => {
  it('strips path components', () => {
    assert.equal(sanitizeDownloadName('../../evil.txt'), 'evil.txt')
    assert.equal(sanitizeDownloadName(''), 'download')
  })
  it('adds a numeric suffix when the name exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-electron-'))
    fs.writeFileSync(path.join(dir, 'a.txt'), '1')
    assert.equal(path.basename(uniquePath(dir, 'a.txt')), 'a-1.txt')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('updater claims', () => {
  it('refuses overlapping operations', () => {
    resetUpdateStatusForTests()
    assert.equal(updateStatusSnapshot().phase, 'idle')
    claimUpdateCheck()
    assert.equal(updateStatusSnapshot().phase, 'checking')
    assert.throws(() => claimUpdateCheck(), /already in progress/)
    resetUpdateStatusForTests()
  })
})
