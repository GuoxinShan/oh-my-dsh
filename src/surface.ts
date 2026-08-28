/**
 * Runtime surface (profile) switching: the pure half.
 *
 * The desktop's active surface is the profile the sidecar boots. It persists
 * per DSH_HOME in `<shellRoot>/active-profiles/<home-hash>.json` (home-keyed
 * so a scratch-home e2e never leaks into the real home's next boot); 'web' is
 * the default and the fallback every invalid state resets to. A directory qualifies as a surface only as
 * a direct child of `$DSH_HOME/profiles` (the harness launcher resolves
 * profiles by name from there) whose manifest's `dsh.profile.bundles` carries
 * `@deepseek-ai/dsh-web-app` — without the web bundle there is no HTTP
 * surface for the window to load. The directory must be readable AND
 * writable: the first switch stages the desktop-owned packages into it.
 *
 * Everything here is Electron-free and unit-testable; the flow that glues
 * menus, dialogs, and the sidecar restart lives in `surface-switch.ts`.
 */

import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

export const DEFAULT_SURFACE = 'web'
export const WEB_APP_BUNDLE = '@deepseek-ai/dsh-web-app'

const STATE_DIR = 'active-profiles'

/** Canonical home key, same idea as the adoption records: one state per DSH_HOME. */
function homeKey(home: string): string {
  const absolute = path.resolve(home)
  let canonical = absolute
  try {
    canonical = fs.realpathSync.native(absolute)
  } catch {
    // home may not exist yet on a fresh boot — the absolute path is the key
  }
  const digest = createHash('sha256')
  digest.update(Buffer.from('dsh-desktop-active-surface-home-v1'))
  digest.update(Buffer.from(canonical, 'utf8'))
  return digest.digest('hex')
}

function statePath(root: string, home: string): string {
  return path.join(root, STATE_DIR, `${homeKey(home)}.json`)
}

/** Load the persisted active surface for THIS home; unreadable/invalid state falls back to 'web'. */
export function loadActiveSurface(root: string, home: string): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(root, home), 'utf8')) as { active?: unknown }
    if (typeof parsed.active === 'string' && isValidProfileName(parsed.active)) return parsed.active
  } catch {
    // missing or corrupt state boots the default surface
  }
  return DEFAULT_SURFACE
}

/** Persist the active surface for this home atomically (tmp + rename, like the sidecar registry). */
export function saveActiveSurface(root: string, home: string, name: string): void {
  if (!isValidProfileName(name)) throw new Error(`invalid surface profile name ${JSON.stringify(name)}`)
  const file = statePath(root, home)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify({ active: name }, null, 2)}\n`)
  fs.renameSync(tmp, file)
}

/** The harness launcher's profile-name rule (`resolveProfileDir`), mirrored. */
export function isValidProfileName(name: string): boolean {
  return name !== ''
    && name !== '.'
    && name !== '..'
    && name !== 'node_modules'
    && !name.includes('/')
    && !name.includes('\\')
}

/** Profiles the launcher resolves from `$DSH_HOME/profiles/<name>`. */
export function profilesRoot(home: string): string {
  return path.join(home, 'profiles')
}

export type SurfaceDirVerdict = { ok: true; name: string } | { ok: false; reason: string }

interface ProfileManifestProbe {
  dsh?: { profile?: { bundles?: unknown } }
}

/**
 * Validate a user-picked directory as a switchable surface. Errors are
 * user-facing Chinese copy: the picker can land anywhere, so each rejection
 * says exactly why and what qualifies.
 */
export function validateSurfaceDir(home: string, dir: string): SurfaceDirVerdict {
  const resolved = path.resolve(dir)
  const root = path.resolve(profilesRoot(home))
  if (path.dirname(resolved) !== root) {
    return {
      ok: false,
      reason: `所选目录不是运行面：${resolved}\n\n运行面必须是 DSH_HOME 的 profiles 目录的直接子目录：${root}\n（想放在别处的目录，可以在 profiles 下建一个指向它的软链接。）`,
    }
  }
  const name = path.basename(resolved)
  if (!isValidProfileName(name)) {
    return { ok: false, reason: `「${name}」不是合法的运行面名称。` }
  }
  let stat: fs.Stats
  try {
    stat = fs.statSync(resolved)
  } catch (error) {
    return { ok: false, reason: `目录不可读：${resolved}\n\n${String(error)}` }
  }
  if (!stat.isDirectory()) {
    return { ok: false, reason: `所选路径不是目录：${resolved}` }
  }
  const manifestPath = path.join(resolved, 'package.json')
  let manifest: ProfileManifestProbe
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ProfileManifestProbe
  } catch (error) {
    return {
      ok: false,
      reason: `该目录不是合法的 DSH 运行面：读取或解析 package.json 失败。\n\n${String(error)}\n\n可以先用终端创建：dsh plugin --profile ${name} add <package>`,
    }
  }
  const bundles = manifest.dsh?.profile?.bundles
  if (!Array.isArray(bundles) || !bundles.includes(WEB_APP_BUNDLE)) {
    return {
      ok: false,
      reason: `运行面「${name}」没有 Web 界面（dsh.profile.bundles 不含 ${WEB_APP_BUNDLE}），桌面的窗口无从加载。\n\n可以在终端为它补上 Web 应用层后再切换。`,
    }
  }
  try {
    fs.accessSync(resolved, fs.constants.R_OK | fs.constants.W_OK)
  } catch (error) {
    return {
      ok: false,
      reason: `没有该目录的读写权限：${resolved}\n\n首次切换需要往里面安装桌面组件（bridge 等）。\n\n${String(error)}`,
    }
  }
  return { ok: true, name }
}
