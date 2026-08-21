import assert from 'node:assert/strict'
import test from 'node:test'
import { createUpdateCoordinator } from '../src/client/update-coordinator.ts'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

test('coalesces concurrent checks and refreshes the successful memo only when forced', async () => {
  const first = deferred<unknown>()
  let calls = 0
  const updater = createUpdateCoordinator((command) => {
    assert.equal(command, 'dsh_desktop_check_update')
    calls += 1
    return calls === 1
      ? first.promise
      : Promise.resolve({ update: { version: '0.3.1', notes: 'new' } })
  })

  const initial = updater.checkUpdate()
  const shared = updater.checkUpdate(true)
  assert.equal(shared, initial)
  await Promise.resolve()
  assert.equal(calls, 1)
  assert.equal(updater.updateGeneration(), 1)

  first.resolve({ update: { version: '0.3.0', notes: 'first' } })
  assert.deepEqual(await initial, { version: '0.3.0', notes: 'first' })
  assert.equal(updater.checkUpdate(), initial)

  assert.deepEqual(await updater.checkUpdate(true), { version: '0.3.1', notes: 'new' })
  assert.equal(calls, 2)
  assert.equal(updater.updateGeneration(), 2)
})

test('serializes check, download, and confirmed install', async () => {
  const checkGate = deferred<unknown>()
  const order: string[] = []
  let checkCalls = 0
  const updater = createUpdateCoordinator((command) => {
    order.push(command)
    if (command === 'dsh_desktop_check_update') {
      checkCalls += 1
      return checkCalls === 1 ? checkGate.promise : Promise.resolve({ update: null })
    }
    if (command === 'dsh_desktop_download_update') return Promise.resolve()
    if (command === 'dsh_desktop_install_update') return Promise.resolve()
    throw new Error(`unexpected command: ${command}`)
  })

  const check = updater.checkUpdate(true)
  await Promise.resolve()
  const download = updater.downloadUpdate()
  assert.equal(updater.downloadUpdate(), download)
  await assert.rejects(updater.checkUpdate(true), /already in progress/)
  assert.deepEqual(order, ['dsh_desktop_check_update'])

  checkGate.resolve({ update: { version: '0.3.0', notes: '' } })
  await check
  await download
  assert.deepEqual(order, ['dsh_desktop_check_update', 'dsh_desktop_download_update'])

  const install = updater.installUpdate()
  assert.equal(updater.installUpdate(), install)
  await assert.rejects(updater.checkUpdate(true), /already in progress/)
  await assert.rejects(install, /resolved without restarting/)
  assert.deepEqual(order, [
    'dsh_desktop_check_update',
    'dsh_desktop_download_update',
    'dsh_desktop_install_update',
  ])

  assert.equal(await updater.checkUpdate(true), null)
  assert.equal(checkCalls, 2)
})

test('clears a rejected check so an ordinary retry reaches the shell', async () => {
  let calls = 0
  const updater = createUpdateCoordinator((command) => {
    assert.equal(command, 'dsh_desktop_check_update')
    calls += 1
    return calls === 1
      ? Promise.reject(new Error('offline'))
      : Promise.resolve({ update: null })
  })

  await assert.rejects(updater.checkUpdate(), /offline/)
  assert.equal(await updater.checkUpdate(), null)
  assert.equal(calls, 2)
})
