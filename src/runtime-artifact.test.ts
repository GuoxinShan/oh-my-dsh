import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { releaseRuntimeDir } from './runtime.ts'
import {
  decideRuntimeSource,
  patchUpdaterYml,
  runtimeArtifactName,
  runtimeDownloadUrls,
  stripRuntimeResources,
} from './runtime-artifact.ts'

describe('decideRuntimeSource', () => {
  it('uses the hashed cache when .ok matches', () => {
    assert.equal(decideRuntimeSource({ okMatches: true, bundledTarExists: false }), 'ok-cache')
    assert.equal(decideRuntimeSource({ okMatches: true, bundledTarExists: true }), 'ok-cache')
  })

  it('extracts the bundled tar when present', () => {
    assert.equal(decideRuntimeSource({ okMatches: false, bundledTarExists: true }), 'bundled-tar')
  })

  it('downloads when the slim zip omitted the tar', () => {
    assert.equal(decideRuntimeSource({ okMatches: false, bundledTarExists: false }), 'download')
  })
})

describe('runtime artifact names', () => {
  it('is content-addressed by sha and build platform', () => {
    assert.equal(
      runtimeArtifactName('222343c801cf39f817709c373dbfc3b3a7ba84b4', 'darwin', 'arm64'),
      'runtime-222343c801cf39f817709c373dbfc3b3a7ba84b4-darwin-arm64.tar.gz',
    )
  })

  it('lists the versioned Release URL before latest/download', () => {
    const urls = runtimeDownloadUrls({
      sha: 'abc',
      version: '0.3.0-rc.4',
      platform: 'darwin',
      arch: 'arm64',
    })
    assert.equal(urls[0], 'https://github.com/aka-danielZhang/oh-my-dsh/releases/download/v0.3.0-rc.4/runtime-abc-darwin-arm64.tar.gz')
    assert.ok(urls[1]?.includes('/releases/latest/download/runtime-abc-darwin-arm64.tar.gz'))
  })
})

describe('stripRuntimeResources', () => {
  it('removes runtime.tar.gz and the cache marker', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-slim-'))
    fs.writeFileSync(path.join(dir, 'runtime.tar.gz'), 'tar')
    fs.writeFileSync(path.join(dir, 'runtime.tar.gz.sha'), 'key')
    fs.writeFileSync(path.join(dir, 'runtime-revision.json'), '{}')
    assert.deepEqual(stripRuntimeResources(dir).sort(), ['runtime.tar.gz', 'runtime.tar.gz.sha'])
    assert.equal(fs.existsSync(path.join(dir, 'runtime.tar.gz')), false)
    assert.equal(fs.existsSync(path.join(dir, 'runtime-revision.json')), true)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('patchUpdaterYml', () => {
  it('rewrites sha512 and size after the slim zip is rebuilt', () => {
    const yml = [
      'version: 0.3.0-rc.4',
      'files:',
      '  - url: Oh-My-DSH-0.3.0-rc.4-arm64.zip',
      '    sha512: oldhash',
      '    size: 476000000',
      'path: Oh-My-DSH-0.3.0-rc.4-arm64.zip',
      'sha512: oldhash',
      '',
    ].join('\n')
    const next = patchUpdaterYml(yml, 'newhash', 360000000)
    assert.match(next, /sha512: newhash/)
    assert.match(next, /size: 360000000/)
    assert.equal(next.includes('oldhash'), false)
  })
})

describe('releaseRuntimeDir cache hit', () => {
  it('returns the hashed cache without needing a bundled tar', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'))
    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-app-'))
    const resources = path.join(appRoot, 'resources')
    const sha = 'deadbeefcafebabe'
    const hash = 'abc123'
    const previousHome = process.env.HOME
    const previousResources = Object.getOwnPropertyDescriptor(process, 'resourcesPath')
    fs.mkdirSync(resources, { recursive: true })
    fs.mkdirSync(path.join(home, '.dsh-desktop', 'runtime', sha), { recursive: true })
    fs.writeFileSync(path.join(home, '.dsh-desktop', 'runtime', sha, '.ok'), `${hash}\n`)
    fs.writeFileSync(path.join(resources, 'runtime-revision.json'), JSON.stringify({ sha, runtimeTarball: hash }))
    process.env.HOME = home
    Object.defineProperty(process, 'resourcesPath', { configurable: true, value: appRoot })
    try {
      assert.equal(releaseRuntimeDir(true), path.join(home, '.dsh-desktop', 'runtime', sha))
    } finally {
      if (previousHome === undefined) delete process.env.HOME
      else process.env.HOME = previousHome
      if (previousResources === undefined) delete (process as { resourcesPath?: string }).resourcesPath
      else Object.defineProperty(process, 'resourcesPath', previousResources)
      fs.rmSync(home, { recursive: true, force: true })
      fs.rmSync(appRoot, { recursive: true, force: true })
    }
  })
})
