import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  electronFrameworksDir,
  ensureSidecarNodeApp,
  isAdhocCodesignText,
  sidecarHelperUnsafeToExec,
} from './sidecar-node-app.ts'

describe('sidecar helper signature', () => {
  it('treats ad-hoc output as safe and Developer ID + runtime as unsafe', () => {
    assert.equal(isAdhocCodesignText('Signature=adhoc\nTeamIdentifier=not set'), true)
    assert.equal(isAdhocCodesignText('CodeDirectory v=20400 size=333 flags=0x2(adhoc)'), true)
    assert.equal(sidecarHelperUnsafeToExec('Signature=adhoc\nflags=0x2(adhoc)'), false)
    assert.equal(
      sidecarHelperUnsafeToExec(
        'Authority=Developer ID Application: Guoxin Shan (26V3H94EN7)\nflags=0x10000(runtime)',
      ),
      true,
    )
    assert.equal(sidecarHelperUnsafeToExec('code object is not signed at all'), false)
  })
})

describe('ensureSidecarNodeApp', () => {
  it('is a no-op when Frameworks is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sidecar-node-'))
    try {
      const stub = path.join(root, 'node')
      fs.writeFileSync(stub, 'not-electron')
      assert.equal(ensureSidecarNodeApp(stub, root), stub)
      assert.equal(fs.existsSync(path.join(root, 'sidecar-node')), false)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('builds an LSUIElement helper around the electron stub', {
    skip: process.platform !== 'darwin',
  }, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sidecar-node-'))
    try {
      const macOS = path.join(root, 'Fake.app/Contents/MacOS')
      const frameworks = path.join(root, 'Fake.app/Contents/Frameworks')
      fs.mkdirSync(macOS, { recursive: true })
      fs.mkdirSync(frameworks, { recursive: true })
      const stub = path.join(macOS, 'Electron')
      fs.writeFileSync(stub, 'electron-stub')
      fs.chmodSync(stub, 0o755)
      assert.equal(electronFrameworksDir(stub), frameworks)

      const helper = ensureSidecarNodeApp(stub, root)
      assert.notEqual(helper, stub)
      assert.equal(fs.readFileSync(helper, 'utf8'), 'electron-stub')
      const contents = path.dirname(path.dirname(helper))
      const helperRoot = path.dirname(path.dirname(contents))
      assert.equal(fs.existsSync(path.join(helperRoot, 'stub-stamp')), true)
      const plist = fs.readFileSync(path.join(contents, 'Info.plist'), 'utf8')
      assert.match(plist, /LSUIElement/)
      assert.match(plist, /LSBackgroundOnly/)
      assert.match(plist, /dev\.dsh\.desktop\.node/)
      const fwLink = path.join(contents, 'Frameworks')
      assert.equal(fs.realpathSync(fwLink), fs.realpathSync(frameworks))
      assert.equal(ensureSidecarNodeApp(stub, root), helper)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
