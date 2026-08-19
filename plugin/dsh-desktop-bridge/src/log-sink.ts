/**
 * dsh-desktop-log-sink, host half: a file outlet for `ctx.logger` traffic.
 *
 * The harness's built-in logger sink is only a 1,000-entry in-memory ring
 * buffer and the web composition mounts no console exporter, so logger
 * messages never reach stdout/stderr — the shell's per-boot `desktop-*.log`
 * (and terminal `web:log`'s `web-*.log`) capture raw process output only.
 * This plugin registers a logger Exporter that appends every message as one
 * JSON line to `logger-<timestamp>.log` next to those files, with a
 * `logger-latest.log` symlink, honouring the same `DSH_WEB_LOG_DIR` /
 * `DSH_HOME` directory resolution. Messages the ring buffer captured before
 * this plugin mounted are backfilled with `backfill: true`.
 */

import { appendFileSync, mkdirSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { Logger, type Context, type Exporter, type Message } from '@deepseek-ai/cordis'

/** One JSON-lines log record — the fields worth persisting from a Message. */
export interface LogRecord {
  sn: number
  ts: string
  name: string
  type: Message['type']
  text: string
  backfill?: true
}

/**
 * Resolve the log directory exactly like the fork's `web:log` and the shell's
 * sidecar log: `DSH_WEB_LOG_DIR` wins, else `$DSH_HOME/logs`.
 * @param env - the environment to read; injectable for tests.
 * @returns the directory this boot's log file belongs in.
 */
export function resolveLogDir(env: NodeJS.ProcessEnv): string {
  if (env.DSH_WEB_LOG_DIR !== undefined && env.DSH_WEB_LOG_DIR !== '') return env.DSH_WEB_LOG_DIR
  return join(env.DSH_HOME ?? join(homedir(), '.dsh'), 'logs')
}

/**
 * The `yyyymmdd-HHMMSS` name stamp for one boot's log file.
 * @param now - the boot time to format.
 * @returns the zero-padded local-time stamp.
 */
export function logStamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

/**
 * Project a logger Message onto its persisted record.
 * @param message - the structured logger message.
 * @param text - the already-formatted message text (see {@link Logger.format}).
 * @param backfill - whether the record came from the ring-buffer backfill.
 * @returns the JSON-serializable record.
 */
export function toRecord(message: Message, text: string, backfill: boolean): LogRecord {
  return {
    sn: message.sn,
    ts: new Date(message.ts).toISOString(),
    name: message.name,
    type: message.type,
    text,
    ...(backfill ? { backfill: true as const } : {}),
  }
}

/** Per-process sink state, kept on globalThis so HMR reloads of this module share it. */
interface SinkState {
  file: string
  /** Highest message sn written so far — HMR backfill dedupes against it. */
  flushedThrough: number
  /** Set after the first write failure: the sink goes quiet rather than throwing into callers. */
  failed?: boolean
}

const PROCESS_STATE = Symbol.for('dsh-desktop.log-sink.state')

function stateForProcess(): SinkState {
  const registry = globalThis as { [PROCESS_STATE]?: SinkState }
  if (registry[PROCESS_STATE] !== undefined) return registry[PROCESS_STATE]
  try {
    return registry[PROCESS_STATE] = { file: createLogFile(), flushedThrough: 0 }
  } catch (error) {
    // Same best-effort contract as per-write failures: report once on stderr
    // (the shell's tee captures it) and go quiet — an unopenable log file
    // must never take the plugin tree, and with it the whole boot, down.
    console.error('[dsh-desktop-log-sink] could not open the log file; sink disabled:', error)
    return registry[PROCESS_STATE] = { file: '', flushedThrough: 0, failed: true }
  }
}

function createLogFile(): string {
  const dir = resolveLogDir(process.env)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `logger-${logStamp(new Date())}.log`)
  // `ln -sfn`: point logger-latest.log at this boot's file. Unix-only, like
  // the shell's desktop-latest.log; Windows gets plain per-boot files.
  if (process.platform !== 'win32') linkLatest(dir, file)
  return file
}

/**
 * Swap `logger-latest.log` to this boot's file via an atomic rename. The
 * desktop sidecar and terminal `dsh web` boots share one log directory, so
 * the swap must be atomic: an rm-then-symlink window lets a simultaneous
 * boot's `symlinkSync` fail with EEXIST. Each boot stages its link under a
 * pid-private name, so staging cannot collide either; whoever renames last
 * wins, which is all a "latest" pointer promises. Best-effort like every
 * other sink failure — losing the pointer never disables the per-boot file.
 * @param dir - the shared log directory.
 * @param file - this boot's log file, the link's target.
 */
export function linkLatest(dir: string, file: string): void {
  try {
    const link = join(dir, 'logger-latest.log')
    const staging = `${link}.${process.pid}`
    rmSync(staging, { force: true })
    symlinkSync(file, staging)
    renameSync(staging, link)
  } catch (error) {
    console.error('[dsh-desktop-log-sink] latest-pointer swap failed:', error)
  }
}

export const name = 'dsh-desktop-log-sink'

/** Register the file exporter and backfill the ring buffer, once per fiber. */
export function apply(ctx: Context): void {
  const state = stateForProcess()
  const exporter: Exporter = {
    colors: false,
    // 3 = LoggerLevel.DEBUG (a const enum, unsafe across bundle boundaries):
    // the file wants everything the service emits.
    levels: { default: 3 },
    // The default %o formatter is JSON.stringify, which throws on circular
    // structures — inspect never does, and the per-line maxLength in
    // Logger.format still bounds the output.
    formatters: {
      o: value => inspect(value, { depth: 5, compact: true, breakLength: Number.POSITIVE_INFINITY }),
      O: value => inspect(value, { depth: 5, compact: true, breakLength: Number.POSITIVE_INFINITY }),
    },
    export(message) {
      write(message, false)
    },
  }
  const write = (message: Message, backfill: boolean): void => {
    if (state.failed === true) return
    try {
      appendFileSync(state.file, JSON.stringify(toRecord(message, Logger.format(exporter, message), backfill)) + '\n')
    } catch (error) {
      // Best-effort sink: a write failure must never propagate into whoever
      // logged. Report once on stderr (the shell's tee captures it), then
      // go quiet.
      state.failed = true
      console.error('[dsh-desktop-log-sink] write failed; sink disabled:', error)
    }
    if (message.sn > state.flushedThrough) state.flushedThrough = message.sn
  }
  // Snapshot before registering, flush after: apply is synchronous, so no
  // message can slip between the read and the registration. On HMR re-apply
  // the sn watermark keeps already-flushed messages from being written twice.
  const backlog = ctx.logger.buffer.filter(message => message.sn > state.flushedThrough)
  ctx.logger.exporter(exporter)
  for (const message of backlog) write(message, true)
}
