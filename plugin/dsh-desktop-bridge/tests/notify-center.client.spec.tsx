// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { NotifyCenter } from '../src/client/notify-center.tsx'
import { createNotifyInbox } from '../src/client/notify-inbox.ts'
import { en, type DesktopBridgeKey } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const t = (key: DesktopBridgeKey, params?: Record<string, unknown>): string => {
  let text = en[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value))
  return text
}

test('opens the center and jumps to the session', () => {
  const inbox = createNotifyInbox()
  inbox.push({ sessionId: 's1', kind: 'turn-done', title: 'Alpha' }, Date.now())
  const opened: string[] = []
  render(<NotifyCenter inbox={inbox} openSession={(id) => { opened.push(id) }} t={t} />)
  fireEvent.click(screen.getByRole('button', { name: en['notify.center'] }))
  expect(screen.getByRole('dialog', { name: en['notify.center'] })).toBeTruthy()
  fireEvent.click(screen.getByText('Alpha'))
  expect(opened).toEqual(['s1'])
  expect(inbox.getSnapshot().unread).toBe(0)
  expect(screen.queryByRole('dialog')).toBeNull()
})
