export interface ShippedPluginSpec {
  package: string
  dir: string
  tarball: string
  destRel: string
  env: string
  hashKey: string
  versionKey: string
  version: string
  pin: string | undefined
  packEntries: string[]
}

export function camelCaseStem(stem: string): string
export function defaultTarballName(name: string): string
export function defaultDestRel(name: string): string
export function defaultEnvName(name: string): string
export function packEntriesFor(pluginDir: string): string[]
export function hashKeyForTarball(tarball: string): string
export function versionKeyForTarball(tarball: string): string
export function listShippedPluginSpecs(repoRoot: string): ShippedPluginSpec[]
export function shippedPluginsManifest(specs: ShippedPluginSpec[]): Array<{
  package: string
  tarball: string
  destRel: string
  env: string
  hashKey: string
}>
export function runtimeLinkPlan(pluginDir: string): { required: string[], optional: string[] }
export function resolveRuntimePackage(runtimeCwd: string, packageName: string): string | undefined
export function ensureRuntimePackageLink(
  pluginDir: string,
  runtimeCwd: string,
  packageName: string,
  required: boolean,
): void
export function linkPluginRuntimeDeps(pluginDir: string, runtimeCwd: string): void
