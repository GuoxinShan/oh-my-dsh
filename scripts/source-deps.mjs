/**
 * Source-dependency switcher for debugging against a local harness checkout.
 *
 * Policy (AGENTS.md 「npm 依赖纪律」): every package's dependencies resolve
 * from the npm registry by default. Source dependencies — `link:` entries
 * pointing into the sibling harness checkout — are a DEBUG-ONLY posture,
 * entered and left exclusively through this script, never by hand-editing
 * package.json. The registry posture is the committed state; `link:source`
 * is a local, uncommitted-by-convention detour.
 *
 * Usage:
 *   pnpm run link:source [pkg ...]   # switch (default: every mapped plugin)
 *   pnpm run unlink:source [pkg ...] # restore registry versions
 *
 * The link posture rewrites each mapped @deepseek-ai/* devDependency to
 * `link:../deepseek-harness/<subpath>` (the sibling anchor the root
 * plugin:setup creates) and runs pnpm install in each touched package.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const anchor = resolve(repoRoot, 'plugin/deepseek-harness')

/** Registry version per package — the committed (default) posture. */
const REGISTRY = {
  '@deepseek-ai/cordis': '4.0.1',
  '@deepseek-ai/cordis-plugin-timer': '1.1.3',
  '@deepseek-ai/schemastery': '3.18.1',
  '@deepseek-ai/dsh-llm': '0.1.0-rc.7',
  '@deepseek-ai/dsh-settings': '0.1.0-rc.7',
  '@deepseek-ai/dsh-credentials': '0.1.0-rc.7',
  '@deepseek-ai/dsh-typert-protocol': '0.1.0-rc.7',
  '@deepseek-ai/dsh-client-locale': '0.1.0-rc.7',
  '@deepseek-ai/dsh-client-runtime': '0.1.0-rc.7',
  '@deepseek-ai/dsh-client-ui-settings': '0.1.0-rc.7',
  '@deepseek-ai/dsh-client-ui-slots': '0.1.0-rc.7',
  '@deepseek-ai/dsh-client-ui-primitives': '0.1.0-rc.7',
}

/** Source subpath per package, relative to the harness checkout root. */
const SOURCE = {
  '@deepseek-ai/cordis': 'vendor/cordis',
  '@deepseek-ai/cordis-plugin-timer': 'vendor/timer',
  '@deepseek-ai/schemastery': 'vendor/schemastery',
  '@deepseek-ai/dsh-llm': 'packages/llm/llm',
  '@deepseek-ai/dsh-settings': 'packages/settings/settings',
  '@deepseek-ai/dsh-credentials': 'packages/credentials/credentials',
  '@deepseek-ai/dsh-typert-protocol': 'packages/typert/protocol',
  '@deepseek-ai/dsh-client-locale': 'packages/client/locale',
  '@deepseek-ai/dsh-client-runtime': 'packages/client/runtime',
  '@deepseek-ai/dsh-client-ui-settings': 'packages/client/ui-settings',
  '@deepseek-ai/dsh-client-ui-slots': 'packages/client/ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives': 'packages/client/ui-primitives',
}

/** Plugin packages managed by this switcher. */
const PLUGINS = [
  'dsh-reasoning-efforts',
  'dsh-web-search-toggle',
]

const mode = process.argv[2] === 'link' ? 'link' : process.argv[2] === 'unlink' ? 'unlink' : undefined
if (mode === undefined) {
  console.error('source-deps: mode required — "link" (source debug) or "unlink" (registry restore)')
  process.exit(1)
}
const link = mode === 'link'
const targets = process.argv.slice(3)
const fixed = targets.length > 0 ? targets : PLUGINS

if (link && !existsSync(resolve(anchor, 'docs/architecture.md'))) {
  console.error(
    'source-deps: no harness checkout at plugin/deepseek-harness '
    + '(need docs/architecture.md).\n'
    + '  run: pnpm run plugin:setup   # creates the sibling anchor, or set DSH_CHECKOUT',
  )
  process.exit(1)
}

for (const name of fixed) {
  const pkgPath = resolve(repoRoot, 'plugin', name, 'package.json')
  if (!existsSync(pkgPath)) {
    console.error(`source-deps: no such plugin package: ${name}`)
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const deps = manifest.devDependencies ?? {}
  let touched = 0
  for (const dep of Object.keys(deps)) {
    if (!(dep in REGISTRY)) continue
    const next = link ? `link:../deepseek-harness/${SOURCE[dep]}` : REGISTRY[dep]
    if (deps[dep] === next) continue
    deps[dep] = next
    touched += 1
  }
  if (touched === 0) {
    console.log(`${name}: already ${link ? 'link' : 'registry'} posture`)
    continue
  }
  manifest.devDependencies = Object.fromEntries(
    Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)),
  )
  writeFileSync(pkgPath, JSON.stringify(manifest, null, 2) + '\n')
  execFileSync('pnpm', ['install'], { cwd: resolve(pkgPath, '..'), stdio: 'inherit' })
  console.log(`${name}: ${touched} dep(s) -> ${link ? 'link: (source debug)' : 'registry'}`)
}

if (link) {
  console.log(
    '\nsource-deps: DEBUG posture active — source dependencies must not be committed.\n'
    + '  restore with: pnpm run unlink:source',
  )
}
