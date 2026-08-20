/**
 * Build config for dsh-web-search-toggle, distilled from dsh-mcp-settings:
 * host half as plain ESM libs (with standard decorators pre-transpiled for
 * Rolldown), browser half as the module-loader closure with platform modules
 * externalized. CSS Modules are inlined as a style tag at import time
 * (lightningcss transform, mcp-settings' pipeline).
 */
import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { defineConfig } from 'tsdown'
import { transform } from 'lightningcss'
import ts from 'typescript'

const PACKAGE_ID = 'dsh-web-search-toggle'
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'
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
      'patch-file': 'src/patch-file.ts',
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
    plugins: [{
      name: 'dsh-css-modules-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.module.css')) return null
        const absolute = importer === undefined ? source : resolve(dirname(importer), source)
        return CSS_VIRTUAL_PREFIX + absolute + CSS_VIRTUAL_SUFFIX
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
        const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
        this.addWatchFile(fileId)
        const source = await readFile(fileId)
        const { code, exports: cssExports } = transform({
          filename: fileId,
          code: source,
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classMap: Record<string, string> = {}
        for (const [local, value] of Object.entries(cssExports ?? {})) classMap[local] = value.name
        const tagId = `${PACKAGE_ID}/${basename(fileId)}`
        return [
          `const css = ${JSON.stringify(code.toString())};`,
          `const tagId = ${JSON.stringify(tagId)};`,
          "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
          "  const tag = document.createElement('style');",
          `  tag.dataset.plugin = ${JSON.stringify(PACKAGE_ID)};`,
          '  tag.dataset.pluginCss = tagId;',
          '  tag.textContent = css;',
          '  document.head.appendChild(tag);',
          '}',
          `export default ${JSON.stringify(classMap)};`,
        ].join('\n')
      },
    }],
  },
])
