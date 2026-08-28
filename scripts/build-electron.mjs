/**
 * Bundle the Electron main process and invoke electron-builder.
 *
 * electron-builder rejects CSC_NAME values that include the
 * "Developer ID Application:" prefix (it picks the type itself). CI and
 * local docs still export the full codesign identity for DSH_CODESIGN_IDENTITY
 * (Mach-O signing inside runtime.tar.gz); strip the prefix here for CSC_NAME.
 */
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { bundleElectronMain } from './bundle-electron-main.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
await bundleElectronMain()

const args = process.argv.slice(2).filter((arg) => arg !== '--')
if (!args.includes('--publish')) args.push('--publish', 'never')

if (process.env.CSC_NAME?.startsWith('Developer ID Application:')) {
  process.env.CSC_NAME = process.env.CSC_NAME.replace(/^Developer ID Application:\s*/, '')
}

execFileSync('pnpm', ['exec', 'electron-builder', '--config', 'electron-builder.yml', ...args], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
})

const { stageRuntimeArtifact } = await import('./stage-runtime-artifact.mjs')
stageRuntimeArtifact()

const builtMac = args.includes('--mac') || (!args.includes('--win') && !args.includes('--linux') && process.platform === 'darwin')
if (builtMac) {
  const { slimMacUpdaterZip } = await import('./slim-mac-updater-zip.mjs')
  await slimMacUpdaterZip()
}
