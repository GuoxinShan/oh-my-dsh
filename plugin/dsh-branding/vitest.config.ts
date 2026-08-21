import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Registry-posture devDependencies pin separate package copies; dedupe
    // keeps React a single instance between the specs and the plugin source.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    // Package-level node:test suites still run through `node --test`;
    // Vitest owns only the jsdom component specs in this package.
    include: ['tests/**/*.spec.tsx'],
    testTimeout: 10_000,
  },
})
