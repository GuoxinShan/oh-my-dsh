import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createNotifyInbox,
  formatInboxAge,
  unreadBadge,
  unreadCount,
} from '../src/client/notify-inbox.ts'

const edge = { sessionId: 'a', kind: 'turn-done' as const, title: 'Alpha' }

describe('unread helpers', () => {
  it('counts and formats the compact badge', () => {
    assert.equal(unreadCount([]), 0)
    assert.equal(unreadBadge(0), '')
    assert.equal(unreadBadge(3), '3')
    assert.equal(unreadBadge(12), '9+')
  })
})

describe('formatInboxAge', () => {
  const copy = { justNow: '刚刚', minutesAgo: '{n} 分钟前', hoursAgo: '{n} 小时前' }
  it('picks just-now / minutes / hours', () => {
    assert.equal(formatInboxAge(1000, 2000, copy), '刚刚')
    assert.equal(formatInboxAge(0, 3 * 60_000, copy), '3 分钟前')
    assert.equal(formatInboxAge(0, 5 * 3_600_000, copy), '5 小时前')
  })
})

describe('createNotifyInbox', () => {
  it('keeps newest first, caps length, and tracks unread', () => {
    const inbox = createNotifyInbox(2)
    inbox.push(edge, 1)
    inbox.push({ ...edge, sessionId: 'b', title: 'Beta' }, 2)
    inbox.push({ ...edge, sessionId: 'c', title: 'Gamma' }, 3)
    const snap = inbox.getSnapshot()
    assert.equal(snap.items.length, 2)
    assert.equal(snap.items[0]?.title, 'Gamma')
    assert.equal(snap.unread, 2)
    inbox.markRead(snap.items[0]!.id)
    assert.equal(inbox.getSnapshot().unread, 1)
    inbox.markAllRead()
    assert.equal(inbox.getSnapshot().unread, 0)
    inbox.clear()
    assert.deepEqual(inbox.getSnapshot(), { items: [], unread: 0 })
  })
})
