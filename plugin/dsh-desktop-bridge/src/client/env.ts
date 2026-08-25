/**
 * Desktop-shell environment detection. The gate signal
 * (`window.__DSH_DESKTOP__`) is injected by the desktop shell; the IPC
 * carrier is `window.__DSH_DESKTOP_IPC__` (Electron) or
 * `window.__TAURI_INTERNALS__` (archived Tauri 2). Pure probing — no
 * registration side effects live here.
 */

/** Gate signal shape pinned by the shell contract (AGENTS.md 环境探测与门控). */
export interface DesktopGate {
  /** Contract version; unknown future integers downgrade to 1 with a warning. */
  version: number
  /** Shell identity string, e.g. 'dsh-desktop'. */
  shell: string
  /** OS platform as injected by the shell (`std::env::consts::OS`), e.g. 'macos' | 'windows' | 'linux'. */
  platform: string
}

/** Narrowest desktop IPC carrier face this bridge calls. */
export interface DesktopInvoke {
  /** @param cmd - registered custom command name.
   *  @param args - JSON arguments record.
   *  @returns command fulfillment value (unused by this bridge). */
  invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown>
  /** Subscribe to a shell → webview event. Archived Tauri may omit this. */
  on?(event: string, handler: (payload: unknown) => void): () => void
}

/** @deprecated Use DesktopInvoke. Kept so existing call sites type-check. */
export type TauriInvoke = DesktopInvoke

/** Probing outcome: why the bridge is (not) running. */
export type DesktopProbe =
  | { status: 'absent' }
  | { status: 'ready'; gate: DesktopGate; invoke: DesktopInvoke }
  | { status: 'shell-contract-violation'; reason: string }

declare global {
  interface Window {
    readonly __DSH_DESKTOP__?: DesktopGate
    readonly __DSH_DESKTOP_IPC__?: DesktopIpcCarrier
    readonly __TAURI_INTERNALS__?: DesktopIpcCarrier
  }
}

/** Raw preload / archived Tauri carrier. */
export interface DesktopIpcCarrier {
  invoke: DesktopInvoke['invoke']
  on?: DesktopInvoke['on']
}

/** Probing input: the window globals, unvalidated (tests construct raw records). */
export interface EnvWindow {
  readonly __DSH_DESKTOP__?: unknown
  readonly __DSH_DESKTOP_IPC__?: DesktopIpcCarrier
  readonly __TAURI_INTERNALS__?: DesktopIpcCarrier
}

/** Validated gate read: the normalized v1 gate plus the raw version (for downgrade warnings). */
interface GateRead {
  gate: DesktopGate
  originalVersion: number
  problem?: undefined
}

/** Invalid gate read: what was malformed. */
interface GateProblem {
  problem: string
}

/** Read and validate the gate signal off a window-like global record. */
function readGate(win: EnvWindow): GateRead | GateProblem | undefined {
  const raw = win.__DSH_DESKTOP__
  if (raw === undefined) return undefined
  if (typeof raw !== 'object' || raw === null) return { problem: '__DSH_DESKTOP__ is not an object' }
  const decl = raw as Record<string, unknown>
  if (typeof decl.version !== 'number' || !Number.isInteger(decl.version) || decl.version < 1) {
    return { problem: '__DSH_DESKTOP__.version is not a positive integer' }
  }
  if (typeof decl.shell !== 'string' || typeof decl.platform !== 'string') {
    return { problem: '__DSH_DESKTOP__.shell/platform are not strings' }
  }
  // Unknown future versions downgrade to contract version 1 (warned by the caller).
  return { gate: { version: 1, shell: decl.shell, platform: decl.platform }, originalVersion: decl.version }
}

function bindCarrier(raw: DesktopIpcCarrier): DesktopInvoke {
  const invoke = raw.invoke.bind(raw)
  if (typeof raw.on !== 'function') return { invoke }
  return { invoke, on: (event, handler) => raw.on!(event, handler) }
}

function readInvoke(win: EnvWindow): DesktopInvoke | undefined {
  const ipc = win.__DSH_DESKTOP_IPC__
  if (ipc !== undefined && typeof ipc.invoke === 'function') return bindCarrier(ipc)
  const internals = win.__TAURI_INTERNALS__
  if (internals !== undefined && typeof internals.invoke === 'function') {
    return bindCarrier(internals)
  }
  return undefined
}

/**
 * Probe the host window for the desktop environment.
 * @param win - the window global (injected for tests).
 * @param warn - warning sink for downgrades (the plugin logger's warn).
 * @returns the probe outcome; 'ready' only when both signals are present and well-formed.
 */
export function probeDesktop(win: EnvWindow, warn: (message: string) => void): DesktopProbe {
  const read = readGate(win)
  if (read === undefined) return { status: 'absent' }
  if (read.problem !== undefined) return { status: 'shell-contract-violation', reason: read.problem }
  if (read.originalVersion !== 1) {
    warn(`dsh-desktop-bridge: gate version ${String(read.originalVersion)} unknown, downgrading to 1`)
  }
  const invoke = readInvoke(win)
  if (invoke === undefined) {
    return {
      status: 'shell-contract-violation',
      reason: '__DSH_DESKTOP__ present but invoke carrier is missing',
    }
  }
  return { status: 'ready', gate: read.gate, invoke }
}
