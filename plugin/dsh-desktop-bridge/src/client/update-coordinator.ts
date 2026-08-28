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
 * Coalesce checks and serialize check, download, and install commands. A user
 * action owns the queue as soon as it is requested, so a scheduled check
 * cannot overtake it while an earlier shell request is still resolving.
 */
export function createUpdateCoordinator(invoke: UpdateInvoke): DesktopUpdaterInjected {
  let cachedCheck: Promise<DesktopUpdateInfo | null> | undefined
  let activeCheck: Promise<DesktopUpdateInfo | null> | undefined
  let activeDownload: Promise<void> | undefined
  let activeInstall: Promise<never> | undefined
  let tail: Promise<void> = Promise.resolve()
  let generation = 0

  const hasUserOperation = (): boolean => activeDownload !== undefined || activeInstall !== undefined

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
    if (hasUserOperation()) return Promise.reject(new Error('update operation already in progress'))
    if (activeCheck !== undefined) return activeCheck
    if (!force && cachedCheck !== undefined) return cachedCheck
    generation += 1
    return runCheck()
  }

  const getUpdateStatus = async () => decodeUpdateStatus(await invoke('dsh_desktop_update_status'))

  const downloadUpdate = (): Promise<void> => {
    if (activeDownload !== undefined) return activeDownload
    if (activeInstall !== undefined) return Promise.reject(new Error('update installation already in progress'))
    generation += 1
    cachedCheck = undefined
    const request = tail.then(async () => {
      await invoke('dsh_desktop_download_update')
    })
    activeDownload = request
    tail = request.then(() => undefined, () => undefined)
    request.then(
      () => { if (activeDownload === request) activeDownload = undefined },
      () => { if (activeDownload === request) activeDownload = undefined },
    )
    return request
  }

  const cancelUpdate = async (): Promise<void> => {
    // Cancel must overtake the serialized queue: the download it cancels still
    // occupies `tail`, so queueing behind it would deadlock the cancel. The
    // shell is the single-flight authority and no-ops outside busy phases.
    await invoke('dsh_desktop_cancel_update')
  }

  const installUpdate = (): Promise<never> => {
    if (activeInstall !== undefined) return activeInstall
    if (activeDownload !== undefined) return Promise.reject(new Error('update download still in progress'))
    generation += 1
    const request = tail.then(async (): Promise<never> => {
      await invoke('dsh_desktop_install_update')
      // A successful install restarts the process, so resolution is a shell
      // contract violation rather than a successful browser state.
      throw new Error('install_update resolved without restarting')
    })
    activeInstall = request
    tail = request.then(() => undefined, () => undefined)
    request.catch(() => { if (activeInstall === request) activeInstall = undefined })
    return request
  }

  return {
    checkUpdate,
    getUpdateStatus,
    updateGeneration: () => generation,
    downloadUpdate,
    cancelUpdate,
    installUpdate,
  }
}
