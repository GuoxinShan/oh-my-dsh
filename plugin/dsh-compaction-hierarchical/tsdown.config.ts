/** Host-only ESM build; Harness APIs stay external to the plugin bundle. */

import { defineConfig } from 'tsdown'

const RUNTIME_EXTERNALS = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-compaction-basic',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-token-meter',
  '@deepseek-ai/schemastery',
] as const

export default defineConfig({
  name: 'dsh-compaction-hierarchical',
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: {
    neverBundle: RUNTIME_EXTERNALS as unknown as string[],
  },
})
