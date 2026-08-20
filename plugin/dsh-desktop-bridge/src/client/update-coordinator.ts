/** Browser-side single-flight coordinator for the desktop updater IPC. */
import { decodeUpdateStatus, type DesktopUpdateInfo, type DesktopUpdaterInjected } from './updates.ts'

/** Narrow shell command carrier, kept injectable for deterministic tests. */
export type UpdateInvoke = (command: string) => Promise<unknown>

function decodeCheckResult(value: unknown): DesktopUpdateInfo | null {
  if (typeof value !== 'object' || value === null) return null
  const update = (value as { update?: unknown }).update
  if (typeof update !== 'object' || update === null) return null
  const record = update as { version?: unknown; notes?: unknown }
  return {
    version: typeof record.version === 'string' ? record.version : '?',
    notes: typeof record.notes === 'string' ? record.notes : '',
  }
}

/**
 * Coalesce concurrent checks and serialize check/apply commands in request
 * order. Apply owns the queue as soon as it is requested, so later checks
 * cannot overtake it while an earlier shell check is still resolving.
 */
export function createUpdateCoordinator(invoke: UpdateInvoke): DesktopUpdaterInjected {
  let cachedCheck: Promise<DesktopUpdateInfo | null> | undefined
  let activeCheck: Promise<DesktopUpdateInfo | null> | undefined
  let activeApply: Promise<never> | undefined
  let tail: Promise<void> = Promise.resolve()
  let generation = 0

  const runCheck = (): Promise<DesktopUpdateInfo | null> => {
    const request = tail.then(async () => decodeCheckResult(await invoke('dsh_desktop_check_update')))
    activeCheck = request
    cachedCheck = request
    tail = request.then(() => undefined, () => undefined)
    request.then(
      () => { if (activeCheck === request) activeCheck = undefined },
      () => {
        if (activeCheck === request) activeCheck = undefined
        if (cachedCheck === request) cachedCheck = undefined
      },
    )
    return request
  }

  const checkUpdate = (force = false): Promise<DesktopUpdateInfo | null> => {
    if (activeApply !== undefined) return Promise.reject(new Error('update operation already in progress'))
    if (activeCheck !== undefined) return activeCheck
    if (!force && cachedCheck !== undefined) return cachedCheck
    generation += 1
    return runCheck()
  }

  const getUpdateStatus = async () => decodeUpdateStatus(await invoke('dsh_desktop_update_status'))

  const applyUpdate = (): Promise<never> => {
    if (activeApply !== undefined) return activeApply
    generation += 1
    cachedCheck = undefined
    const request = tail.then(async (): Promise<never> => {
      await invoke('dsh_desktop_apply_update')
      // The process restarts on success; reaching here means the shell let the
      // call resolve, which is a contract violation surfaced to both UIs.
      throw new Error('apply_update resolved without restarting')
    })
    activeApply = request
    tail = request.then(() => undefined, () => undefined)
    request.catch(() => { if (activeApply === request) activeApply = undefined })
    return request
  }

  return {
    checkUpdate,
    getUpdateStatus,
    updateGeneration: () => generation,
    applyUpdate,
  }
}
