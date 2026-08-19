/**
 * Build config for dsh-reasoning-efforts: a host-only plain ESM library
 * (lib/index.js) the host Loader imports as the row's node half. No browser
 * half, so no client closure contract applies.
 */
import { defineConfig } from 'tsdown'

export default defineConfig({
  name: 'dsh-reasoning-efforts',
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
