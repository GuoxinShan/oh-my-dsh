import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** Paths written under `~/.dsh-desktop/darwin-dock-guard/` (or a test root). */
export interface DarwinDockGuard {
  hideDockJs: string
  spawnGuardJs: string
  hideDockLib: string
  pgrpHelper: string
}

export interface NormalizedSpawn {
  command: string
  args: string[]
  options: Record<string, unknown>
}

const STAMP_NAME = '.ok'
const HIDE_DOCK_C = `/* Hide this process from the macOS Dock (LSUIElement / background). */
#include <ApplicationServices/ApplicationServices.h>

__attribute__((constructor))
static void dsh_hide_dock(void) {
  ProcessSerialNumber psn = { 0, kCurrentProcess };
  (void)TransformProcessType(&psn, kProcessTransformToBackgroundApplication);
}
`

const PGRP_C = `/* New process group without setsid(2). Session leaders of a GUI .app
 * are what Launch Services promotes to a generic "exec" Dock tile. */
#include <unistd.h>
#include <stdlib.h>

int main(int argc, char **argv) {
  if (argc < 2) return 127;
  if (setpgid(0, 0) != 0) return 126;
  execvp(argv[1], argv + 1);
  return 127;
}
`

const HIDE_DOCK_JS = `import { existsSync } from 'node:fs'
import process from 'node:process'

const lib = process.env.DSH_DARWIN_HIDE_DOCK
if (typeof lib === 'string' && lib.length > 0 && existsSync(lib)) {
  try {
    process.dlopen({ exports: {} }, lib)
  } catch {
    // Hardened Runtime may reject an ad-hoc dylib. Cosmetic only.
  }
}
`

const SPAWN_GUARD_JS = `import childProcess from 'node:child_process'
import process from 'node:process'

const helper = process.env.DSH_DARWIN_PGRP_HELPER
const originalSpawn = childProcess.spawn
const originalSpawnSync = childProcess.spawnSync

function rewrite(command, args, options) {
  if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
    options = args
    args = []
  }
  args = args ?? []
  options = options ?? {}
  if (
    typeof helper === 'string' &&
    helper.length > 0 &&
    process.platform === 'darwin' &&
    options.detached === true &&
    command !== helper
  ) {
    return {
      command: helper,
      args: [command, ...args],
      options: { ...options, detached: false },
      unref: true,
    }
  }
  return { command, args, options, unref: false }
}

childProcess.spawn = function spawn(command, args, options) {
  const next = rewrite(command, args, options)
  const child = originalSpawn.call(this, next.command, next.args, next.options)
  if (next.unref) child.unref()
  return child
}

childProcess.spawnSync = function spawnSync(command, args, options) {
  const next = rewrite(command, args, options)
  return originalSpawnSync.call(this, next.command, next.args, next.options)
}
`

function sourceStamp(): string {
  return crypto
    .createHash('sha256')
    .update(HIDE_DOCK_C)
    .update(PGRP_C)
    .update(HIDE_DOCK_JS)
    .update(SPAWN_GUARD_JS)
    .digest('hex')
}

export function normalizeSpawnArgs(
  command: string,
  args?: readonly string[] | Record<string, unknown>,
  options?: Record<string, unknown>,
): NormalizedSpawn {
  if (args !== undefined && !Array.isArray(args)) {
    return { command, args: [], options: { ...args } }
  }
  return { command, args: args === undefined ? [] : [...args], options: { ...options } }
}

/**
 * Replace Node's `detached: true` (setsid) with a helper that only setpgid.
 * Tree-kill via `kill(-pid)` still works because the helper execs in-place
 * after becoming the process-group leader.
 */
export function rewriteDetachedSpawn(
  command: string,
  args: readonly string[] | Record<string, unknown> | undefined,
  options: Record<string, unknown> | undefined,
  helper: string,
): NormalizedSpawn {
  const parsed = normalizeSpawnArgs(command, args, options)
  if (helper.length === 0 || parsed.options.detached !== true || parsed.command === helper) {
    return parsed
  }
  return {
    command: helper,
    args: [parsed.command, ...parsed.args],
    options: { ...parsed.options, detached: false },
  }
}

export function dockGuardImports(guard: DarwinDockGuard | undefined): string[] {
  if (guard === undefined) return []
  return ['--import', guard.hideDockJs, '--import', guard.spawnGuardJs]
}

export function applyDockGuardEnv(env: NodeJS.ProcessEnv, guard: DarwinDockGuard | undefined): NodeJS.ProcessEnv {
  if (guard === undefined) {
    delete env.DSH_DARWIN_PGRP_HELPER
    delete env.DSH_DARWIN_HIDE_DOCK
    return env
  }
  env.DSH_DARWIN_PGRP_HELPER = guard.pgrpHelper
  env.DSH_DARWIN_HIDE_DOCK = guard.hideDockLib
  return env
}

function writeText(file: string, body: string, mode?: number): void {
  fs.writeFileSync(file, body)
  if (mode !== undefined) fs.chmodSync(file, mode)
}

function adHocSign(file: string): void {
  try {
    execFileSync('codesign', ['--force', '--sign', '-', file], { stdio: 'ignore' })
  } catch {
    // Unsigned is fine when the host Electron allows library validation off.
  }
}

function compile(src: string, dest: string, args: string[]): boolean {
  try {
    execFileSync('clang', args, { stdio: 'ignore' })
    adHocSign(dest)
    return fs.existsSync(dest)
  } catch {
    try {
      fs.unlinkSync(src)
    } catch {
      // keep going
    }
    return false
  }
}

/**
 * Compile the Dock-guard binaries once per source stamp. Fail-soft: a missing
 * clang or a codesign refusal leaves one-node behavior unchanged.
 */
export function ensureDarwinDockGuard(root: string): DarwinDockGuard | undefined {
  if (process.platform !== 'darwin') return undefined
  const dir = path.join(root, 'darwin-dock-guard')
  const hideDockJs = path.join(dir, 'hide-dock.mjs')
  const spawnGuardJs = path.join(dir, 'spawn-guard.mjs')
  const hideDockLib = path.join(dir, 'hide-dock.dylib')
  const pgrpHelper = path.join(dir, 'dsh-pgrp')
  const stamp = path.join(dir, STAMP_NAME)
  const expected = sourceStamp()
  const ready: DarwinDockGuard = { hideDockJs, spawnGuardJs, hideDockLib, pgrpHelper }
  try {
    if (
      fs.readFileSync(stamp, 'utf8').trim() === expected
      && fs.existsSync(hideDockJs)
      && fs.existsSync(spawnGuardJs)
      && fs.existsSync(hideDockLib)
      && fs.existsSync(pgrpHelper)
    ) {
      return ready
    }
  } catch {
    // rebuild
  }

  fs.mkdirSync(dir, { recursive: true })
  writeText(hideDockJs, HIDE_DOCK_JS)
  writeText(spawnGuardJs, SPAWN_GUARD_JS)

  const hideSrc = path.join(dir, 'hide-dock.c')
  const pgrpSrc = path.join(dir, 'dsh-pgrp.c')
  writeText(hideSrc, HIDE_DOCK_C)
  writeText(pgrpSrc, PGRP_C)
  const hideOk = compile(hideSrc, hideDockLib, [
    '-dynamiclib',
    '-framework',
    'ApplicationServices',
    '-o',
    hideDockLib,
    hideSrc,
  ])
  const pgrpOk = compile(pgrpSrc, pgrpHelper, ['-o', pgrpHelper, pgrpSrc])
  try {
    fs.unlinkSync(hideSrc)
    fs.unlinkSync(pgrpSrc)
  } catch {
    // source leftovers are harmless
  }
  if (!hideOk || !pgrpOk) {
    console.warn('dsh-desktop: darwin dock guard compile failed; bash may still appear in the Dock')
    return undefined
  }
  fs.chmodSync(pgrpHelper, 0o755)
  writeText(stamp, `${expected}\n`)
  return ready
}
