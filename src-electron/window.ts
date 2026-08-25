import fs from 'node:fs'
import path from 'node:path'

import { app, BrowserWindow } from 'electron'
import { PRODUCT_NAME } from './constants.ts'
import { watchE2eExit } from './e2e.ts'
import { focusMainWindow, getMainWindow, setMainWindow } from './ipc.ts'
import { shouldRetainBackground } from './keep-alive.ts'

export { shouldRetainBackground }

let quitting = false
let lastUrl: string | undefined
let lastE2e = false

/** Cmd+Q / before-quit: the next close may destroy the window. */
export function setAppQuitting(value: boolean): void {
  quitting = value
}

function preloadScript(): string {
  const candidates = [
    path.join(app.getAppPath(), 'preload.cjs'),
    path.join(app.getAppPath(), 'dist-electron/preload.cjs'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error(`preload missing; tried ${candidates.join(', ')}`)
}

export async function openMainWindow(url: string, e2e: boolean): Promise<void> {
  lastUrl = url
  lastE2e = e2e
  const preload = preloadScript()
  const loadUrl = e2e ? `${url}/?e2e=1` : url
  const window = new BrowserWindow({
    title: PRODUCT_NAME,
    width: 1400,
    height: 900,
    show: true,
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 16, y: 10 },
        }
      : {}),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  setMainWindow(window)
  window.on('close', (event) => {
    if (!shouldRetainBackground(process.platform, quitting)) return
    event.preventDefault()
    window.hide()
  })
  window.on('closed', () => setMainWindow(undefined))
  if (e2e) {
    window.webContents.on('preload-error', (_event, preloadPath, error) => {
      console.error(`dsh-desktop: preload error ${preloadPath}: ${error}`)
    })
    watchE2eExit()
  }
  console.log(`dsh-desktop: window built, loading ${loadUrl}`)
  await window.loadURL(loadUrl)
}

/** Dock / taskbar activate: show the hidden window, or rebuild if it is gone. */
export async function revealMainWindow(): Promise<void> {
  const current = getMainWindow()
  if (current !== undefined && !current.isDestroyed()) {
    focusMainWindow()
    return
  }
  if (lastUrl === undefined) return
  await openMainWindow(lastUrl, lastE2e)
}
