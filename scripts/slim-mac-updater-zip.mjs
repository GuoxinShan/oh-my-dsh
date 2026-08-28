/**
 * Replace the electron-builder Mac updater zip with a copy of the signed
 * .app that omits runtime.tar.gz. DMG stays self-contained. Blockmap and
 * latest-mac.yml are regenerated from the slim zip so differential matches
 * what clients actually download.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

export function patchUpdaterYml(yml, sha512, size) {
  return yml
    .replace(/^(\s*sha512:\s*)\S+ *$/gm, `$1${sha512}`)
    .replace(/^(\s*size:\s*)\d+ *$/gm, `$1${String(size)}`)
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

function updateLatestYml(zipPath) {
  const ymlPath = join(releaseDir, 'latest-mac.yml')
  if (!existsSync(ymlPath)) {
    throw new Error('slim-mac-updater-zip: latest-mac.yml missing')
  }
  const sha512 = sha512Base64(zipPath)
  const size = statSync(zipPath).size
  writeFileSync(ymlPath, patchUpdaterYml(readFileSync(ymlPath, 'utf8'), sha512, size))
  console.log(`slim-mac-updater-zip: latest-mac.yml sha512/size → ${size} bytes`)
}

export async function slimMacUpdaterZip() {
  if (process.platform !== 'darwin') {
    console.log('slim-mac-updater-zip: skip (not macOS)')
    return
  }
  const app = findMacApp()
  const zip = findUpdaterZip()
  if (app === undefined || zip === undefined) {
    console.log('slim-mac-updater-zip: skip (no mac .app/zip in release/)')
    return
  }
  const stage = mkdtempSync(join(tmpdir(), 'dsh-slim-'))
  const stagedApp = join(stage, 'Oh My DSH.app')
  execFileSync('ditto', [app, stagedApp], { stdio: 'inherit' })
  const resources = join(stagedApp, 'Contents', 'Resources', 'resources')
  const removed = existsSync(resources) ? stripRuntimeResources(resources) : []
  if (!removed.includes('runtime.tar.gz')) {
    console.log('slim-mac-updater-zip: runtime.tar.gz already absent; keep existing zip')
    rmSync(stage, { recursive: true, force: true })
    return
  }
  resignApp(stagedApp)
  zipApp(stagedApp, zip)
  writeBlockmap(zip)
  updateLatestYml(zip)
  rmSync(stage, { recursive: true, force: true })
  const mb = (statSync(zip).size / 1024 / 1024).toFixed(1)
  console.log(`slim-mac-updater-zip: wrote ${zip} (${mb} MB, stripped ${removed.join(', ')})`)
}

const invoked = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (invoked) await slimMacUpdaterZip()
