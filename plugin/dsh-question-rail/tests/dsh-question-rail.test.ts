import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply } from '../src/index.ts'
import { apply as clientApply, inject } from '../src/client/index.ts'
import {
  MIN_QUESTIONS, RAIL_MAX_HEIGHT, collectQuestions, questionText,
  railGeometry, railVisible, sameRailGeometry, type ChatNodeLike,
} from '../src/client/facts.ts'
import { installQuestionRailCss, questionRailCss, type InstalledStyle } from '../src/client/stylesheet.ts'

test('host half exports a loadable surface entry', () => {
  assert.equal(typeof apply, 'function')
})

test('client half exports a loadable plugin', () => {
  assert.equal(typeof clientApply, 'function')
  for (const required of ['slots', 'locale', 'timer']) {
    assert.ok(inject.includes(required), `inject includes ${required}`)
  }
})

test('questionText flattens text blocks and collapses whitespace', () => {
  assert.equal(questionText([
    { type: 'text', text: '  第一行\n带  空白 ' },
    { type: 'image', attachment: {} },
    { type: 'text', text: '第二段' },
  ]), '第一行 带 空白 第二段')
  assert.equal(questionText([{ type: 'image' }]), '')
  assert.equal(questionText(null), '')
  assert.equal(questionText('not-an-array'), '')
})

function node(kind: string, key: string, content: unknown, time = 0): ChatNodeLike {
  return { kind, key, data: { content, time } }
}

function sessionOf(nodes: readonly ChatNodeLike[]) {
  return { chat: { nodes: { values: () => nodes } } }
}

test('collectQuestions keeps user and steering nodes in order, skips the rest', () => {
  const questions = collectQuestions(sessionOf([
    node('user', 'u1', [{ type: 'text', text: '问题一' }], 100),
    node('assistant', 'a1', [{ type: 'text', text: '回答' }], 200),
    node('steering', 's1', [{ type: 'text', text: '插话' }], 300),
    node('context', 'c1', [{ type: 'text', text: '注入' }], 400),
  ]), key => key)
  assert.deepEqual(questions.map(q => q.key), ['u1', 's1'])
  assert.deepEqual(questions.map(q => q.time), [100, 300])
})

test('collectQuestions falls back for attachment-only messages and tolerates missing chat', () => {
  const [q] = collectQuestions(sessionOf([node('user', 'u1', [{ type: 'image' }])]), () => '[图片或附件]')
  assert.equal(q.text, '[图片或附件]')
  assert.deepEqual(collectQuestions(undefined, key => key), [])
  assert.deepEqual(collectQuestions({}, key => key), [])
})

test('railVisible gates below MIN_QUESTIONS', () => {
  assert.equal(railVisible(MIN_QUESTIONS - 1), false)
  assert.equal(railVisible(MIN_QUESTIONS), true)
  assert.equal(railVisible(MIN_QUESTIONS + 5), true)
})

test('railGeometry centers the capped rail on the body, inset from its left edge', () => {
  const body = { left: 300, top: 40, height: 800 }
  const anchor = { left: 340, top: 700, height: 0 }
  const g = railGeometry(body, anchor)
  assert.ok(g !== null)
  assert.equal(g.height, RAIL_MAX_HEIGHT)
  assert.equal(g.left, 300 + 6 - 340)
  assert.equal(g.top, Math.round(40 + 400 - 700 - RAIL_MAX_HEIGHT / 2))
})

test('railGeometry floors short bodies and rejects degenerate ones', () => {
  const short = railGeometry({ left: 0, top: 0, height: 100 }, { left: 0, top: 50, height: 0 })
  assert.ok(short !== null)
  assert.equal(short.height, 80)
  assert.equal(railGeometry({ left: 0, top: 0, height: 40 }, { left: 0, top: 0, height: 0 }), null)
})

test('sameRailGeometry treats equal placements as unchanged', () => {
  const g = { left: 1, top: 2, height: 3 }
  assert.equal(sameRailGeometry(g, g), true)
  assert.equal(sameRailGeometry(g, { ...g }), true)
  assert.equal(sameRailGeometry(g, { ...g, top: 4 }), false)
  assert.equal(sameRailGeometry(g, null), false)
  assert.equal(sameRailGeometry(null, null), true)
})

test('stylesheet installs a tagged style element and disposes it', () => {
  const removed: string[] = []
  const style: InstalledStyle = {
    setAttribute(name: string, value: string) {
      assert.equal(name, 'data-dsh-question-rail')
      assert.equal(value, '')
    },
    textContent: null,
    remove() { removed.push('style') },
  }
  const appended: unknown[] = []
  const dispose = installQuestionRailCss({
    createElement: () => style,
    head: { append: (...nodes: unknown[]) => { appended.push(...nodes) } },
  })
  assert.equal(appended.length, 1)
  assert.equal(style.textContent, questionRailCss())
  dispose()
  assert.deepEqual(removed, ['style'])
})

test('stylesheet keeps the overflow guard that clips the expanded card', () => {
  const css = questionRailCss()
  assert.match(css, /\.dsh-qr-rail \{[^}]*overflow: hidden/s)
  assert.match(css, /overscroll-behavior: contain/)
})
