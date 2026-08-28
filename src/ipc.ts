import fs from 'node:fs'
import path from 'node:path'

import { BrowserWindow, Notification, app, ipcMain, shell } from 'electron'

import { APP_ID } from './constants.ts'
import { getE2eVerdict, setE2eVerdict } from './e2e-verdict.ts'
import { sanitizeDownloadName, uniquePath } from './files.ts'
import { userHome } from './paths.ts'
import { presentSurfaceMenu } from './surface-switch.ts'
import { cancelUpdate, checkUpdate, downloadUpdate, installUpdate, updateStatusSnapshot } from './updater.ts'
import { allowedExternalUrl } from './urls.ts'

let mainWindow: BrowserWindow | undefined

export function setMainWindow(window: BrowserWindow | undefined): void {
  mainWindow = window
}

export function getMainWindow(): BrowserWindow | undefined {
  return mainWindow
}

export function focusMainWindow(): void {
  if (mainWindow === undefined) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function downloadsDir(): string {
  const dir = path.join(userHome(), 'Downloads')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export async function openExternal(url: string): Promise<void> {
  if (!allowedExternalUrl(url)) throw new Error(`scheme not allowed: ${url}`)
  await shell.openExternal(url)
}

export const NOTIFY_CLICK_CHANNEL = 'dsh-desktop-notify-click'

export function notify(title: string, body: string, sessionId?: string): void {
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID)
  const notification = new Notification({ title, body })
  notification.on('click', () => {
    focusMainWindow()
    if (sessionId === undefined || sessionId.length === 0) return
    if (mainWindow === undefined || mainWindow.isDestroyed()) return
    mainWindow.webContents.send(NOTIFY_CLICK_CHANNEL, { sessionId })
  })
  notification.show()
}

export function saveFile(name: string, base64: string): string {
  const sanitized = sanitizeDownloadName(name)
  const bytes = Buffer.from(base64, 'base64')
  const dest = uniquePath(downloadsDir(), sanitized)
  fs.writeFileSync(dest, bytes)
  return dest
}

export function ipcVerdict(): string | undefined {
  return getE2eVerdict()
}

export function registerIpc(): void {
  ipcMain.handle('dsh_desktop_open_external', async (_event, args: { url?: string } | string) => {
    const url = typeof args === 'string' ? args : args.url
    if (!url) throw new Error('url required')
    await openExternal(url)
  })
  ipcMain.handle('dsh_desktop_notify', (_event, args: { title?: string; body?: string; sessionId?: string }) => {
    notify(args.title ?? '', args.body ?? '', typeof args.sessionId === 'string' ? args.sessionId : undefined)
  })
  ipcMain.handle('dsh_desktop_save_file', (_event, args: { name?: string; base64?: string }) => {
    if (!args.name || args.base64 === undefined) throw new Error('name and base64 required')
    return saveFile(args.name, args.base64)
  })
  ipcMain.handle('dsh_desktop_e2e_report', (_event, args: { verdict?: string }) => {
    if (args.verdict !== undefined) setE2eVerdict(args.verdict)
  })
  ipcMain.handle('dsh_desktop_check_update', () => checkUpdate())
  ipcMain.handle('dsh_desktop_update_status', () => updateStatusSnapshot())
  ipcMain.handle('dsh_desktop_download_update', () => downloadUpdate())
  ipcMain.handle('dsh_desktop_cancel_update', () => cancelUpdate())
  ipcMain.handle('dsh_desktop_install_update', () => installUpdate())
  // Surface switch carries no renderer-supplied path on purpose: the shell
  // owns the picker, so webview content cannot steer the filesystem choice.
  ipcMain.handle('dsh_desktop_switch_surface', () => presentSurfaceMenu(mainWindow))
}
