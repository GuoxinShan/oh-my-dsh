/**
 * Assemble the self-contained dsh runtime from our fork at the pinned
 * revision (runtime/revision.json). SHA-keyed caching makes rebuilds cheap:
 * the same SHA assembles once, later runs only verify and print the path.
 *
 * Approach: the publish path, pointed at a local directory instead of npm.
 * Every @deepseek-ai/* package is packed (pnpm pack rewrites workspace:
 * protocols exactly like publishing does), then installed with an overrides
 * map so the whole tree resolves to our fork tarballs while third-party
 * deps come from the registry. (`pnpm deploy --legacy` drops transitive
 * vendored workspace deps — cosmokit et al. — so it is not usable here.)
 *
 * Layout produced:
 *   runtime/build/<sha>/dsh/       self-contained runtime (bin: lib/bin.js)
 *   runtime/build/<sha>/tools/     node + pnpm binaries the sidecar uses
 *   runtime/src/                   persistent partial clone (fetch deltas)
 *   runtime/tarballs/              packed fork packages (rebuilt per SHA)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Bump when the ASSEMBLY changes (deps, layout) so the SHA-keyed caches
// invalidate themselves instead of shipping a stale tree.
const SCRIPT_REV = 2

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const revision = JSON.parse(readFileSync(resolve(repoRoot, 'runtime/revision.json'), 'utf8'))
const srcDir = resolve(repoRoot, 'runtime/src')
const outDir = resolve(repoRoot, 'runtime/build', revision.sha)
const tarballDir = resolve(repoRoot, 'runtime/tarballs', revision.sha)
const buildMarker = resolve(srcDir, '.prepare-runtime-ok')

const cachedRev = existsSync(resolve(outDir, '.script-rev'))
  ? readFileSync(resolve(outDir, '.script-rev'), 'utf8').trim()
  : ''
if (
  cachedRev === String(SCRIPT_REV)
  && existsSync(resolve(outDir, 'dsh/node_modules/@deepseek-ai/dsh/lib/bin.js'))
  && existsSync(resolve(outDir, 'tools/node_modules/node/bin/node'))
) {
  console.log(`prepare-runtime: cached ${revision.sha.slice(0, 12)} -> ${outDir}`)
  process.exit(0)
}
rmSync(outDir, { recursive: true, force: true })

mkdirSync(outDir, { recursive: true })

// 1. Persistent partial clone; fetch only the delta to the pinned ref.
if (!existsSync(resolve(srcDir, '.git'))) {
  console.log('prepare-runtime: cloning fork (partial)...')
  execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', revision.repo, srcDir], { stdio: 'inherit' })
}
console.log(`prepare-runtime: fetching ${revision.ref}...`)
execFileSync('git', ['fetch', '--filter=blob:none', 'origin', revision.ref], { cwd: srcDir, stdio: 'inherit' })
execFileSync('git', ['checkout', '--detach', revision.sha], { cwd: srcDir, stdio: 'inherit' })
const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: srcDir, encoding: 'utf8' }).trim()
if (actual !== revision.sha) {
  console.error(`prepare-runtime: checkout drifted (want ${revision.sha}, got ${actual})`)
  process.exit(1)
}

// 2. Install + build, cached per SHA.
if (!existsSync(buildMarker) || readFileSync(buildMarker, 'utf8').trim() !== revision.sha) {
  console.log('prepare-runtime: pnpm install (frozen)...')
  execFileSync('pnpm', ['install', '--frozen-lockfile'], { cwd: srcDir, stdio: 'inherit' })
  console.log('prepare-runtime: pnpm build...')
  execFileSync('pnpm', ['run', 'build'], { cwd: srcDir, stdio: 'inherit' })
  writeFileSync(buildMarker, revision.sha + '\n')
} else {
  console.log('prepare-runtime: install+build cached for this SHA')
}

// 3. Pack every publishable @deepseek-ai/* package. Vendored packages are
// private:true in the workspace (rescope policy); the publish flow still
// ships them, so flip the flag in this disposable clone before packing.
rmSync(tarballDir, { recursive: true, force: true })
mkdirSync(tarballDir, { recursive: true })
const packages = JSON.parse(
  execFileSync('pnpm', ['-r', 'ls', '--depth', '-1', '--json'], { cwd: srcDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
)
const overrides = {}
let cliTarball
let packed = 0
const skipped = []
// Fork-modified packages MUST pack from our tree — falling back to the npm
// build for any of these would silently ship the unpatched runtime.
const FORK_MODIFIED = new Set([
  '@deepseek-ai/dsh-agent-default-model',
  '@deepseek-ai/dsh-client-modules',
  '@deepseek-ai/dsh-client-ui-model-selection',
  '@deepseek-ai/dsh-client-ui-settings-models',
  '@deepseek-ai/dsh-host-apiproxy',
  '@deepseek-ai/dsh-mcp-client',
])
for (const pkg of packages) {
  if (!pkg.name?.startsWith('@deepseek-ai/')) continue
  const manifestPath = resolve(pkg.path, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.private === true) {
    manifest.private = false
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  }
  // Platform-specific natives (landlock linux builds etc.) fail their own
  // prepare verification off-target; skip them — overrides then leaves them
  // to the official npm build, which is the same artifact either way.
  try {
    execFileSync('pnpm', ['pack', '--pack-destination', tarballDir], { cwd: pkg.path, stdio: 'pipe' })
  } catch {
    if (FORK_MODIFIED.has(pkg.name)) {
      console.error(`prepare-runtime: fork-modified package failed to pack: ${pkg.name}`)
      process.exit(1)
    }
    skipped.push(pkg.name)
    continue
  }
  // pnpm pack names scoped tarballs "<scope>-<name>-<version>.tgz" (@ stripped).
  const expected = `${pkg.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`
  const tarball = resolve(tarballDir, expected)
  if (!existsSync(tarball)) {
    console.error(`prepare-runtime: expected tarball missing for ${pkg.name}: ${expected}`)
    process.exit(1)
  }
  overrides[pkg.name] = `file:${tarball}`
  if (pkg.name === '@deepseek-ai/dsh') cliTarball = tarball
  packed += 1
}
console.log(`prepare-runtime: packed ${packed} fork packages` + (skipped.length > 0 ? ` (skipped to npm: ${skipped.join(', ')})` : ''))

// 4. Runtime manifest: CLI from our tarball, every @deepseek-ai/* pinned to
// our tarballs via overrides, plus the node/pnpm tools the sidecar needs.
// tsx is a first-class runtime dep, not a dev nicety: profiles may install
// source-distributed plugins (.ts entries under their node_modules), which
// plain Node refuses to type-strip — the terminal source runtime loads them
// via `node --import tsx/esm`, and the bundled runtime must match (the shell
// passes the same --import for bundled runs).
if (cliTarball === undefined) {
  console.error('prepare-runtime: @deepseek-ai/dsh tarball not found among packed packages')
  process.exit(1)
}
const runtimeDir = resolve(outDir, 'dsh')
mkdirSync(runtimeDir, { recursive: true })
writeFileSync(resolve(runtimeDir, 'package.json'), JSON.stringify({
  private: true,
  dependencies: {
    '@deepseek-ai/dsh': `file:${cliTarball}`,
    tsx: '^4.19.2',
  },
  pnpm: { overrides },
}, null, 2) + '\n')
// Native build scripts the runtime legitimately needs (prebuilt downloads).
writeFileSync(resolve(runtimeDir, 'pnpm-workspace.yaml'), [
  'allowBuilds:',
  '  node-pty: true',
  '  \'@deepseek-ai/dsh-subprocess-local\': true',
  '  koffi: true',
  '  esbuild: true',
  '  protobufjs: false',
  "  '@google/genai': false",
  '  node-addon-require-builtin: false',
  '',
].join('\n'))
console.log('prepare-runtime: installing runtime tree...')
rmSync(resolve(runtimeDir, 'pnpm-lock.yaml'), { force: true })
execFileSync('pnpm', ['install', '--no-frozen-lockfile'], { cwd: runtimeDir, stdio: 'inherit', env: { ...process.env, CI: 'true' } })

// 5. Runtime tools: node + pnpm binaries.
const toolsDir = resolve(outDir, 'tools')
mkdirSync(toolsDir, { recursive: true })
writeFileSync(resolve(toolsDir, 'package.json'), JSON.stringify({
  private: true,
  dependencies: { node: '24.9.0', pnpm: '^10.28.0' },
}, null, 2) + '\n')
writeFileSync(resolve(toolsDir, 'pnpm-workspace.yaml'), 'allowBuilds:\n  node: true\n')
rmSync(resolve(toolsDir, 'pnpm-lock.yaml'), { force: true })
execFileSync('pnpm', ['install', '--no-frozen-lockfile'], { cwd: toolsDir, stdio: 'inherit', env: { ...process.env, CI: 'true' } })
writeFileSync(resolve(outDir, '.script-rev'), `${SCRIPT_REV}\n`)

console.log(`prepare-runtime: done -> ${outDir}`)
