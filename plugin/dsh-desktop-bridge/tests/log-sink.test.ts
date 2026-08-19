import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { Logger, type Exporter, type Message } from '@deepseek-ai/cordis'
import { logStamp, resolveLogDir, toRecord } from '../src/log-sink.ts'

describe('resolveLogDir', () => {
  it('lets DSH_WEB_LOG_DIR win and falls to $DSH_HOME/logs', () => {
    assert.equal(resolveLogDir({ DSH_WEB_LOG_DIR: '/custom', DSH_HOME: '/home' }), '/custom')
    assert.equal(resolveLogDir({ DSH_WEB_LOG_DIR: '', DSH_HOME: '/home' }), '/home/logs')
    assert.equal(resolveLogDir({}), join(homedir(), '.dsh', 'logs'))
  })
})

describe('logStamp', () => {
  it('formats yyyymmdd-HHMMSS with zero padding', () => {
    assert.equal(logStamp(new Date(2026, 0, 2, 3, 4, 5)), '20260102-030405')
    assert.equal(logStamp(new Date(2026, 11, 31, 23, 59, 58)), '20261231-235958')
  })
})

function message(args: unknown[]): Message {
  return { sn: 7, ts: Date.UTC(2026, 0, 2, 3, 4, 5), name: 'provider-balance', type: 'warn', level: 2, args }
}

describe('toRecord', () => {
  const exporter: Exporter = { colors: false, export: () => {} }

  it('projects the persisted fields and marks backfill records', () => {
    const text = Logger.format(exporter, message(['quota %s', 'low']))
    assert.deepEqual(toRecord(message(['quota %s', 'low']), text, true), {
      sn: 7,
      ts: '2026-01-02T03:04:05.000Z',
      name: 'provider-balance',
      type: 'warn',
      text: 'quota low',
      backfill: true,
    })
    assert.equal(toRecord(message(['x']), 'x', false).backfill, undefined)
  })

  it('serializes to a single line with no live Message internals', () => {
    const line = JSON.stringify(toRecord(message([new Error('boom')]), 'Error: boom', false))
    assert.equal(line.includes('\n'), false)
    assert.equal(line.includes('fiber'), false)
    assert.equal(line.includes('args'), false)
  })

  it('expands Error arguments to their stack text', () => {
    const text = Logger.format(exporter, message([new Error('boom')]))
    assert.match(text, /Error: boom/)
  })
})
