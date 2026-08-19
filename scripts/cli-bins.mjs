import { execFileSync } from 'node:child_process'

/** Platform-correct executable names for `execFileSync`. */
export const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

/**
 * Node 20+ on Windows refuses to spawn `.cmd` without a shell (EINVAL).
 * Unix stays execFile (no shell).
 */
export function execPnpm(args, opts = {}) {
  return execFileSync(pnpm, args, {
    ...opts,
    shell: process.platform === 'win32' ? true : opts.shell,
  })
}
