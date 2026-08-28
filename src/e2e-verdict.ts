/**
 * Shared e2e verdict cell. ipc.ts owns the `dsh_desktop_e2e_report` channel;
 * the surface-switch flow reports its own verdicts here too — importing ipc.ts
 * from surface-switch would cycle (ipc imports the switch flow).
 */

let verdict: string | undefined

export function setE2eVerdict(value: string): void {
  verdict = value
}

export function getE2eVerdict(): string | undefined {
  return verdict
}
