/**
 * Host-only ESM build. Every harness import in src/ is type-only, so the
 * emitted bundle carries zero `@deepseek-ai/*` runtime imports and no
 * externals list is needed — the plugin cannot drag a second copy of cordis
 * or dsh-fs into the process (the module-instance split that breaks
 * unique-symbol registries; see the repo's npm dependency discipline).
 */

import { defineConfig } from 'tsdown'

export default defineConfig({
  name: 'dsh-fs-observation-log',
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
