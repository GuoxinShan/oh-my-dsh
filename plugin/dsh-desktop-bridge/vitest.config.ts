import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The package's `dsh` debug anchor links the Harness checkout, whose own
    // node_modules would otherwise resolve a second React instance.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    // Package-level node:test suites still run through `node --test`; Vitest
    // owns only the jsdom component specs in this package.
    include: ['tests/**/*.spec.tsx'],
    testTimeout: 10_000,
  },
})
