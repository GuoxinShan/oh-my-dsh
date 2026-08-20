/**
 * Build config for dsh-desktop-bridge, distilled from the harness's
 * packages/client/tsdown.client.ts contract:
 *
 * - Node half (lib/index.js, lib/invariant.js): plain ESM libraries so the
 *   host Loader can import the row's node half from a plugin install.
 * - Browser half (lib/client.js): the closure-factory artifact the client
 *   module system expects — `window.__ModuleLoader__.load({id, factory})`
 *   with platform modules externalized to the loader's module table.
 *
 * No CSS-modules pipeline: the M1 badge styles itself inline with --dsw-*
 * semantic tokens only.
 */
import { defineConfig } from 'tsdown'

/** Module-table entries the browser shell answers natively (mirror of the
 * harness rc.8+ implicit baseline: PLATFORM_MODULES — shell-seeded React,
 * Cordis, and static UI libraries — plus the parser-preloaded runtime
 * exemption). rc.8 moved web-react/ui-attachment/schema-form out of the
 * platform table (ordinary libraries a browser bundle inlines); should the
 * bridge ever need one, request it via package.json `dsh.client.external`
 * or inline it — do not re-add it here. */
const CLIENT_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  // Documented runtime exemption (snapshot-store engine; preloaded by the
  // parser before the shell starts in rc.8+) — the table answers it natively.
  '@deepseek-ai/dsh-client-runtime/client',
] as const

/**
 * Bundle purity gate: any @deepseek-ai/* value import that is not a platform
 * module is a build error — cross-plugin collaboration goes through cordis
 * services; type-only imports are erased before this gate runs.
 */
function purityGate(): import('tsdown').UserConfig['plugins'][number] {
  return {
    name: 'dsh-client-bundle-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if ((CLIENT_EXTERNALS as readonly string[]).includes(source)) return null
      throw new Error(
        `client bundle purity: "${source}" is not a platform module (CLIENT_EXTERNALS) — `
        + 'cross-plugin value imports are forbidden; collaborate through cordis services',
      )
    },
  }
}

export default defineConfig([
  {
    name: 'dsh-desktop-bridge',
    entry: ['src/index.ts', 'src/invariant.ts', 'src/log-sink.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  {
    name: 'dsh-desktop-bridge/client',
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2024',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    noExternal: (id: string) => ((CLIENT_EXTERNALS as readonly string[]).includes(id) ? undefined : true),
    plugins: [purityGate()],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-desktop-bridge", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
