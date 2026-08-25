import { app } from 'electron'

import { ipcVerdict } from './ipc.ts'

export function watchE2eExit(): void {
  if (process.env.DSH_DESKTOP_E2E_EXIT !== '1') return
  const started = Date.now()
  const timer = setInterval(() => {
    const verdict = ipcVerdict()
    if (verdict === 'ok') {
      clearInterval(timer)
      console.log('DSH_E2E_OK')
      app.exit(0)
      return
    }
    if (verdict !== undefined && verdict.startsWith('fail:')) {
      clearInterval(timer)
      console.error(`DSH_E2E_FAIL ${verdict}`)
      app.exit(2)
      return
    }
    if (Date.now() - started > 120_000) {
      clearInterval(timer)
      console.error('DSH_E2E_TIMEOUT')
      app.exit(3)
    }
  }, 250)
}
