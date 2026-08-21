import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Package-level node:test suites still run through `node --test`; Vitest
    // owns only the jsdom component specs in this package.
    include: ['tests/**/*.spec.tsx'],
    testTimeout: 10_000,
  },
})
