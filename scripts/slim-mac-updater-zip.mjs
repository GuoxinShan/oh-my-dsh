/**
 * Build the Mac updater zip from the signed .app (electron-builder only
 * emits a DMG). The zip omits runtime.tar.gz. Blockmap and latest-mac.yml
 * are written here so they point at the slim zip, never the DMG.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { releaseNotesForVersion } from './release-notes.mjs'

const require = createRequire(import.meta.url)
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = join(repoRoot, 'release')
const runtimeFiles = ['runtime.tar.gz', 'runtime.tar.gz.sha']

export function stripRuntimeResources(resourcesDir) {
  const removed = []
  for (const name of runtimeFiles) {
    const target = join(resourcesDir, name)
    if (!existsSync(target)) continue
    rmSync(target)
    removed.push(name)
  }
  return removed
}

export function latestMacYml(input) {
  const lines = [
    `version: ${input.version}`,
    'files:',
    `  - url: ${input.file}`,
    `    sha512: ${input.sha512}`,
    `    size: ${input.size}`,
    `path: ${input.file}`,
    `sha512: ${input.sha512}`,
    `releaseDate: '${input.releaseDate}'`,
  ]
  const notes = input.releaseNotes?.replace(/\r\n/g, '\n').trim()
  if (notes) {
    lines.push('releaseNotes: |')
    for (const line of notes.split('\n')) lines.push(`  ${line}`)
  }
  lines.push('')
  return lines.join('\n')
}

function findMacApp() {
  for (const dir of ['mac-arm64', 'mac', 'mac-x64']) {
    const app = join(releaseDir, dir, 'Oh My DSH.app')
    if (existsSync(app)) return app
  }
  return undefined
}

function findUpdaterZip() {
  if (!existsSync(releaseDir)) return undefined
  return readdirSync(releaseDir)
    .filter((name) => name.endsWith('.zip') && !name.endsWith('.blockmap'))
    .map((name) => join(releaseDir, name))
    .find((file) => statSync(file).isFile())
}

function zipArchForApp(appPath) {
  if (appPath.includes(`${join('mac-arm64', 'Oh My DSH.app')}`)) return 'arm64'
  if (appPath.includes(`${join('mac-x64', 'Oh My DSH.app')}`)) return 'x64'
  return 'x64'
}

function updaterZipPath(appPath) {
  const existing = findUpdaterZip()
  if (existing) return existing
  const version = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version
  return join(releaseDir, `Oh-My-DSH-${version}-${zipArchForApp(appPath)}.zip`)
}

function codesignIdentity() {
  const raw = process.env.DSH_CODESIGN_IDENTITY || process.env.CSC_NAME || ''
  return raw.replace(/^Developer ID Application:\s*/, '').trim()
}

function resignApp(appPath) {
  const identity = codesignIdentity()
  if (!identity || process.platform !== 'darwin') {
    console.log('slim-mac-updater-zip: skip codesign (no identity)')
    return
  }
  const entitlementsDir = mkdtempSync(join(tmpdir(), 'dsh-ent-'))
  const entitlements = join(entitlementsDir, 'entitlements.plist')
  try {
    const dumped = execFileSync('codesign', ['-d', '--entitlements', ':-', appPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const xml = dumped.includes('<?xml') ? dumped.slice(dumped.indexOf('<?xml')) : ''
    if (xml) writeFileSync(entitlements, xml)
  } catch {
    // unsigned local builds have nothing to dump
  }
  const args = ['--force', '--sign', identity, '--options', 'runtime', '--timestamp']
  if (existsSync(entitlements) && readFileSync(entitlements, 'utf8').includes('<?xml')) {
    args.push('--entitlements', entitlements)
  }
  args.push(appPath)
  execFileSync('codesign', args, { stdio: 'inherit' })
}

function zipApp(appPath, zipPath) {
  rmSync(zipPath, { force: true })
  if (process.platform === 'darwin') {
    execFileSync('ditto', ['-c', '-k', '--keepParent', '--sequesterRsrc', appPath, zipPath], { stdio: 'inherit' })
    return
  }
  execFileSync('zip', ['-r', '-y', zipPath, 'Oh My DSH.app'], { cwd: dirname(appPath), stdio: 'inherit' })
}

function sha512Base64(file) {
  return createHash('sha512').update(readFileSync(file)).digest('base64')
}

function findAppBuilder() {
  try {
    return require('app-builder-bin')
  } catch {
    return undefined
  }
}

function writeBlockmap(zipPath) {
  const blockmap = `${zipPath}.blockmap`
  const appBuilder = findAppBuilder()
  if (appBuilder === undefined) {
    throw new Error('slim-mac-updater-zip: app-builder-bin is required to regenerate the blockmap')
  }
  execFileSync(appBuilder, ['blockmap', '--input', zipPath, '--output', blockmap], { stdio: 'inherit' })
}

function writeLatestYml(zipPath) {
  const version = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version
  const ymlPath = join(releaseDir, 'latest-mac.yml')
  let releaseDate = new Date().toISOString()
  if (existsSync(ymlPath)) {
    const match = readFileSync(ymlPath, 'utf8').match(/^releaseDate:\s*'([^']+)'/m)
    if (match) releaseDate = match[1]
  }
  let releaseNotes
  try {
    const changelog = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8')
    releaseNotes = releaseNotesForVersion(changelog, version).notes
  } catch {
    // local unsigned builds may lack a matching heading
  }
  writeFileSync(ymlPath, latestMacYml({
    version,
    file: basename(zipPath),
    sha512: sha512Base64(zipPath),
    size: statSync(zipPath).size,
    releaseDate,
    releaseNotes,
  }))
  console.log(`slim-mac-updater-zip: wrote ${ymlPath} (${statSync(zipPath).size} bytes)`)
}

export async function slimMacUpdaterZip() {
  if (process.platform !== 'darwin') {
    console.log('slim-mac-updater-zip: skip (not macOS)')
    return
  }
  const app = findMacApp()
  if (app === undefined) {
    throw new Error('slim-mac-updater-zip: no mac .app in release/')
  }
  const zip = updaterZipPath(app)
  const stage = mkdtempSync(join(tmpdir(), 'dsh-slim-'))
  const stagedApp = join(stage, 'Oh My DSH.app')
  execFileSync('ditto', [app, stagedApp], { stdio: 'inherit' })
  const resources = join(stagedApp, 'Contents', 'Resources', 'resources')
  const removed = existsSync(resources) ? stripRuntimeResources(resources) : []
  resignApp(stagedApp)
  zipApp(stagedApp, zip)
  writeBlockmap(zip)
  writeLatestYml(zip)
  rmSync(stage, { recursive: true, force: true })
  const mb = (statSync(zip).size / 1024 / 1024).toFixed(1)
  console.log(`slim-mac-updater-zip: wrote ${zip} (${mb} MB, stripped ${removed.join(', ') || 'nothing'})`)
}

const invoked = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (invoked) await slimMacUpdaterZip()
