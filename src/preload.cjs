const { contextBridge, ipcRenderer } = require('electron')

const platform = process.platform === 'darwin'
  ? 'macos'
  : process.platform === 'win32'
    ? 'windows'
    : 'linux'

contextBridge.exposeInMainWorld('__DSH_DESKTOP__', Object.freeze({
  version: 1,
  shell: 'dsh-desktop',
  platform,
}))

const ALLOWED_EVENTS = new Set(['dsh-desktop-notify-click'])

contextBridge.exposeInMainWorld('__DSH_DESKTOP_IPC__', Object.freeze({
  invoke: (cmd, args) => ipcRenderer.invoke(cmd, args ?? {}),
  on: (event, handler) => {
    if (!ALLOWED_EVENTS.has(event)) throw new Error(`event not allowed: ${event}`)
    const listener = (_ipcEvent, payload) => { handler(payload) }
    ipcRenderer.on(event, listener)
    return () => { ipcRenderer.removeListener(event, listener) }
  },
}))

function isHarnessPage() {
  return /^https?:\/\/127\.0\.0\.1(?::\d+)?/i.test(location.href)
}

function startE2eProbe() {
  if (process.env.DSH_DESKTOP_E2E_PROBE !== '1') return
  if (!isHarnessPage()) return
  if (globalThis.__DSH_E2E_PROBE_STARTED__) return
  globalThis.__DSH_E2E_PROBE_STARTED__ = true
  // Surface-switch e2e: the badge proves the bridge is alive on the current
  // surface, then the switch command drives menu→pick→confirm→restart with
  // the env-picked directory; the shell reports the verdict itself when the
  // new sidecar answers (or fails). Never re-invoke after the reload — the
  // flow's active-surface check makes the second run a harmless no-op.
  const surface = process.env.DSH_DESKTOP_E2E_SURFACE
  const started = Date.now()
  const timer = setInterval(() => {
    const root = document.getElementById('root') || document.querySelector('[data-app-root], #app')
    const badge = document.querySelector('[data-desktop-badge]')
    if (root && badge) {
      clearInterval(timer)
      if (surface) {
        ipcRenderer
          .invoke('dsh_desktop_switch_surface', {})
          .catch((error) => {
            const message = error && error.message ? error.message : String(error)
            return ipcRenderer.invoke('dsh_desktop_e2e_report', { verdict: `fail:${message}` })
          })
        return
      }
      ipcRenderer
        .invoke('dsh_desktop_save_file', {
          name: 'dsh-e2e-probe.txt',
          base64: btoa('dsh-desktop e2e check'),
        })
        .then(() => ipcRenderer.invoke('dsh_desktop_e2e_report', { verdict: 'ok' }))
        .catch((error) => {
          const message = error && error.message ? error.message : String(error)
          return ipcRenderer.invoke('dsh_desktop_e2e_report', { verdict: `fail:${message}` })
        })
      return
    }
    if (Date.now() - started > 90_000) {
      clearInterval(timer)
      const reason = !root ? 'app root missing' : 'badge DOM missing'
      ipcRenderer.invoke('dsh_desktop_e2e_report', { verdict: `fail:${reason}` }).catch(() => {})
    }
  }, 250)
}

if (process.env.DSH_DESKTOP_E2E_PROBE === '1') {
  window.addEventListener('DOMContentLoaded', startE2eProbe)
  if (document.readyState !== 'loading') startE2eProbe()
}
