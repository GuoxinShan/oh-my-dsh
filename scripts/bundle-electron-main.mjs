/**
 * Bundle Electron main + copy preload. Shared by desktop:dev and desktop:build.
 */
import { mkdirSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build as esbuild } from 'esbuild'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(repoRoot, 'dist-electron')

export async function bundleElectronMain() {
  mkdirSync(outDir, { recursive: true })
  await esbuild({
    absWorkingDir: repoRoot,
    entryPoints: [resolve(repoRoot, 'src-electron/main.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: resolve(outDir, 'main.cjs'),
    external: ['electron', 'electron-updater'],
    logOverride: { 'empty-import-meta': 'silent' },
  })
  copyFileSync(resolve(repoRoot, 'src-electron/preload.cjs'), resolve(outDir, 'preload.cjs'))
  return resolve(outDir, 'main.cjs')
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('bundle-electron-main.mjs')) {
  await bundleElectronMain()
}
