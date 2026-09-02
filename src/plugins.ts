import fs from 'node:fs'
import path from 'node:path'

import { extractHashedPackage, readRevisionManifest } from './extract.ts'
import { repoRoot, resourceDir, shellRoot } from './paths.ts'
import type { Runtime } from './runtime.ts'
import { linkPluginRuntimeDeps, listShippedPluginSpecs } from '../scripts/shipped-plugins.mjs'

export interface PluginRef {
  package: string
  dir: string
}

export interface ShippedPluginRef {
  package: string
  tarball: string
  destRel: string
  env: string
  hashKey: string
}

function envPlugin(label: string, envName: string): string | undefined {
  const fromEnv = process.env[envName]
  if (!fromEnv) return undefined
  if (!fs.existsSync(path.join(fromEnv, 'package.json'))) {
    throw new Error(`${envName}=${fromEnv} has no package.json`)
  }
  return fromEnv
}

function extractPlugin(packaged: boolean, tarName: string, dest: string, hashKey: string): string | undefined {
  if (!packaged) return undefined
  const resources = resourceDir(packaged)
  if (resources === undefined) return undefined
  const tar = path.join(resources, tarName)
  if (!fs.existsSync(tar)) return undefined
  const manifest = readRevisionManifest(resources)
  const hash = typeof manifest?.[hashKey] === 'string' ? manifest[hashKey] : undefined
  extractHashedPackage(tar, dest, hash)
  return dest
}

function findPlugin(
  packaged: boolean,
  envName: string,
  tarName: string,
  hashKey: string,
  destRel: string,
  devRel: string,
  label: string,
): string {
  const fromEnv = envPlugin(label, envName)
  if (fromEnv !== undefined) return fromEnv
  const extracted = extractPlugin(packaged, tarName, path.join(shellRoot(), destRel), hashKey)
  if (extracted !== undefined) {
    console.log(`dsh-desktop: extracted bundled ${label} to ${extracted}`)
    return extracted
  }
  const dev = path.join(repoRoot(), devRel)
  if (fs.existsSync(path.join(dev, 'package.json'))) return dev
  throw new Error(`${label} package not found at ${dev} (set ${envName})`)
}

function isShippedPluginRef(value: unknown): value is ShippedPluginRef {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.package === 'string'
    && typeof row.tarball === 'string'
    && typeof row.destRel === 'string'
    && typeof row.env === 'string'
    && typeof row.hashKey === 'string'
}

function packagedShippedPlugins(packaged: boolean): ShippedPluginRef[] {
  const resources = resourceDir(packaged)
  if (resources === undefined) {
    throw new Error('dsh-desktop: packaged shell has no resource directory')
  }
  const manifest = readRevisionManifest(resources)
  const rows = manifest?.shippedPlugins
  if (!Array.isArray(rows) || rows.length === 0 || !rows.every(isShippedPluginRef)) {
    throw new Error('dsh-desktop: runtime-revision.json is missing a shippedPlugins array')
  }
  return rows
}

function specToRef(spec: ShippedPluginRef): ShippedPluginRef {
  return {
    package: spec.package,
    tarball: spec.tarball,
    destRel: spec.destRel,
    env: spec.env,
    hashKey: spec.hashKey,
  }
}

export function shippedPluginRefs(packaged: boolean): ShippedPluginRef[] {
  if (packaged) return packagedShippedPlugins(packaged)
  return listShippedPluginSpecs(repoRoot()).map(specToRef)
}

export function findDesktopPlugins(packaged: boolean): PluginRef[] {
  return shippedPluginRefs(packaged).map((spec) => ({
    package: spec.package,
    dir: findPlugin(
      packaged,
      spec.env,
      spec.tarball,
      spec.hashKey,
      spec.destRel,
      `plugin/${spec.package}`,
      spec.package,
    ),
  }))
}

export function ensurePluginRuntimeLinks(plugins: PluginRef[], runtime: Runtime): void {
  for (const plugin of plugins) {
    linkPluginRuntimeDeps(plugin.dir, runtime.cwd)
  }
}
