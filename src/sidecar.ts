import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

import { LADDER_TICK_MS, PROBE_BUDGET_MS, PROBE_INTERVAL_MS, TERM_GRACE_MS } from './constants.ts'
import { shellRoot } from './paths.ts'
import { pidMatches, psLstart } from './profile-repair.ts'
import { sidecarEnv, type Runtime } from './runtime.ts'

export type SweepDecision = 'keep' | 'reap' | 'forget'

export interface SidecarEntry {
  sidecarPid: number
  sidecarLstart: string
  shellPid: number
  shellLstart: string
  port: number
  log: string
}

let sidecar: ChildProcess | undefined
let registryFile: string | undefined

export function sweepDecision(shellAlive: boolean, sidecarAlive: boolean): SweepDecision {
  if (shellAlive && sidecarAlive) return 'keep'
  if (!sidecarAlive) return 'forget'
  return 'reap'
}

export function registryPath(root: string): string {
  return path.join(root, 'sidecars.json')
}

export function loadRegistry(file: string): SidecarEntry[] {
  try {
    const text = fs.readFileSync(file, 'utf8')
    return JSON.parse(text) as SidecarEntry[]
  } catch {
    return []
  }
}

export function storeRegistry(file: string, entries: SidecarEntry[]): void {
  const tmp = `${file}.tmp`
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(entries, null, 2)}\n`)
    fs.renameSync(tmp, file)
  } catch (error) {
    console.error(`dsh-desktop: writing sidecar registry ${file} failed: ${String(error)}`)
  }
}

export function addRegistryEntry(file: string, entry: SidecarEntry): void {
  const entries = loadRegistry(file).filter((existing) => existing.sidecarPid !== entry.sidecarPid)
  entries.push(entry)
  storeRegistry(file, entries)
}

export function unregisterSidecar(pid: number): void {
  if (registryFile === undefined) return
  const entries = loadRegistry(registryFile)
  const kept = entries.filter((existing) => existing.sidecarPid !== pid)
  if (kept.length !== entries.length) storeRegistry(registryFile, kept)
}

function sleep(ms: number): void {
  const until = Date.now() + ms
  while (Date.now() < until) {
    // busy wait is fine for the short TERM ladder ticks
  }
}

function signalTarget(pid: number): number {
  if (process.platform === 'win32') return pid
  try {
    process.kill(-pid, 0)
    return -pid
  } catch {
    return pid
  }
}

export function termThenKill(pid: number): void {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T'], { windowsHide: true, stdio: 'ignore' })
    const deadline = Date.now() + TERM_GRACE_MS
    while (Date.now() < deadline) {
      if (psLstart(pid) === null) return
      sleep(LADDER_TICK_MS)
    }
    spawn('taskkill', ['/F', '/PID', String(pid), '/T'], { windowsHide: true, stdio: 'ignore' })
    return
  }
  const target = signalTarget(pid)
  try {
    process.kill(target, 'SIGTERM')
  } catch {
    return
  }
  const deadline = Date.now() + TERM_GRACE_MS
  while (Date.now() < deadline) {
    if (psLstart(pid) === null) return
    sleep(LADDER_TICK_MS)
  }
  try {
    process.kill(target, 'SIGKILL')
  } catch {
    // already gone
  }
}

export function sweepStaleSidecars(file: string): SidecarEntry[] {
  const entries = loadRegistry(file)
  if (entries.length === 0) return []
  const kept: SidecarEntry[] = []
  const reaped: SidecarEntry[] = []
  for (const entry of entries) {
    switch (sweepDecision(
      pidMatches(entry.shellPid, entry.shellLstart),
      pidMatches(entry.sidecarPid, entry.sidecarLstart),
    )) {
      case 'keep':
        kept.push(entry)
        break
      case 'forget':
        break
      case 'reap':
        termThenKill(entry.sidecarPid)
        reaped.push(entry)
        break
    }
  }
  storeRegistry(file, kept)
  return reaped
}

export function killSidecar(): void {
  const child = sidecar
  sidecar = undefined
  if (child?.pid === undefined) return
  const pid = child.pid
  termThenKill(pid)
  try {
    child.kill('SIGKILL')
  } catch {
    // gone
  }
  unregisterSidecar(pid)
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const listener = net.createServer()
    listener.on('error', reject)
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address()
      if (address === null || typeof address === 'string') {
        listener.close()
        reject(new Error('bind for port pick: no port'))
        return
      }
      const port = address.port
      listener.close(() => resolve(port))
    })
  })
}

export function sidecarLogPath(home: string): string {
  const dir = process.env.DSH_WEB_LOG_DIR && process.env.DSH_WEB_LOG_DIR !== ''
    ? process.env.DSH_WEB_LOG_DIR
    : path.join(home, 'logs')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = timestamp()
  const log = path.join(dir, `desktop-${stamp}.log`)
  const latest = path.join(dir, 'desktop-latest.log')
  try {
    fs.rmSync(latest, { force: true })
    fs.symlinkSync(log, latest)
  } catch {
    // Windows best-effort
  }
  return log
}

function timestamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

export function spawnSidecar(runtime: Runtime, home: string, port: number): string {
  const logPath = sidecarLogPath(home)
  const log = fs.openSync(logPath, 'a')
  const env = sidecarEnv(runtime, { DSH_HOME: home })
  const child = spawn(
    runtime.node,
    [...runtime.argsPrefix, runtime.cli, 'web', '--port', String(port), '--no-open'],
    {
      cwd: runtime.cwd,
      env,
      detached: process.platform !== 'win32',
      // Windows: taskkill /T is the tree-kill stand-in for a Job Object
      // (CREATE_BREAKAWAY_JOB is not a first-class Node spawn option).
      stdio: ['ignore', log, log],
      windowsHide: true,
    },
  )
  fs.closeSync(log)
  if (child.pid === undefined) throw new Error('spawn sidecar: no pid')
  const sidecarLstart = psLstart(child.pid)
  const shellLstart = psLstart(process.pid)
  if (registryFile !== undefined && sidecarLstart !== null && shellLstart !== null) {
    addRegistryEntry(registryFile, {
      sidecarPid: child.pid,
      sidecarLstart,
      shellPid: process.pid,
      shellLstart,
      port,
      log: logPath,
    })
  }
  sidecar = child
  console.log(
    `dsh-desktop: sidecar ${runtime.oneNode ? 'one-node' : 'two-node'} pid=${String(child.pid)} node=${runtime.node} port=${String(port)} log=${logPath}`,
  )
  child.on('error', (error) => {
    console.error(`dsh-desktop: sidecar error: ${error.message}`)
  })
  return logPath
}

export function initSidecarRegistry(): void {
  const file = registryPath(shellRoot())
  registryFile = file
  for (const entry of sweepStaleSidecars(file)) {
    console.log(
      `dsh-desktop: reaped stale sidecar pid=${entry.sidecarPid} port=${entry.port} (shell pid ${entry.shellPid} is gone; log ${entry.log})`,
    )
  }
}

export async function waitReady(port: number): Promise<boolean> {
  const started = Date.now()
  let consecutive = 0
  while (Date.now() - started < PROBE_BUDGET_MS) {
    if (await probeReady(port)) {
      consecutive += 1
      // Two answers in a row so a crashing boot cannot look ready.
      if (consecutive >= 2) return true
    } else {
      consecutive = 0
    }
    await new Promise((resolve) => setTimeout(resolve, PROBE_INTERVAL_MS))
  }
  return false
}

async function probeReady(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const finish = (ok: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(2000)
    socket.on('connect', () => {
      socket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`)
    })
    socket.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      finish(text.startsWith('HTTP/1.1 2') || text.startsWith('HTTP/1.0 2'))
    })
    socket.on('timeout', () => finish(false))
    socket.on('error', () => finish(false))
  })
}
