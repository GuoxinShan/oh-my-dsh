/**
 * Create the `dsh` symlink anchoring workspace type/build resolution at the
 * DeepSeek Harness checkout. Target precedence: $DSH_CHECKOUT, then
 * ~/workspace/coding-study/deepseek-harness; validity requires
 * <target>/docs/architecture.md. Fails loud when neither resolves — do not
 * guess, ask.
 */
import { existsSync, lstatSync, symlinkSync, rmSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const linkPath = resolve(pkgRoot, 'dsh')

const candidates = [
  process.env.DSH_CHECKOUT,
  resolve(pkgRoot, '../../../coding-study/deepseek-harness'),
  resolve(process.env.HOME ?? '', 'workspace/coding-study/deepseek-harness'),
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
if (lstatSync(linkPath, { throwIfNoEntry: false }) !== undefined) {
  if (lstatSync(linkPath).isSymbolicLink() && realpathSync(linkPath) === resolved) {
    console.log(`setup: dsh -> ${resolved} (already correct)`)
    process.exit(0)
  }
  if (lstatSync(linkPath).isSymbolicLink()) rmSync(linkPath)
  else {
    console.error(`setup: ${linkPath} exists and is not a symlink — refusing to remove it`)
    process.exit(1)
  }
}
symlinkSync(resolved, linkPath, 'dir')
console.log(`setup: dsh -> ${resolved}`)
