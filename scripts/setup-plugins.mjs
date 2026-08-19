/**
 * Create the harness-checkout symlinks anchoring type/build resolution for
 * the plugin packages. One target, two anchors:
 *
 *   plugin/dsh-desktop-bridge/dsh   — the bridge's own setup.mjs convention
 *                                      (delegated to it; keeps its contract)
 *   plugin/deepseek-harness         — sibling anchor expected by
 *                                      dsh-mcp-settings tsconfig paths
 *                                      ("../deepseek-harness" from the package)
 *
 * Target precedence: $DSH_CHECKOUT, then the sibling checkout beside this
 * repo (../../coding-study/deepseek-harness), then ~/workspace/coding-study/
 * deepseek-harness. Validity requires <target>/docs/architecture.md. Fails
 * loud when nothing resolves.
 */
import { existsSync, lstatSync, symlinkSync, rmSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const candidates = [
  process.env.DSH_CHECKOUT,
  resolve(repoRoot, '../coding-study/deepseek-harness'),
  resolve(process.env.HOME ?? '', 'workspace/coding-study/deepseek-harness'),
].filter(Boolean)

const target = candidates.find((c) => existsSync(resolve(c, 'docs/architecture.md')))
if (target === undefined) {
  console.error(
    'setup-plugins: no DeepSeek Harness checkout found (need <checkout>/docs/architecture.md).\n'
    + `  tried: ${candidates.join('\n               ')}\n`
    + '  set DSH_CHECKOUT=<checkout> and rerun.',
  )
  process.exit(1)
}

const anchors = [
  { link: resolve(repoRoot, 'plugin/deepseek-harness'), note: 'dsh-mcp-settings tsconfig anchor' },
]

for (const { link, note } of anchors) {
  if (lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()
      && realpathSync(link) === realpathSync(target)) {
    console.log(`setup-plugins: ${link} already -> checkout (${note})`)
    continue
  }
  rmSync(link, { force: true })
  symlinkSync(realpathSync(target), link)
  console.log(`setup-plugins: ${link} -> ${target} (${note})`)
}

// The bridge keeps its own setup contract (dsh anchor + devDeps).
execFileSync('pnpm', ['run', 'setup'], { cwd: resolve(repoRoot, 'plugin/dsh-desktop-bridge'), stdio: 'inherit' })
