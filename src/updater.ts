import { app } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import {
  claimUpdateCheck,
  claimUpdateDownload,
  claimUpdateInstall,
  setUpdateStatus,
  statusVersion,
  updateStatusSnapshot,
  type DesktopUpdateStatus,
} from './updater-state.ts'

export type { DesktopUpdateStatus }
export { updateStatusSnapshot }

function notesOf(info: UpdateInfo): string {
  return typeof info.releaseNotes === 'string' ? info.releaseNotes : ''
}

function configureUpdater(): typeof autoUpdater {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  // Semver `-rc` is not a GitHub prerelease channel. Default allowPrerelease
  // would scrape releases.atom and treat the first `rc` tag as the feed, so a
  // failed `v*` tag with no latest-mac.yml poisons every installed -rc build.
  // Pin false so checks follow /releases/latest (make_latest desktop only).
  autoUpdater.allowPrerelease = false
  return autoUpdater
}

export async function checkUpdate(): Promise<{ update: { version: string; notes: string } | null }> {
  if (!app.isPackaged) {
    setUpdateStatus({ phase: 'current' })
    return { update: null }
  }
  const expected = claimUpdateCheck()
  const updater = configureUpdater()
  try {
    const result = await updater.checkForUpdates()
    if (result === null || result.isUpdateAvailable === false) {
      setUpdateStatus({ phase: 'current' })
      return { update: null }
    }
    const info = result.updateInfo
    const notes = notesOf(info)
    setUpdateStatus({ phase: 'available', version: info.version, notes })
    return { update: { version: info.version, notes } }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setUpdateStatus({
      phase: 'failed',
      message,
      ...(expected === undefined ? {} : { version: expected }),
    })
    throw new Error(message)
  }
}

export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged) throw new Error('updates are disabled in unpackaged builds')
  const expected = claimUpdateDownload()
  const updater = configureUpdater()
  try {
    const result = await updater.checkForUpdates()
    if (result === null) throw new Error('no update available')
    const info = result.updateInfo
    setUpdateStatus({ phase: 'downloading', version: info.version, downloaded: 0 })
    updater.removeAllListeners('download-progress')
    updater.on('download-progress', (progress) => {
      setUpdateStatus({
        phase: 'downloading',
        version: info.version,
        downloaded: progress.transferred,
        ...(progress.total > 0 ? { total: progress.total } : {}),
      })
    })
    await updater.downloadUpdate()
    setUpdateStatus({ phase: 'ready', version: info.version, notes: notesOf(info) })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const version = statusVersion(updateStatusSnapshot()) ?? expected
    setUpdateStatus({
      phase: 'failed',
      message,
      ...(version === undefined ? {} : { version }),
    })
    throw new Error(message)
  }
}

export function installUpdate(): never {
  const expected = claimUpdateInstall()
  setUpdateStatus({ phase: 'restarting', version: expected })
  configureUpdater().quitAndInstall(false, true)
  throw new Error('install did not replace the process')
}
