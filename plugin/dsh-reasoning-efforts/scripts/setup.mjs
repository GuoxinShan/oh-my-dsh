/**
 * Create the `dsh` symlink anchoring workspace type/build resolution at the
 * DeepSeek Harness checkout. Target precedence: $DSH_CHECKOUT, then
 * ~/workspace/deepseek-harness; validity requires
 * <target>/docs/architecture.md. Fails loud when neither resolves — do not
 * guess, ask.
 */
import { existsSync, lstatSync, symlinkSync, unlinkSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const linkPath = resolve(pkgRoot, 'dsh')

const home = process.env.HOME || process.env.USERPROFILE || ''
const candidates = [
  process.env.DSH_CHECKOUT,
  resolve(pkgRoot, '../../../deepseek-harness'),
  resolve(home, 'workspace/deepseek-harness'),
].filter(Boolean)

const target = candidates.find((c) => existsSync(resolve(c, 'docs/architecture.md')))
if (target === undefined) {
  console.error(
    'setup: no DeepSeek Harness checkout found (need <checkout>/docs/architecture.md).\n'
    + `  tried: ${candidates.join('\n         ')}\n`
    + '  set DSH_CHECKOUT=<checkout> and rerun.',
  )
  process.exit(1)
}

const resolved = realpathSync(target)
const st = lstatSync(linkPath, { throwIfNoEntry: false })
if (st?.isSymbolicLink()) {
  let current
  try { current = realpathSync(linkPath) } catch { current = undefined }
  if (current === resolved) {
    console.log(`setup: dsh -> ${resolved} (already correct)`)
    process.exit(0)
  }
  unlinkSync(linkPath)
} else if (st !== undefined) {
  console.error(`setup: ${linkPath} exists and is not a symlink — refusing to remove it`)
  process.exit(1)
}
symlinkSync(resolved, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
console.log(`setup: dsh -> ${resolved}`)
