/**
 * Runtime surface switch flow (shell half).
 *
 * The bridge's brand-area contextmenu lands here through one IPC command with
 * NO renderer-supplied path: the shell owns the native menu, the directory
 * picker, validation, the confirm dialog, and the restart. The flow:
 *
 *   turns die) → prepare (stage the desktop-owned packages into the target
 *   profile through the same shadow-CAS transaction the boot install uses;
 *   the OLD sidecar keeps serving meanwhile, but the transaction is sync
 *   `spawnSync` work on the main process, so the window and desktop
 *   integrations pause until it finishes — the confirm copy says so)
 *   → kill sidecar → spawn `--profile <name>` → waitReady → loadURL.
 *
 * The active surface persists only after the new sidecar answers ready, so a
 * failed switch rolls back to the previous surface and the next boot is
 * untouched. The prepare step runs while the OLD sidecar is still live — the
 * user keeps working until the actual restart.
 *
 * Automation: with `DSH_DESKTOP_E2E_SURFACE` set (dev/e2e only, same gate as
 * dialog.ts), the menu and picker are skipped and the flow runs against the
 * env-supplied directory; the confirm still rides DSH_DESKTOP_DIALOG_DEFAULT.
 */

import path from 'node:path'

import { Menu, dialog, type BrowserWindow } from 'electron'

import { alertDialog, automationEnabled, choose } from './dialog.ts'
import { setE2eVerdict } from './e2e-verdict.ts'
import { desktopPackagesInstalled, runDesktopPluginInstall } from './install.ts'
import type { PluginRef } from './plugins.ts'
import type { Runtime } from './runtime.ts'
import { freePort, killSidecar, spawnSidecar, waitReady } from './sidecar.ts'
import {
  loadActiveSurface,
  profilesRoot,
  saveActiveSurface,
  validateSurfaceDir,
} from './surface.ts'
import { reloadMainWindow } from './window.ts'

export interface SurfaceSwitchDeps {
  runtime: Runtime
  plugins: PluginRef[]
  home: string
  root: string
}

let deps: SurfaceSwitchDeps | undefined
let switching = false

/** Boot wires the resolved runtime/plugins/home into the flow once they exist. */
export function configureSurfaceSwitch(next: SurfaceSwitchDeps): void {
  deps = next
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The e2e pick override: only outside packaged builds (or under the probe),
 * matching the dialog automation gate — a packaged app never lets the
 * environment steer a filesystem choice.
 */
function e2eSurfacePick(): string | undefined {
  if (!automationEnabled()) return undefined
  return process.env.DSH_DESKTOP_E2E_SURFACE
}

/**
 * The IPC entry: pop the native context menu at the cursor. Under the e2e
 * surface env the one-item menu would just sit on screen, so the flow runs
 * inline instead (and the handler await gives the probe a deterministic
 * settle point).
 */
export async function presentSurfaceMenu(window: BrowserWindow | undefined): Promise<void> {
  if (e2eSurfacePick() !== undefined) {
    await runSurfaceSwitchFlow()
    return
  }
  const menu = Menu.buildFromTemplate([
    {
      label: '切换运行面…',
      click: () => {
        void runSurfaceSwitchFlow()
      },
    },
  ])
  menu.popup(window === undefined ? undefined : { window })
}

async function pickSurfaceDir(home: string): Promise<string | undefined> {
  const override = e2eSurfacePick()
  if (override !== undefined) return override
  const result = await dialog.showOpenDialog({
    title: '选择运行面目录',
    defaultPath: profilesRoot(home),
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? undefined : result.filePaths[0]
}

async function runSurfaceSwitchFlow(): Promise<void> {
  if (deps === undefined) {
    alertDialog('无法切换运行面', '桌面尚未完成启动，稍后再试。')
    return
  }
  if (switching) return
  switching = true
  try {
    const { runtime, plugins, home, root } = deps
    const picked = await pickSurfaceDir(home)
    if (picked === undefined) return
    const verdict = validateSurfaceDir(home, picked)
    if (!verdict.ok) {
      alertDialog('无法切换运行面', verdict.reason)
      setE2eVerdict(`fail:invalid-surface`)
      return
    }
    const previous = loadActiveSurface(root, home)
    if (verdict.name === previous) {
      // Idempotence for the e2e probe: landing on the persisted surface means
      // an earlier switch in this run already won.
      if (e2eSurfacePick() !== undefined) setE2eVerdict('ok')
      else alertDialog('运行面未变化', `当前已在运行面「${previous}」。`)
      return
    }
    const prepared = desktopPackagesInstalled(plugins, home, verdict.name)
    const action = choose({
      title: `切换到运行面「${verdict.name}」？`,
      message:
        `切换会重启后台服务：正在运行的回合会中断，窗口将在新运行面就绪后自动重载。会话、设置与凭据全部保留。`
        + (prepared ? '' : '\n\n首次切换到该运行面前，会先安装桌面组件（bridge 等六个包），可能需要一两分钟：期间旧运行面的会话不受影响，但窗口与桌面集成会暂停响应，请勿关闭应用。'),
      primary: '切换并重启',
      escape: '取消',
    })
    if (action !== 'primary') return
    try {
      runDesktopPluginInstall(runtime, plugins, home, root, verdict.name, 'unchecked')
    } catch (error) {
      alertDialog(
        '运行面准备失败',
        `桌面组件未能装入「${verdict.name}」，当前运行面没有改动。\n\n${message(error)}\n\n安装日志：${root}/logs/install.log`,
      )
      setE2eVerdict(`fail:prepare-${verdict.name}`)
      return
    }
    const port = await freePort()
    killSidecar()
    spawnSidecar(runtime, home, port, verdict.name)
    if (await waitReady(port)) {
      saveActiveSurface(root, home, verdict.name)
      console.log(`dsh-desktop: switched surface ${previous} -> ${verdict.name} on port ${String(port)}`)
      setE2eVerdict('ok')
      await reloadMainWindow(`http://127.0.0.1:${String(port)}`)
      return
    }
    // Rollback: the state file never moved, so the next boot is unaffected.
    killSidecar()
    const backPort = await freePort()
    spawnSidecar(runtime, home, backPort, previous)
    const restored = await waitReady(backPort)
    if (restored) {
      await reloadMainWindow(`http://127.0.0.1:${String(backPort)}`)
    }
    alertDialog(
      '切换运行面失败',
      `运行面「${verdict.name}」未在 120 秒内就绪。${restored ? `已回退到「${previous}」。` : `回退到「${previous}」也失败，请重启应用。`}\n\n日志：${path.join(home, 'logs')}`,
    )
    setE2eVerdict(`fail:ready-${verdict.name}`)
  } catch (error) {
    alertDialog('切换运行面失败', message(error))
    setE2eVerdict(`fail:${message(error)}`)
  } finally {
    switching = false
  }
}
