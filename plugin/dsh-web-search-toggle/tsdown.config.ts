/**
 * Build config for dsh-web-search-toggle, distilled from dsh-mcp-settings:
 * host half as plain ESM libs (with standard decorators pre-transpiled for
 * Rolldown), browser half as the module-loader closure with platform modules
 * externalized. Inline styles only — no CSS-modules pipeline.
 */
import ts from 'typescript'
import { defineConfig } from 'tsdown'

const PACKAGE_ID = 'dsh-web-search-toggle'
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/cordis',
] as const
const DECORATOR_SYNTAX = /^\s*@[A-Za-z_$][\w$]*/m

/** Compile standard TypeScript decorators before Rolldown parses Host modules. */
function standardDecoratorPlugin() {
  return {
    name: 'dsh-standard-decorators',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const file = id.split('?', 1)[0]!
      if (!/\.[cm]?tsx?$/.test(file) || !DECORATOR_SYNTAX.test(code)) return
      const result = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2024,
          module: ts.ModuleKind.ESNext,
          sourceMap: true,
        },
      })
      return {
        code: result.outputText.replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'),
        map: result.sourceMapText,
      }
    },
  }
}

export default defineConfig([
  {
    name: PACKAGE_ID,
    entry: {
      index: 'src/index.ts',
      gateway: 'src/gateway.ts',
      'toggle-types': 'src/toggle-types.ts',
      'typert.remote-client': 'src/typert.remote-client.ts',
    },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    plugins: [standardDecoratorPlugin()],
  },
  {
    name: `${PACKAGE_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2024',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    deps: {
      neverBundle: CLIENT_EXTERNALS as unknown as string[],
      alwaysBundle: (id: string) => ((CLIENT_EXTERNALS as readonly string[]).includes(id) ? undefined : true),
      onlyBundle: ['zod'],
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: "${PACKAGE_ID}", factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
