import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply } from '../src/index.ts'
import { apply as clientApply, inject } from '../src/client/index.ts'
import { sendButtonBusy, sendButtonVisible } from '../src/client/facts.ts'
import type { InputFacts, SessionFacts } from '../src/client/facts.ts'
import { SendWhileRunningButton } from '../src/client/send-button.tsx'
import { installSendWhileRunningCss, sendWhileRunningCss } from '../src/client/stylesheet.ts'

test('host half exports a loadable surface entry', () => {
  assert.equal(typeof apply, 'function')
})

test('client half exports a loadable plugin', () => {
  assert.equal(typeof clientApply, 'function')
  assert.ok(Array.isArray(inject) && inject.includes('slots'))
})

const idleSession: SessionFacts = { running: false, subagent: null, removed: false }
const runningSession: SessionFacts = { running: true, subagent: null, removed: false }
const continuableSession: SessionFacts = { running: true, subagent: { address: { mode: 'continuable' } }, removed: false }
const removedSession: SessionFacts = { running: true, subagent: null, removed: true }
const emptyInput: InputFacts = { draft: '', imageIds: [], phase: 'plain' }
const textInput: InputFacts = { draft: 'follow-up', imageIds: [], phase: 'plain' }
const whitespaceInput: InputFacts = { draft: '   \n\t ', imageIds: [], phase: 'plain' }
const imageOnlyInput: InputFacts = { draft: '', imageIds: ['img-1'], phase: 'plain' }

test('button is invisible while the session is not running', () => {
  assert.equal(sendButtonVisible(idleSession, textInput), false)
})

test('button is invisible without sendable draft content', () => {
  assert.equal(sendButtonVisible(runningSession, emptyInput), false)
  assert.equal(sendButtonVisible(runningSession, whitespaceInput), false)
})

test('button is visible for a running ordinary session with text or images', () => {
  assert.equal(sendButtonVisible(runningSession, textInput), true)
  assert.equal(sendButtonVisible(runningSession, imageOnlyInput), true)
})

test('button stays off continuable child sessions (Send is already their primary)', () => {
  assert.equal(sendButtonVisible(continuableSession, textInput), false)
})

test('button is invisible on removed sessions', () => {
  assert.equal(sendButtonVisible(removedSession, textInput), false)
})

test('busy mirrors the stock machine-busy phases only', () => {
  assert.equal(sendButtonBusy('adjudicating'), true)
  assert.equal(sendButtonBusy('submitting'), true)
  assert.equal(sendButtonBusy('plain'), false)
  assert.equal(sendButtonBusy('claimed'), false)
})

test('component renders null when shares are absent', () => {
  assert.equal(SendWhileRunningButton({}), null)
})

test('component renders null when the visibility terms fail', () => {
  assert.equal(SendWhileRunningButton({
    session: idleSession,
    input: textInput,
    inputActions: { submit() { /* unreachable in this render test */ } },
  }), null)
})

test('stylesheet targets only documented seams and stays scoped', () => {
  const css = sendWhileRunningCss()
  assert.match(css, /\.dsh-send-while-running \{/)
  assert.match(css, /\[data-slot="conversation\.input\.right"\]/)
  assert.match(css, /button:last-of-type/)
  assert.match(css, /var\(--dsw-alias-button-info-fill\)/)
  // No stock CSS-module class names: anchors are the data-slot seam and
  // element structure only, so a module-hash rename cannot break it.
  assert.doesNotMatch(css, /\._/)
})

test('stylesheet installer appends and removes the style element', () => {
  class StubStyle {
    textContent: string | null = null
    readonly attributes: Record<string, string> = {}
    removed = false
    setAttribute(name: string, value: string): void { this.attributes[name] = value }
    remove(): void { this.removed = true }
  }
  const appended: StubStyle[] = []
  const doc = {
    createElement(tagName: string): StubStyle {
      assert.equal(tagName, 'style')
      return new StubStyle()
    },
    head: { append(...nodes: unknown[]): void { appended.push(...(nodes as StubStyle[])) } },
  }
  const dispose = installSendWhileRunningCss(doc)
  assert.equal(appended.length, 1)
  assert.equal(appended[0].attributes['data-dsh-send-while-running'], '')
  assert.equal(appended[0].textContent, sendWhileRunningCss())
  assert.equal(appended[0].removed, false)
  dispose()
  assert.equal(appended[0].removed, true)
})
