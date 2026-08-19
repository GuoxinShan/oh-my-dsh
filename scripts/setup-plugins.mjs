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
 * repo (../deepseek-harness), then ~/workspace/deepseek-harness. Validity
 * requires <target>/docs/architecture.md. Fails loud when nothing resolves.
 */
import { existsSync, lstatSync, symlinkSync, unlinkSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const candidates = [
  process.env.DSH_CHECKOUT,
  resolve(repoRoot, '../deepseek-harness'),
  resolve(process.env.HOME ?? '', 'workspace/deepseek-harness'),
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

const resolved = realpathSync(target)
for (const { link, note } of anchors) {
  const st = lstatSync(link, { throwIfNoEntry: false })
  if (st?.isSymbolicLink()) {
    let current
    try { current = realpathSync(link) } catch { current = undefined }
    if (current === resolved) {
      console.log(`setup-plugins: ${link} already -> checkout (${note})`)
      continue
    }
    unlinkSync(link)
  } else if (st !== undefined) {
    console.error(`setup-plugins: ${link} exists and is not a symlink — refusing to remove it`)
    process.exit(1)
  }
  symlinkSync(resolved, link)
  console.log(`setup-plugins: ${link} -> ${resolved} (${note})`)
}

// The bridge keeps its own setup contract (dsh anchor + devDeps).
execFileSync('pnpm', ['run', 'setup'], { cwd: resolve(repoRoot, 'plugin/dsh-desktop-bridge'), stdio: 'inherit' })
