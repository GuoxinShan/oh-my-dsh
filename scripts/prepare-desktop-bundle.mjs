/**
 * Assemble the shell's bundled assets (release packaging): the self-contained
 * runtime tarball, the desktop-owned plugin tarballs, and the revision
 * manifest, all placed under src/resources/ for electron-builder
 * extraResources.
 *
 * Why tarballs instead of loose resource directories: the runtime tree is a
 * pnpm install (3k+ symlinks, two layers) and electron-builder's extraResources
 * copy does not keep that tree symlink-identical (deref-copy would explode
 * the .pnpm store to GBs). A tar round-trip is
 * link-aware, and the shell extracts it once into ~/.dsh-desktop (writable
 * and immune to App Translocation read-only volumes). Apple's notary scanner
 * still descends into archives, so every nested Mach-O is signed before pack.
 *
 * Fixed file names so electron-builder.yml never churns with revisions:
 *   src/resources/runtime.tar.gz          (dsh/ + tools/ without tools/node)
 *   src/resources/runtime.tar.gz.sha      (cache marker: revision sha)
 *   src/resources/bridge.tar.gz           (package.json + lib/ + patch)
 *   src/resources/compaction-hierarchical.tar.gz (host plugin package)
 *   src/resources/web-search-toggle.tar.gz (host + client plugin package)
 *   src/resources/model-image-input.tar.gz (client-only plugin package)
 *   src/resources/send-while-running.tar.gz (client-only plugin package)
 *   src/resources/model-efforts-editor.tar.gz (client-only plugin package)
 *   src/resources/question-rail.tar.gz (client-only plugin package)
 *   src/resources/runtime-revision.json   (runtime + plugin hashes/versions)
 *
 * `src/resources/` is gitignored — regenerated per build via
 * `pnpm desktop:prepare` (also wired as the first half of desktop:build).
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, mkdirSync, writeFileSync, statSync, readdirSync, openSync, readSync, closeSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
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
const modelEffortsEditorDir = resolve(repoRoot, 'plugin/dsh-model-efforts-editor')
const questionRailDir = resolve(repoRoot, 'plugin/dsh-question-rail')
const resourcesDir = resolve(repoRoot, 'src/resources')

const runtimeTar = resolve(resourcesDir, 'runtime.tar.gz')
const runtimeShaMarker = resolve(resourcesDir, 'runtime.tar.gz.sha')
const bridgeTar = resolve(resourcesDir, 'bridge.tar.gz')
const compactionTar = resolve(resourcesDir, 'compaction-hierarchical.tar.gz')
const webSearchToggleTar = resolve(resourcesDir, 'web-search-toggle.tar.gz')
const modelImageInputTar = resolve(resourcesDir, 'model-image-input.tar.gz')
const sendWhileRunningTar = resolve(resourcesDir, 'send-while-running.tar.gz')
const modelEffortsEditorTar = resolve(resourcesDir, 'model-efforts-editor.tar.gz')
const questionRailTar = resolve(resourcesDir, 'question-rail.tar.gz')
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
const modelEffortsEditorPackage = JSON.parse(readFileSync(resolve(modelEffortsEditorDir, 'package.json'), 'utf8'))
if (modelEffortsEditorPackage.name !== 'dsh-model-efforts-editor' || modelEffortsEditorPackage.version !== '0.1.0') {
  throw new Error(`desktop requires dsh-model-efforts-editor 0.1.0, found ${modelEffortsEditorPackage.name}@${modelEffortsEditorPackage.version}`)
}
const questionRailPackage = JSON.parse(readFileSync(resolve(questionRailDir, 'package.json'), 'utf8'))
if (questionRailPackage.name !== 'dsh-question-rail' || questionRailPackage.version !== '0.5.1') {
  throw new Error(`desktop requires dsh-question-rail 0.5.1, found ${questionRailPackage.name}@${questionRailPackage.version}`)
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

function tarCreate(archive, changeDir, entries, extraExcludes = []) {
  const args = []
  if (tarSupportsForceLocal()) args.push('--force-local')
  args.push('--exclude', '.DS_Store')
  for (const pattern of extraExcludes) {
    args.push('--exclude', pattern)
  }
  args.push('-czf', archive, '-C', changeDir, ...entries)
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

const desktopPluginDirs = [bridgeDir, compactionDir, webSearchToggleDir, modelImageInputDir, sendWhileRunningDir, modelEffortsEditorDir, questionRailDir]
const runtimeSrc = resolve(repoRoot, 'runtime/src')
/** `build` = release path (CI already typechecked/tested). Default `verify` stays local-complete. */
const prepareMode = process.env.DSH_DESKTOP_PREPARE_MODE === 'build' ? 'build' : 'verify'

function assembleRuntime() {
  console.log('prepare-desktop-bundle: assembling runtime...')
  run('node', [resolve(repoRoot, 'scripts/prepare-runtime.mjs')], { cwd: repoRoot })
}

function pluginHasCachedLib(pluginDir) {
  return existsSync(resolve(pluginDir, 'lib/index.js'))
}

function runAsync(cmd, args, opts = {}) {
  const shell = opts.shell ?? (process.platform === 'win32' && /\.cmd$/i.test(String(cmd)))
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts, shell })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${String(code)}`))
    })
  })
}

async function buildDesktopPlugins() {
  const allowCache = process.env.DSH_DESKTOP_USE_CACHED_PLUGIN_LIBS === '1'
  const jobs = []
  for (const pluginDir of desktopPluginDirs) {
    if (allowCache && pluginHasCachedLib(pluginDir)) {
      console.log(`prepare-desktop-bundle: skip build ${basename(pluginDir)} (cached lib)`)
      continue
    }
    jobs.push(runAsync(pnpm, ['run', 'build'], { cwd: pluginDir }))
  }
  await Promise.all(jobs)
}

if (prepareMode === 'build') {
  // Runtime first so the fork clone can anchor bridge `setup` without a
  // second prepare-runtime in the workflow.
  assembleRuntime()
  const checkout = process.env.DSH_CHECKOUT || runtimeSrc
  run(pnpm, ['run', 'setup'], { cwd: bridgeDir, env: { ...process.env, DSH_CHECKOUT: checkout } })
  console.log('prepare-desktop-bundle: building desktop plugins (skip typecheck/test)...')
  await buildDesktopPlugins()
} else {
  console.log('prepare-desktop-bundle: verifying desktop plugins...')
  run(pnpm, ['run', 'plugin:check'], { cwd: repoRoot })
  for (const pluginDir of [compactionDir, webSearchToggleDir, modelImageInputDir, sendWhileRunningDir, modelEffortsEditorDir, questionRailDir]) {
    for (const script of ['typecheck', 'test', 'build']) {
      run(pnpm, ['run', script], { cwd: pluginDir })
    }
  }
  assembleRuntime()
}

const runtimeCli = resolve(runtimeDir, 'dsh/node_modules/@deepseek-ai/dsh/lib/bin.js')
if (!existsSync(runtimeCli)) {
  console.error(`prepare-desktop-bundle: runtime tree incomplete at ${runtimeDir} (missing CLI entry)`)
  process.exit(1)
}

// Rebuild native modules against the Electron ABI so sidecar can run as
// ELECTRON_RUN_AS_NODE without a second Node binary.
const electronPkg = resolve(repoRoot, 'node_modules/electron/package.json')
if (!existsSync(electronPkg)) {
  console.error('prepare-desktop-bundle: electron is not installed; run pnpm install')
  process.exit(1)
}
const electronVersion = JSON.parse(readFileSync(electronPkg, 'utf8')).version
const abiMarker = resolve(runtimeDir, '.electron-abi')
const abiMatches = existsSync(abiMarker) && readFileSync(abiMarker, 'utf8').trim() === electronVersion
if (abiMatches) {
  console.log(`prepare-desktop-bundle: skip electron-rebuild (ABI ${electronVersion} already marked)`)
} else {
  console.log(`prepare-desktop-bundle: electron-rebuild ${electronVersion} in ${runtimeDir}/dsh`)
  run(pnpm, ['exec', 'electron-rebuild', '-f', '-m', resolve(runtimeDir, 'dsh'), '-v', String(electronVersion).replace(/^v/, '')], { cwd: repoRoot })
  writeFileSync(abiMarker, `${electronVersion}\n`)
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
const tarCacheKey = `${revision.sha} ${scriptRev} ${existsSync(signMarker) ? 'signed' : 'unsigned'} omit-node-shims electron-${electronVersion}`
if (existsSync(runtimeTar) && existsSync(runtimeShaMarker) && readFileSync(runtimeShaMarker, 'utf8').trim() === tarCacheKey) {
  console.log(`prepare-desktop-bundle: runtime.tar.gz cached for ${revision.sha.slice(0, 12)} (assembly r${scriptRev})`)
} else {
  console.log(`prepare-desktop-bundle: packing runtime.tar.gz without tools/node...`)
  tarCreate(runtimeTar, runtimeDir, ['dsh', 'tools'], [
    'tools/node_modules/node',
    // pnpm's .bin/pnpm prefers a sibling .bin/node; without tools/node that
    // stub is a hard fail. Omit it so `exec node` uses PATH (Electron shim).
    'tools/node_modules/.bin/node',
    'tools/node_modules/.bin/node.cmd',
    'tools/node_modules/.bin/node.ps1',
  ])
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
tarCreate(modelEffortsEditorTar, modelEffortsEditorDir, [
  'package.json',
  'cordis.patch.yml',
  'README.md',
  'lib',
])
console.log(`prepare-desktop-bundle: model-efforts-editor.tar.gz ${mb(modelEffortsEditorTar)} MB`)
tarCreate(questionRailTar, questionRailDir, [
  'package.json',
  'cordis.patch.yml',
  'README.md',
  'lib',
])
console.log(`prepare-desktop-bundle: question-rail.tar.gz ${mb(questionRailTar)} MB`)

// 5. Revision manifest: the sha the shell names its extraction dir after,
// plus content hashes of every tarball. Each extraction .ok marker stores its
// own hash, so same-runtime plugin rebuilds cannot boot stale code.
const manifest = {
  ...revision,
  runtimeArtifact: `runtime-${revision.sha}-${process.platform}-${process.arch}.tar.gz`,
  runtimeTarball: await sha256(runtimeTar),
  bridgeTarball: await sha256(bridgeTar),
  compactionHierarchicalTarball: await sha256(compactionTar),
  webSearchToggleVersion: webSearchTogglePackage.version,
  webSearchToggleTarball: await sha256(webSearchToggleTar),
  modelImageInputVersion: modelImageInputPackage.version,
  modelImageInputTarball: await sha256(modelImageInputTar),
  sendWhileRunningVersion: sendWhileRunningPackage.version,
  sendWhileRunningTarball: await sha256(sendWhileRunningTar),
  modelEffortsEditorVersion: modelEffortsEditorPackage.version,
  modelEffortsEditorTarball: await sha256(modelEffortsEditorTar),
  questionRailVersion: questionRailPackage.version,
  questionRailTarball: await sha256(questionRailTar),
}
writeFileSync(revisionCopy, JSON.stringify(manifest, null, 2) + '\n')
console.log(`prepare-desktop-bundle: revision ${revision.ref} (${revision.sha.slice(0, 12)}) -> ${resourcesDir}`)
