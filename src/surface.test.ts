import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  DEFAULT_SURFACE,
  isValidProfileName,
  loadActiveSurface,
  saveActiveSurface,
  validateSurfaceDir,
  WEB_APP_BUNDLE,
} from './surface.ts'

function scratch(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-surface-'))
}

function makeProfile(home: string, name: string, bundles: string[] = ['@deepseek-ai/dsh-base', WEB_APP_BUNDLE]): string {
  const dir = path.join(home, 'profiles', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name: `dsh-profile-${name}`, private: true, dsh: { profile: { bundles } } }, null, 2)}\n`,
  )
  return dir
}

describe('isValidProfileName', () => {
  it('accepts plain names and rejects traversal and the module fallback', () => {
    assert.equal(isValidProfileName('web'), true)
    assert.equal(isValidProfileName('work-1'), true)
    assert.equal(isValidProfileName(''), false)
    assert.equal(isValidProfileName('.'), false)
    assert.equal(isValidProfileName('..'), false)
    assert.equal(isValidProfileName('node_modules'), false)
    assert.equal(isValidProfileName('a/b'), false)
    assert.equal(isValidProfileName('a\\b'), false)
  })
})

describe('active surface state', () => {
  it('defaults to web when the state file is missing or corrupt', () => {
    const root = scratch()
    const home = scratch()
    assert.equal(loadActiveSurface(root, home), DEFAULT_SURFACE)
    fs.mkdirSync(path.join(root, 'active-profiles'), { recursive: true })
    // corrupt the only per-home file present
    for (const file of fs.readdirSync(path.join(root, 'active-profiles'))) {
      fs.writeFileSync(path.join(root, 'active-profiles', file), 'not json')
    }
    assert.equal(loadActiveSurface(root, home), DEFAULT_SURFACE)
    saveActiveSurface(root, home, 'work')
    const file = path.join(root, 'active-profiles', fs.readdirSync(path.join(root, 'active-profiles'))[0]!)
    fs.writeFileSync(file, '{"active":"../escape"}')
    assert.equal(loadActiveSurface(root, home), DEFAULT_SURFACE)
  })

  it('round-trips a saved surface and isolates homes from each other', () => {
    const root = scratch()
    const homeA = scratch()
    const homeB = scratch()
    saveActiveSurface(root, homeA, 'work')
    assert.equal(loadActiveSurface(root, homeA), 'work')
    assert.equal(loadActiveSurface(root, homeB), DEFAULT_SURFACE)
    assert.throws(() => saveActiveSurface(root, homeA, '../nope'), /invalid surface profile name/)
  })
})

describe('validateSurfaceDir', () => {
  it('accepts a web-surface profile directory', () => {
    const home = scratch()
    const dir = makeProfile(home, 'work')
    assert.deepEqual(validateSurfaceDir(home, dir), { ok: true, name: 'work' })
  })

  it('rejects directories outside the profiles root', () => {
    const home = scratch()
    const elsewhere = makeProfile(path.join(home, 'elsewhere'), 'work')
    const verdict = validateSurfaceDir(home, elsewhere)
    assert.equal(verdict.ok, false)
    if (!verdict.ok) assert.match(verdict.reason, /profiles/)
  })

  it('rejects the profiles root itself and the module fallback', () => {
    const home = scratch()
    fs.mkdirSync(path.join(home, 'profiles'), { recursive: true })
    assert.equal(validateSurfaceDir(home, path.join(home, 'profiles')).ok, false)
    assert.equal(validateSurfaceDir(home, path.join(home, 'profiles', 'node_modules')).ok, false)
  })

  it('rejects a directory without a readable manifest', () => {
    const home = scratch()
    const dir = path.join(home, 'profiles', 'empty')
    fs.mkdirSync(dir, { recursive: true })
    const verdict = validateSurfaceDir(home, dir)
    assert.equal(verdict.ok, false)
    if (!verdict.ok) assert.match(verdict.reason, /package\.json/)
  })

  it('rejects a profile without the web bundle', () => {
    const home = scratch()
    const dir = makeProfile(home, 'headless-like', ['@deepseek-ai/dsh-base'])
    const verdict = validateSurfaceDir(home, dir)
    assert.equal(verdict.ok, false)
    if (!verdict.ok) assert.match(verdict.reason, /dsh-web-app/)
  })

  it('follows a symlinked profile directory', () => {
    if (process.platform === 'win32') return
    const home = scratch()
    const real = path.join(home, 'elsewhere', 'linked-face')
    fs.mkdirSync(real, { recursive: true })
    fs.writeFileSync(
      path.join(real, 'package.json'),
      `${JSON.stringify({ dsh: { profile: { bundles: [WEB_APP_BUNDLE] } } })}\n`,
    )
    const link = path.join(home, 'profiles', 'linked-face')
    fs.mkdirSync(path.dirname(link), { recursive: true })
    fs.symlinkSync(real, link)
    assert.deepEqual(validateSurfaceDir(home, link), { ok: true, name: 'linked-face' })
  })
})
