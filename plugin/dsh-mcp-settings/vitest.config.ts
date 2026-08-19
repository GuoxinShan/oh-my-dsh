import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin } from '../deepseek-harness/vitest.shared.ts'

export default defineConfig({
  plugins: [standardDecoratorPlugin(), tsconfigPaths({
    projects: ['./tsconfig.vitest.json', '../deepseek-harness/tsconfig.base.client.json'],
  })],
  resolve: {
    alias: [
      { find: /^react$/, replacement: fileURLToPath(new URL('./node_modules/react/index.js', import.meta.url)) },
      { find: 'react/jsx-runtime', replacement: fileURLToPath(new URL('./node_modules/react/jsx-runtime.js', import.meta.url)) },
      { find: 'react/jsx-dev-runtime', replacement: fileURLToPath(new URL('./node_modules/react/jsx-dev-runtime.js', import.meta.url)) },
      { find: '@modelcontextprotocol/sdk/client/index.js', replacement: fileURLToPath(new URL('./node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js', import.meta.url)) },
      { find: '@modelcontextprotocol/sdk/client/stdio.js', replacement: fileURLToPath(new URL('./node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js', import.meta.url)) },
      { find: '@modelcontextprotocol/sdk/client/streamableHttp.js', replacement: fileURLToPath(new URL('./node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js', import.meta.url)) },
      { find: '@deepseek-ai/cordis', replacement: fileURLToPath(new URL('../deepseek-harness/vendor/cordis/src/index.ts', import.meta.url)) },
      { find: '@deepseek-ai/dsh-mcp-client', replacement: fileURLToPath(new URL('../deepseek-harness/packages/mcp/mcp-client/src/index.ts', import.meta.url)) },
      { find: '@deepseek-ai/dsh-client-locale/client', replacement: fileURLToPath(new URL('../deepseek-harness/packages/client/locale/src/client/index.ts', import.meta.url)) },
      { find: '@deepseek-ai/dsh-client-runtime/client', replacement: fileURLToPath(new URL('../deepseek-harness/packages/client/runtime/src/client/index.ts', import.meta.url)) },
      { find: '@deepseek-ai/dsh-client-test-runtime', replacement: fileURLToPath(new URL('../deepseek-harness/packages/test-support/client-runtime/src/index.ts', import.meta.url)) },
      { find: '@deepseek-ai/dsh-client-ui-primitives', replacement: fileURLToPath(new URL('../deepseek-harness/packages/client/ui-primitives/src/index.ts', import.meta.url)) },
      { find: '@deepseek-ai/dsh-client-ui-slots', replacement: fileURLToPath(new URL('../deepseek-harness/packages/client/ui-slots/src/index.ts', import.meta.url)) },
    ],
    dedupe: ['react', 'react-dom'],
  },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    pool: 'forks',
  },
})
