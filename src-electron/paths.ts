import fs from 'node:fs'
import path from 'node:path'
import { moduleDirname } from './here.ts'

const here = moduleDirname(import.meta.url)

export function repoRoot(): string {
  return path.resolve(here, '..')
}

export function userHome(): string {
  if (process.platform === 'win32') {
    const profile = process.env.USERPROFILE
    if (profile) return profile
  }
  const home = process.env.HOME
  if (home) return home
  throw new Error('$HOME / %USERPROFILE% is not set')
}

export function shellRoot(): string {
  const root = path.join(userHome(), '.dsh-desktop')
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
  return root
}

export function dshHome(): string {
  const fromEnv = process.env.DSH_HOME
  if (fromEnv) return fromEnv
  return path.join(userHome(), '.dsh')
}

export function resourceDir(packaged: boolean): string | undefined {
  if (packaged) {
    return path.join(process.resourcesPath, 'resources')
  }
  const bundled = path.join(repoRoot(), 'src-electron/resources')
  if (fs.existsSync(path.join(bundled, 'runtime-revision.json'))) return bundled
  return undefined
}

export function gatePlatform(): 'macos' | 'windows' | 'linux' {
  if (process.platform === 'darwin') return 'macos'
  if (process.platform === 'win32') return 'windows'
  return 'linux'
}
