import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import {
  BRIDGE_PACKAGE,
  COMPACTION_PACKAGE,
  COMPACTION_RUNTIME_PEERS,
  MODEL_IMAGE_INPUT_PACKAGE,
  SEND_WHILE_RUNNING_PACKAGE,
  WEB_SEARCH_TOGGLE_PACKAGE,
  WEB_SEARCH_TOGGLE_RUNTIME_PEERS,
} from './constants.ts'
import { extractHashedPackage, readRevisionManifest } from './extract.ts'
import { repoRoot, resourceDir, shellRoot } from './paths.ts'
import type { Runtime } from './runtime.ts'

export interface PluginRef {
  package: string
  dir: string
}

function envPlugin(name: string, envName: string): string | undefined {
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

export function findDesktopPlugins(packaged: boolean): PluginRef[] {
  return [
    {
      package: BRIDGE_PACKAGE,
      dir: findPlugin(packaged, 'DSH_DESKTOP_BRIDGE', 'bridge.tar.gz', 'bridgeTarball', 'bridge', 'plugin/dsh-desktop-bridge', BRIDGE_PACKAGE),
    },
    {
      package: COMPACTION_PACKAGE,
      dir: findPlugin(packaged, 'DSH_DESKTOP_COMPACTION_PLUGIN', 'compaction-hierarchical.tar.gz', 'compactionHierarchicalTarball', `plugins/${COMPACTION_PACKAGE}`, 'plugin/dsh-compaction-hierarchical', COMPACTION_PACKAGE),
    },
    {
      package: WEB_SEARCH_TOGGLE_PACKAGE,
      dir: findPlugin(packaged, 'DSH_DESKTOP_WEB_SEARCH_TOGGLE_PLUGIN', 'web-search-toggle.tar.gz', 'webSearchToggleTarball', `plugins/${WEB_SEARCH_TOGGLE_PACKAGE}`, 'plugin/dsh-web-search-toggle', WEB_SEARCH_TOGGLE_PACKAGE),
    },
    {
      package: MODEL_IMAGE_INPUT_PACKAGE,
      dir: findPlugin(packaged, 'DSH_DESKTOP_MODEL_IMAGE_INPUT_PLUGIN', 'model-image-input.tar.gz', 'modelImageInputTarball', `plugins/${MODEL_IMAGE_INPUT_PACKAGE}`, 'plugin/dsh-model-image-input', MODEL_IMAGE_INPUT_PACKAGE),
    },
    {
      package: SEND_WHILE_RUNNING_PACKAGE,
      dir: findPlugin(packaged, 'DSH_DESKTOP_SEND_WHILE_RUNNING_PLUGIN', 'send-while-running.tar.gz', 'sendWhileRunningTarball', `plugins/${SEND_WHILE_RUNNING_PACKAGE}`, 'plugin/dsh-send-while-running', SEND_WHILE_RUNNING_PACKAGE),
    },
  ]
}

function resolveRuntimePackage(runtime: Runtime, packageName: string): string | undefined {
  const hoisted = path.join(runtime.cwd, 'node_modules', packageName)
  if (fs.existsSync(hoisted) && fs.statSync(hoisted).isDirectory()) return hoisted
  const encoded = packageName.replaceAll('/', '+')
  const prefix = `${encoded}@`
  const pnpmDir = path.join(runtime.cwd, 'node_modules/.pnpm')
  if (!fs.existsSync(pnpmDir)) return undefined
  const matches = fs.readdirSync(pnpmDir)
    .filter((name) => name.startsWith(prefix))
    .map((name) => path.join(pnpmDir, name, 'node_modules', packageName))
    .filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory())
    .sort()
  return matches[0]
}

function linkDir(target: string, link: string): void {
  fs.mkdirSync(path.dirname(link), { recursive: true })
  if (process.platform === 'win32') {
    try {
      fs.symlinkSync(target, link, 'dir')
      return
    } catch {
      const status = spawnSync('cmd', ['/C', 'mklink', '/J', link, target], { windowsHide: true })
      if (status.status !== 0) {
        throw new Error(`mklink /J ${link} -> ${target} exited ${String(status.status)}`)
      }
    }
    return
  }
  fs.symlinkSync(target, link)
}

function removeDirLink(link: string): void {
  try {
    fs.rmSync(link, { force: true })
  } catch {
    fs.rmdirSync(link)
  }
}

function ensureRuntimePackageLink(plugin: string, runtime: Runtime, packageName: string): void {
  const targetRel = resolveRuntimePackage(runtime, packageName)
  if (targetRel === undefined) {
    throw new Error(`no ${packageName} package under ${runtime.cwd}`)
  }
  const target = fs.realpathSync.native(targetRel)
  const link = path.join(plugin, 'node_modules', packageName)
  try {
    const existing = fs.readlinkSync(link)
    const existingAbs = path.isAbsolute(existing) ? existing : path.join(path.dirname(link), existing)
    try {
      if (fs.realpathSync.native(existingAbs) === target) return
    } catch {
      // replace
    }
    removeDirLink(link)
  } catch {
    if (fs.existsSync(link)) return
  }
  linkDir(target, link)
}

export function ensurePluginRuntimeLinks(plugins: PluginRef[], runtime: Runtime): void {
  for (const plugin of plugins) {
    if (plugin.package === BRIDGE_PACKAGE) {
      try {
        ensureRuntimePackageLink(plugin.dir, runtime, '@deepseek-ai/cordis')
      } catch (error) {
        console.error(`dsh-desktop: bridge cordis link failed: ${String(error)}`)
      }
    }
    if (!fs.existsSync(path.join(plugin.dir, '.ok'))) continue
    const peers = plugin.package === COMPACTION_PACKAGE
      ? COMPACTION_RUNTIME_PEERS
      : plugin.package === WEB_SEARCH_TOGGLE_PACKAGE
        ? WEB_SEARCH_TOGGLE_RUNTIME_PEERS
        : []
    for (const peer of peers) {
      ensureRuntimePackageLink(plugin.dir, runtime, peer)
    }
  }
}
