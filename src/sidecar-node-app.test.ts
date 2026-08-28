import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { electronFrameworksDir, ensureSidecarNodeApp } from './sidecar-node-app.ts'

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
