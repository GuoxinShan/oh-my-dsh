/**
 * Assemble the shell's bundled assets (release packaging): the self-contained
 * runtime tarball, the desktop-owned plugin tarballs, and the revision
 * manifest, all placed under src-tauri/resources/ for tauri.conf.json
 * bundle.resources.
 *
 * Why tarballs instead of loose resource directories: the runtime tree is a
 * pnpm install (3k+ symlinks, two layers) and tauri-bundler gives no
 * guarantee that directory resources keep symlinks executable-bit-identical
 * (deref-copy would explode the .pnpm store to GBs). A tar round-trip is
 * link-aware, and the shell extracts it once into ~/.dsh-desktop (writable
 * and immune to App Translocation read-only volumes). Apple's notary scanner
 * still descends into archives, so every nested Mach-O is signed before pack.
 *
 * Fixed file names so tauri.conf.json never churns with revisions:
 *   src-tauri/resources/runtime.tar.gz          (dsh/ + tools/, keyed by SHA)
 *   src-tauri/resources/runtime.tar.gz.sha      (cache marker: revision sha)
 *   src-tauri/resources/bridge.tar.gz           (package.json + lib/ + patch)
 *   src-tauri/resources/compaction-hierarchical.tar.gz (host plugin package)
 *   src-tauri/resources/web-search-toggle.tar.gz (host + client plugin package)
 *   src-tauri/resources/model-image-input.tar.gz (client-only plugin package)
 *   src-tauri/resources/send-while-running.tar.gz (client-only plugin package)
 *   src-tauri/resources/runtime-revision.json   (runtime + plugin hashes/versions)
 *
 * `src-tauri/resources/` is gitignored — regenerated per build via
 * `pnpm desktop:prepare` (also wired as tauri beforeBuildCommand).
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, mkdirSync, writeFileSync, statSync, readdirSync, openSync, readSync, closeSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pnpm } from './cli-bins.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const revision = JSON.parse(readFileSync(resolve(repoRoot, 'runtime/revision.json'), 'utf8'))
const runtimeDir = resolve(repoRoot, 'runtime/build', revision.sha)
const bridgeDir = resolve(repoRoot, 'plugin/dsh-desktop-bridge')
const compactionDir = resolve(repoRoot, 'plugin/dsh-compaction-hierarchical')
const webSearchToggleDir = resolve(repoRoot, 'plugin/dsh-web-search-toggle')
const modelImageInputDir = resolve(repoRoot, 'plugin/dsh-model-image-input')
const sendWhileRunningDir = resolve(repoRoot, 'plugin/dsh-send-while-running')
const resourcesDir = resolve(repoRoot, 'src-tauri/resources')

const runtimeTar = resolve(resourcesDir, 'runtime.tar.gz')
const runtimeShaMarker = resolve(resourcesDir, 'runtime.tar.gz.sha')
const bridgeTar = resolve(resourcesDir, 'bridge.tar.gz')
const compactionTar = resolve(resourcesDir, 'compaction-hierarchical.tar.gz')
const webSearchToggleTar = resolve(resourcesDir, 'web-search-toggle.tar.gz')
const modelImageInputTar = resolve(resourcesDir, 'model-image-input.tar.gz')
const sendWhileRunningTar = resolve(resourcesDir, 'send-while-running.tar.gz')
const revisionCopy = resolve(resourcesDir, 'runtime-revision.json')
const webSearchTogglePackage = JSON.parse(readFileSync(resolve(webSearchToggleDir, 'package.json'), 'utf8'))
if (webSearchTogglePackage.name !== 'dsh-web-search-toggle' || webSearchTogglePackage.version !== '0.1.3') {
  throw new Error(`desktop requires dsh-web-search-toggle 0.1.3, found ${webSearchTogglePackage.name}@${webSearchTogglePackage.version}`)
}
const modelImageInputPackage = JSON.parse(readFileSync(resolve(modelImageInputDir, 'package.json'), 'utf8'))
if (modelImageInputPackage.name !== 'dsh-model-image-input' || modelImageInputPackage.version !== '0.1.0') {
  throw new Error(`desktop requires dsh-model-image-input 0.1.0, found ${modelImageInputPackage.name}@${modelImageInputPackage.version}`)
}
const sendWhileRunningPackage = JSON.parse(readFileSync(resolve(sendWhileRunningDir, 'package.json'), 'utf8'))
if (sendWhileRunningPackage.name !== 'dsh-send-while-running' || sendWhileRunningPackage.version !== '0.1.1') {
  throw new Error(`desktop requires dsh-send-while-running 0.1.1, found ${sendWhileRunningPackage.name}@${sendWhileRunningPackage.version}`)
}

function run(cmd, args, opts = {}) {
  const shell = opts.shell ?? (process.platform === 'win32' && /\.cmd$/i.test(String(cmd)))
  execFileSync(cmd, args, { stdio: 'inherit', ...opts, shell })
}

/** GNU tar needs `--force-local` for `C:\...`; Windows 11 bsdtar 3.8.4 rejects it. */
function tarSupportsForceLocal() {
  try {
    return execFileSync('tar', ['--help'], { encoding: 'utf8' }).includes('--force-local')
  } catch (error) {
    const text = `${error.stdout ?? ''}${error.stderr ?? ''}`
    return text.includes('--force-local')
  }
}

function tarCreate(archive, changeDir, entries) {
  const args = []
  if (tarSupportsForceLocal()) args.push('--force-local')
  args.push('--exclude', '.DS_Store', '-czf', archive, '-C', changeDir, ...entries)
  run('tar', args, { cwd: repoRoot })
}

function mb(path) {
  return (statSync(path).size / 1024 / 1024).toFixed(1)
}

function sha256(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256')
    createReadStream(path).on('data', chunk => hash.update(chunk)).on('error', reject).on('end', () => resolvePromise(hash.digest('hex')))
  })
}

// 1. Desktop-owned plugins: verify and build the exact packages bundled below.
console.log('prepare-desktop-bundle: building desktop plugins...')
run(pnpm, ['run', 'plugin:check'], { cwd: repoRoot })
for (const pluginDir of [compactionDir, webSearchToggleDir, modelImageInputDir, sendWhileRunningDir]) {
  for (const script of ['typecheck', 'test', 'build']) {
    run(pnpm, ['run', script], { cwd: pluginDir })
  }
}

// 2. Runtime tree (SHA-keyed cache; seconds when warm).
console.log('prepare-desktop-bundle: assembling runtime...')
run('node', [resolve(repoRoot, 'scripts/prepare-runtime.mjs')], { cwd: repoRoot })

const runtimeCli = resolve(runtimeDir, 'dsh/node_modules/@deepseek-ai/dsh/lib/bin.js')
const runtimeNodeUnix = resolve(runtimeDir, 'tools/node_modules/node/bin/node')
const runtimeNodeWin = resolve(runtimeDir, 'tools/node_modules/node/bin/node.exe')
if (!existsSync(runtimeCli) || (!existsSync(runtimeNodeUnix) && !existsSync(runtimeNodeWin))) {
  console.error(`prepare-desktop-bundle: runtime tree incomplete at ${runtimeDir} (missing CLI entry or node binary)`)
  process.exit(1)
}

// 2.5 Sign every Mach-O in the runtime tree. Apple's notary scanner descends
// into bundled archives: unsigned (or third-party-signed) binaries inside
// runtime.tar.gz fail the audit ("not signed with a valid Developer ID
// certificate"). Node is a JIT program, so the binaries carry the allow-jit
// entitlements; libraries get the runtime flag as well. Gated on
// DSH_CODESIGN_IDENTITY: without it we still produce a bundle for local use,
// but it will NOT pass notarization.
const signIdentity = process.env.DSH_CODESIGN_IDENTITY
const signMarker = resolve(runtimeDir, '.macho-signed')
if (!existsSync(signMarker)) {
  if (!signIdentity) {
    console.warn('prepare-desktop-bundle: DSH_CODESIGN_IDENTITY not set — skipping Mach-O signing (bundle will NOT pass notarization)')
  } else {
    const macho = []
    const walk = dir => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, entry.name)
        if (entry.isDirectory()) {
          walk(p)
        } else if (entry.isFile()) {
          const fd = openSync(p, 'r')
          const buf = Buffer.alloc(4)
          readSync(fd, buf, 0, 4, 0)
          closeSync(fd)
          if (buf.equals(Buffer.from([0xcf, 0xfa, 0xed, 0xfe])) || buf.equals(Buffer.from([0xce, 0xfa, 0xed, 0xfe]))
            || buf.equals(Buffer.from([0xfe, 0xed, 0xfa, 0xcf])) || buf.equals(Buffer.from([0xca, 0xfe, 0xba, 0xbe]))) {
            macho.push(p)
          }
        }
      }
    }
    walk(runtimeDir)
    console.log(`prepare-desktop-bundle: codesigning ${macho.length} Mach-O binaries...`)
    const entitlements = resolve(repoRoot, 'scripts/entitlements-runtime.plist')
    for (const p of macho) {
      execFileSync('codesign', [
        '--force', '--sign', signIdentity, '--options', 'runtime',
        '--timestamp', '--entitlements', entitlements, p,
      ], { stdio: 'inherit' })
    }
    writeFileSync(signMarker, `${signIdentity}\n${new Date().toISOString()}\n`)
  }
}

mkdirSync(resourcesDir, { recursive: true })

// 3. Runtime tarball: fixed name; cache key = revision sha + the assembly
// script rev (prepare-runtime bumps it when the tree layout/deps change)
// + the Mach-O signing marker, so a re-assembled or newly-signed tree
// always re-packs even at an unchanged sha.
const scriptRev = existsSync(resolve(runtimeDir, '.script-rev'))
  ? readFileSync(resolve(runtimeDir, '.script-rev'), 'utf8').trim()
  : ''
const tarCacheKey = `${revision.sha} ${scriptRev} ${existsSync(signMarker) ? 'signed' : 'unsigned'}`
if (existsSync(runtimeTar) && existsSync(runtimeShaMarker) && readFileSync(runtimeShaMarker, 'utf8').trim() === tarCacheKey) {
  console.log(`prepare-desktop-bundle: runtime.tar.gz cached for ${revision.sha.slice(0, 12)} (assembly r${scriptRev})`)
} else {
  console.log(`prepare-desktop-bundle: packing runtime.tar.gz (~500MB tree, this takes a minute)...`)
  tarCreate(runtimeTar, runtimeDir, ['dsh', 'tools'])
  writeFileSync(runtimeShaMarker, tarCacheKey + '\n')
}
console.log(`prepare-desktop-bundle: runtime.tar.gz ${mb(runtimeTar)} MB`)

// 4. Plugin tarballs: tiny, rebuilt every time to track the lib/ just built.
tarCreate(bridgeTar, bridgeDir, ['package.json', 'cordis.patch.yml', 'lib'])
console.log(`prepare-desktop-bundle: bridge.tar.gz ${mb(bridgeTar)} MB`)
tarCreate(compactionTar, compactionDir, [
  'package.json',
  'cordis.patch.yml',
  'preset-snippet.yml',
  'README.md',
  'lib',
])
console.log(`prepare-desktop-bundle: compaction-hierarchical.tar.gz ${mb(compactionTar)} MB`)
tarCreate(webSearchToggleTar, webSearchToggleDir, [
  'package.json',
  'cordis.patch.yml',
  'README.md',
  'lib',
])
console.log(`prepare-desktop-bundle: web-search-toggle.tar.gz ${mb(webSearchToggleTar)} MB`)
tarCreate(modelImageInputTar, modelImageInputDir, [
  'package.json',
  'cordis.patch.yml',
  'README.md',
  'lib',
])
console.log(`prepare-desktop-bundle: model-image-input.tar.gz ${mb(modelImageInputTar)} MB`)
tarCreate(sendWhileRunningTar, sendWhileRunningDir, [
  'package.json',
  'cordis.patch.yml',
  'README.md',
  'lib',
])
console.log(`prepare-desktop-bundle: send-while-running.tar.gz ${mb(sendWhileRunningTar)} MB`)

// 5. Revision manifest: the sha the shell names its extraction dir after,
// plus content hashes of every tarball. Each extraction .ok marker stores its
// own hash, so same-runtime plugin rebuilds cannot boot stale code.
const manifest = {
  ...revision,
  runtimeTarball: await sha256(runtimeTar),
  bridgeTarball: await sha256(bridgeTar),
  compactionHierarchicalTarball: await sha256(compactionTar),
  webSearchToggleVersion: webSearchTogglePackage.version,
  webSearchToggleTarball: await sha256(webSearchToggleTar),
  modelImageInputVersion: modelImageInputPackage.version,
  modelImageInputTarball: await sha256(modelImageInputTar),
  sendWhileRunningVersion: sendWhileRunningPackage.version,
  sendWhileRunningTarball: await sha256(sendWhileRunningTar),
}
writeFileSync(revisionCopy, JSON.stringify(manifest, null, 2) + '\n')
console.log(`prepare-desktop-bundle: revision ${revision.ref} (${revision.sha.slice(0, 12)}) -> ${resourcesDir}`)
