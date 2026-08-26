import { dialog, app } from 'electron'

export type Choice = 'primary' | 'secondary' | 'escape'

export interface ChoiceSpec {
  title: string
  message: string
  primary: string
  secondary?: string
  escape: string
}

function automationEnabled(): boolean {
  return !app.isPackaged || process.env.DSH_DESKTOP_E2E_PROBE === '1'
}

export function alertDialog(title: string, message: string): void {
  if (automationEnabled() && process.env.DSH_DESKTOP_DIALOG_DEFAULT !== undefined) {
    console.error(`dsh-desktop: native alert suppressed for automation: ${title}: ${message}`)
    return
  }
  dialog.showMessageBoxSync({
    type: 'warning',
    title,
    message: title,
    detail: message,
    buttons: ['OK'],
    defaultId: 0,
  })
}

export function choose(spec: ChoiceSpec): Choice {
  if (automationEnabled()) {
    const value = process.env.DSH_DESKTOP_DIALOG_DEFAULT
    if (value === 'primary') return 'primary'
    if (value === 'secondary' && spec.secondary !== undefined) return 'secondary'
    if (value !== undefined) return 'escape'
  }
  const buttons = spec.secondary === undefined
    ? [spec.escape, spec.primary]
    : [spec.escape, spec.secondary, spec.primary]
  const result = dialog.showMessageBoxSync({
    type: 'question',
    title: spec.title,
    message: spec.title,
    detail: spec.message,
    buttons,
    cancelId: 0,
    defaultId: 0,
    noLink: true,
  })
  const selected = buttons[result]
  if (selected === spec.primary) return 'primary'
  if (spec.secondary !== undefined && selected === spec.secondary) return 'secondary'
  return 'escape'
}
